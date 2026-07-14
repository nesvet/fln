import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { VERSION } from "../src/version.js";

const originalFetch = globalThis.fetch;

function resolveTestAssetName(): string {
	const hostPlatform = platform();
	const hostArch = arch();

	if (hostPlatform === "darwin")
		return `fln-macos-${hostArch === "arm64" ? "arm64" : "x64"}.tar.gz`;

	if (hostPlatform === "linux")
		return `fln-linux-${hostArch === "arm64" ? "arm64" : "x64"}.tar.gz`;

	throw new Error(`Unsupported test platform: ${hostPlatform}`);
}

async function createTestArchive(): Promise<{
	archiveBytes: Buffer;
	checksum: string;
	assetName: string;
}> {
	const assetName = resolveTestAssetName();
	const tempDir = await mkdtemp(join(tmpdir(), "fln-upgrade-archive-"));
	const extractDir = join(tempDir, "extract");
	const archivePath = join(tempDir, assetName);
	await mkdir(extractDir, { recursive: true });
	const binaryPath = join(extractDir, "fln");
	await writeFile(binaryPath, "#!/bin/sh\necho test\n");
	await chmod(binaryPath, 0o755);
	const pack = spawnSync(
		"tar",
		["-czf", archivePath, "-C", extractDir, "fln"],
		{
			encoding: "utf8",
		},
	);
	if (pack.status !== 0) throw new Error(pack.stderr || "tar failed");

	const archiveBytes = Buffer.from(await readFile(archivePath));
	const checksum = createHash("sha256").update(archiveBytes).digest("hex");
	await rm(tempDir, { recursive: true, force: true });

	return { archiveBytes, checksum, assetName };
}

afterEach(async () => {
	globalThis.fetch = originalFetch;
	const { resetUpgradeTestHooks } = await import(
		"../src/cli/upgradeCommand.js"
	);
	resetUpgradeTestHooks();
});

describe("fln upgrade", () => {
	it("reports already up to date when latest matches VERSION", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ tag_name: VERSION }), {
				status: 200,
			})) as unknown as typeof fetch;

		const { runUpgradeCommand } = await import("../src/cli/upgradeCommand.js");
		const lines: string[] = [];
		const originalLog = console.info;
		console.info = (message?: string) => {
			if (message) lines.push(message);
		};

		try {
			await runUpgradeCommand();
		} finally {
			console.info = originalLog;
		}

		expect(lines.some((line) => line.includes("already up to date"))).toBe(
			true,
		);
	});

	it("strips accidental v prefix from tag_name before compare", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ tag_name: `v${VERSION}` }), {
				status: 200,
			})) as unknown as typeof fetch;

		const { runUpgradeCommand } = await import("../src/cli/upgradeCommand.js");
		const lines: string[] = [];
		const originalLog = console.info;
		console.info = (message?: string) => {
			if (message) lines.push(message);
		};

		try {
			await runUpgradeCommand();
		} finally {
			console.info = originalLog;
		}

		expect(lines.some((line) => line.includes("already up to date"))).toBe(
			true,
		);
	});

	it("throws UPGRADE_FAILED when release API fails", async () => {
		globalThis.fetch = (async () =>
			new Response("", { status: 500 })) as unknown as typeof fetch;

		const { runUpgradeCommand } = await import("../src/cli/upgradeCommand.js");

		await expect(runUpgradeCommand()).rejects.toMatchObject({
			code: "UPGRADE_FAILED",
		});
	});

	const canTestUpgrade = platform() === "darwin" || platform() === "linux";

	it.skipIf(!canTestUpgrade)(
		"downloads from tag URL without v prefix even when API returns v-tag",
		async () => {
			const installDir = await mkdtemp(join(tmpdir(), "fln-upgrade-install-"));
			const installPath = join(installDir, "fln");
			const { archiveBytes, checksum, assetName } = await createTestArchive();
			const requestedUrls: string[] = [];

			globalThis.fetch = (async (input: RequestInfo | URL) => {
				const url = String(input);
				requestedUrls.push(url);
				if (url.includes("/releases/latest"))
					return new Response(JSON.stringify({ tag_name: "v9.9.9" }), {
						status: 200,
					});
				if (url.endsWith(".sha256"))
					return new Response(`${checksum}  ${assetName}\n`, {
						status: 200,
					});
				if (url.endsWith(".tar.gz"))
					return new Response(new Uint8Array(archiveBytes), { status: 200 });

				return new Response("", { status: 404 });
			}) as unknown as typeof fetch;

			const { runUpgradeCommand, setUpgradeTestHooks } = await import(
				"../src/cli/upgradeCommand.js"
			);

			setUpgradeTestHooks({
				cosignAvailable: false,
				installTarget: installPath,
			});

			await runUpgradeCommand();

			expect(
				requestedUrls.some((url) => url.includes("/releases/download/9.9.9/")),
			).toBe(true);
			expect(
				requestedUrls.some((url) => url.includes("/releases/download/v9.9.9/")),
			).toBe(false);
		},
	);

	it.skipIf(!canTestUpgrade)(
		"skips cosign verification when cosign is unavailable",
		async () => {
			const installDir = await mkdtemp(join(tmpdir(), "fln-upgrade-install-"));
			const installPath = join(installDir, "fln");
			const { archiveBytes, checksum, assetName } = await createTestArchive();

			globalThis.fetch = (async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes("/releases/latest"))
					return new Response(JSON.stringify({ tag_name: "9.9.9" }), {
						status: 200,
					});
				if (url.endsWith(".sha256"))
					return new Response(`${checksum}  ${assetName}\n`, {
						status: 200,
					});
				if (url.endsWith(".tar.gz"))
					return new Response(new Uint8Array(archiveBytes), { status: 200 });

				return new Response("", { status: 404 });
			}) as unknown as typeof fetch;

			const { runUpgradeCommand, setUpgradeTestHooks } = await import(
				"../src/cli/upgradeCommand.js"
			);
			const stderr: string[] = [];
			const originalError = console.error;
			console.error = (message?: string) => {
				if (message) stderr.push(message);
			};

			setUpgradeTestHooks({
				cosignAvailable: false,
				installTarget: installPath,
			});

			try {
				await runUpgradeCommand();
			} finally {
				console.error = originalError;
			}

			expect(
				stderr.some((line) => line.includes("skipping signature verification")),
			).toBe(true);
		},
	);

	it.skipIf(!canTestUpgrade)(
		"throws UPGRADE_FAILED when cosign verification fails",
		async () => {
			const installDir = await mkdtemp(join(tmpdir(), "fln-upgrade-install-"));
			const installPath = join(installDir, "fln");
			const { archiveBytes, checksum, assetName } = await createTestArchive();

			globalThis.fetch = (async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes("/releases/latest"))
					return new Response(JSON.stringify({ tag_name: "9.9.9" }), {
						status: 200,
					});
				if (url.endsWith(".sha256"))
					return new Response(`${checksum}  ${assetName}\n`, {
						status: 200,
					});
				if (url.endsWith(".sig") || url.endsWith(".pem"))
					return new Response("asset", { status: 200 });
				if (url.endsWith(".tar.gz"))
					return new Response(new Uint8Array(archiveBytes), { status: 200 });

				return new Response("", { status: 404 });
			}) as unknown as typeof fetch;

			const { runUpgradeCommand, setUpgradeTestHooks } = await import(
				"../src/cli/upgradeCommand.js"
			);

			setUpgradeTestHooks({
				cosignAvailable: true,
				installTarget: installPath,
				spawnSync: ((command: string) => {
					if (command === "cosign")
						return { status: 1, stdout: "", stderr: "bad sig" } as ReturnType<
							typeof import("node:child_process").spawnSync
						>;
					if (command === "tar")
						return { status: 0, stdout: "", stderr: "" } as ReturnType<
							typeof import("node:child_process").spawnSync
						>;

					return { status: 1, stdout: "", stderr: "" } as ReturnType<
						typeof import("node:child_process").spawnSync
					>;
				}) as typeof import("node:child_process").spawnSync,
			});

			await expect(runUpgradeCommand()).rejects.toMatchObject({
				code: "UPGRADE_FAILED",
			});
		},
	);
});
