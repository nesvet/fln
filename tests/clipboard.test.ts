import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	copyFileToClipboard,
	DEFAULT_COPY_MAX_BYTES,
	resolveClipboardCommand,
	resolveEffectiveCopyMaxBytes,
	setClipboardCopyRunnerForTests,
} from "../src/infra/clipboard.js";
import type { FlnError } from "../src/infra/flnError.js";

afterEach(() => {
	setClipboardCopyRunnerForTests(undefined);
	delete process.env.FLN_COPY_MAX_BYTES;
});

describe("resolveEffectiveCopyMaxBytes", () => {
	it("defaults to 32 MiB", () => {
		expect(resolveEffectiveCopyMaxBytes(0)).toBe(DEFAULT_COPY_MAX_BYTES);
	});

	it("respects maxTotalSize when lower", () => {
		expect(resolveEffectiveCopyMaxBytes(1024)).toBe(1024);
	});

	it("respects FLN_COPY_MAX_BYTES", () => {
		process.env.FLN_COPY_MAX_BYTES = "4096";
		expect(resolveEffectiveCopyMaxBytes(0)).toBe(4096);
	});
});

describe("resolveClipboardCommand", () => {
	it("returns a command when a clipboard utility is available", () => {
		const command = resolveClipboardCommand();
		if (process.platform === "darwin" || process.platform === "win32")
			expect(command).not.toBeNull();
		// Linux CI often has neither DISPLAY/WAYLAND nor wl-copy/xclip.
		else if (process.platform === "linux")
			expect(command === null || typeof command.command === "string").toBe(
				true,
			);
		else expect(command).toBeNull();
	});
});

describe("copyFileToClipboard", () => {
	it("rejects files larger than maxBytes", async () => {
		const directory = await mkdtemp(join(tmpdir(), "fln-clipboard-large-"));
		const filePath = join(directory, "big.txt");
		await writeFile(filePath, "x".repeat(32));

		try {
			await expect(
				copyFileToClipboard(filePath, { maxBytes: 16 }),
			).rejects.toMatchObject({
				code: "CLIPBOARD_TOO_LARGE",
			} satisfies Partial<FlnError>);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("uses injected runner on success", async () => {
		const directory = await mkdtemp(join(tmpdir(), "fln-clipboard-ok-"));
		const filePath = join(directory, "ok.txt");
		await writeFile(filePath, "hello clipboard\n");
		let copiedPath = "";

		setClipboardCopyRunnerForTests((path) => {
			copiedPath = path;

			return Promise.resolve();
		});

		try {
			await copyFileToClipboard(filePath, { maxBytes: DEFAULT_COPY_MAX_BYTES });
			expect(copiedPath).toBe(filePath);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("includes WSL hint when no clipboard utility on Linux WSL", async () => {
		if (process.platform !== "linux") return;

		const previousWslDistro = process.env.WSL_DISTRO_NAME;
		const previousDisplay = process.env.DISPLAY;
		const previousWayland = process.env.WAYLAND_DISPLAY;
		process.env.WSL_DISTRO_NAME = "test";
		delete process.env.DISPLAY;
		delete process.env.WAYLAND_DISPLAY;

		const directory = await mkdtemp(join(tmpdir(), "fln-clipboard-wsl-"));
		const filePath = join(directory, "wsl.txt");
		await writeFile(filePath, "x");

		try {
			if (resolveClipboardCommand() !== null) return;

			try {
				await copyFileToClipboard(filePath, {
					maxBytes: DEFAULT_COPY_MAX_BYTES,
				});
				expect.unreachable("Expected CLIPBOARD_UNAVAILABLE");
			} catch (error) {
				expect(error).toMatchObject({
					code: "CLIPBOARD_UNAVAILABLE",
					hint: expect.stringContaining("clip.exe"),
				} satisfies Partial<FlnError>);
			}
		} finally {
			if (previousWslDistro === undefined) delete process.env.WSL_DISTRO_NAME;
			else process.env.WSL_DISTRO_NAME = previousWslDistro;
			if (previousDisplay === undefined) delete process.env.DISPLAY;
			else process.env.DISPLAY = previousDisplay;
			if (previousWayland === undefined) delete process.env.WAYLAND_DISPLAY;
			else process.env.WAYLAND_DISPLAY = previousWayland;
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("throws CLIPBOARD_UNAVAILABLE when runner fails", async () => {
		const directory = await mkdtemp(join(tmpdir(), "fln-clipboard-fail-"));
		const filePath = join(directory, "fail.txt");
		await writeFile(filePath, "x");

		setClipboardCopyRunnerForTests(() =>
			Promise.reject(new Error("spawn failed")),
		);

		try {
			await expect(
				copyFileToClipboard(filePath, { maxBytes: DEFAULT_COPY_MAX_BYTES }),
			).rejects.toMatchObject({
				code: "CLIPBOARD_UNAVAILABLE",
			} satisfies Partial<FlnError>);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
