import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { formatByteSize } from "../core/size.js";
import { flnError } from "./flnError.js";

export const DEFAULT_COPY_MAX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_COPY_TIMEOUT_MS = 30_000;

export type CopyToClipboardOptions = {
	maxBytes: number;
	timeoutMs?: number;
};

type ClipboardCommand = {
	command: string;
	args: string[];
};

type CopySubprocessRunner = (
	filePath: string,
	command: ClipboardCommand,
	timeoutMs: number,
) => Promise<void>;

let copySubprocessRunner: CopySubprocessRunner | undefined;

function isWslEnvironment(): boolean {
	return (
		process.platform === "linux" &&
		(process.env.WSL_DISTRO_NAME !== undefined ||
			process.env.WSL_INTEROP !== undefined)
	);
}

function clipboardUnavailableHint(): string {
	if (isWslEnvironment())
		return "On WSL, use: fln --stdout | clip.exe (or fln -o out.md).";
	if (process.platform === "linux")
		return "Install wl-copy (Wayland) or xclip/xsel (X11), or use fln --stdout | wl-copy.";

	return "Use fln -o out.md or fln --stdout | pbcopy.";
}

function clipboardCopyFailedHint(): string {
	if (isWslEnvironment())
		return "On WSL, use: fln --stdout | clip.exe (or fln -o out.md).";

	return "Use fln -o out.md or fln --stdout with your platform copy command.";
}

function commandExists(command: string): boolean {
	const lookup = process.platform === "win32" ? "where" : "which";
	const result = spawnSync(lookup, [command], { stdio: "ignore" });

	return result.status === 0;
}

function resolveLinuxClipboardCommand(): ClipboardCommand | null {
	const candidates: ClipboardCommand[] = [];
	if (process.env.WAYLAND_DISPLAY)
		candidates.push({ command: "wl-copy", args: [] });
	if (process.env.DISPLAY)
		candidates.push(
			{ command: "xclip", args: ["-selection", "clipboard"] },
			{ command: "xsel", args: ["--clipboard", "--input"] },
		);

	for (const candidate of candidates)
		if (commandExists(candidate.command)) return candidate;

	return null;
}

export function resolveClipboardCommand(): ClipboardCommand | null {
	if (process.platform === "darwin")
		return commandExists("pbcopy") ? { command: "pbcopy", args: [] } : null;
	if (process.platform === "win32")
		return commandExists("clip") ? { command: "clip", args: [] } : null;
	if (process.platform === "linux") return resolveLinuxClipboardCommand();

	return null;
}

export function resolveEffectiveCopyMaxBytes(
	maxTotalSizeBytes: number,
): number {
	const fromEnv = process.env.FLN_COPY_MAX_BYTES;
	let cap = DEFAULT_COPY_MAX_BYTES;
	if (fromEnv !== undefined) {
		const parsed = Number.parseInt(fromEnv, 10);
		if (!Number.isNaN(parsed) && parsed > 0) cap = parsed;
	}
	if (maxTotalSizeBytes > 0) cap = Math.min(cap, maxTotalSizeBytes);

	return cap;
}

async function runCopySubprocess(
	filePath: string,
	clipboardCommand: ClipboardCommand,
	timeoutMs: number,
): Promise<void> {
	const child = spawn(clipboardCommand.command, clipboardCommand.args, {
		stdio: ["pipe", "ignore", "pipe"],
	});
	let stderr = "";
	child.stderr?.on("data", (chunk: Buffer | string) => {
		stderr += chunk.toString();
	});

	const timeoutError = new Error(
		`Clipboard copy timed out after ${timeoutMs}ms`,
	);
	let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

	try {
		await Promise.race([
			(async () => {
				await pipeline(createReadStream(filePath), child.stdin);
				child.stdin?.end();
				await new Promise<void>((resolve, reject) => {
					child.once("error", reject);
					child.once("close", (code) => {
						if (code === 0) {
							resolve();

							return;
						}
						reject(
							new Error(
								stderr.trim() ||
									`${clipboardCommand.command} exited with code ${code ?? "unknown"}`,
							),
						);
					});
				});
			})(),
			new Promise<void>((_, reject) => {
				timeoutHandle = setTimeout(() => {
					child.kill();
					reject(timeoutError);
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
	}
}

export async function copyFileToClipboard(
	filePath: string,
	options: CopyToClipboardOptions,
): Promise<void> {
	const fileStats = await stat(filePath);
	if (fileStats.size > options.maxBytes)
		throw flnError(
			"CLIPBOARD_TOO_LARGE",
			`Output is ${formatByteSize(fileStats.size)} — exceeds clipboard limit of ${formatByteSize(options.maxBytes)}.`,
			{
				hint: "Use fln -o out.md to write a file, or fln --stdout | pbcopy for large snapshots.",
				path: filePath,
			},
		);

	const runner = copySubprocessRunner ?? runCopySubprocess;
	const clipboardCommand = resolveClipboardCommand();
	// Test runners may inject a no-op without a real clipboard utility (e.g. Linux CI).
	if (!clipboardCommand && copySubprocessRunner === undefined)
		throw flnError(
			"CLIPBOARD_UNAVAILABLE",
			"No clipboard utility found for this environment.",
			{ hint: clipboardUnavailableHint() },
		);

	try {
		await runner(
			filePath,
			clipboardCommand ?? { command: "true", args: [] },
			options.timeoutMs ?? DEFAULT_COPY_TIMEOUT_MS,
		);
	} catch (error) {
		if (error instanceof Error && error.message.includes("timed out"))
			throw flnError("CLIPBOARD_UNAVAILABLE", error.message, {
				hint: isWslEnvironment()
					? "On WSL, use: fln --stdout | clip.exe (or fln -o out.md for very large output)."
					: "Try fln -o out.md for very large output.",
			});

		throw flnError(
			"CLIPBOARD_UNAVAILABLE",
			error instanceof Error ? error.message : "Clipboard copy failed.",
			{ hint: clipboardCopyFailedHint() },
		);
	}
}

export function setClipboardCopyRunnerForTests(
	runner: CopySubprocessRunner | undefined,
): void {
	copySubprocessRunner = runner;
}
