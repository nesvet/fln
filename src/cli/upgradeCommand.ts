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
import { flnError } from "../infra/flnError.js";
import { VERSION } from "../version.js";

const repository = "nesvet/fln";

type UpgradeTestHooks = {
	cosignAvailable?: boolean;
	spawnSync?: typeof spawnSync;
	installTarget?: string;
};

let upgradeTestHooks: UpgradeTestHooks = {};

export function setUpgradeTestHooks(hooks: UpgradeTestHooks): void {
	upgradeTestHooks = hooks;
}

export function resetUpgradeTestHooks(): void {
	upgradeTestHooks = {};
}

function resolvePlatformAsset(): { platform: string; architecture: string } {
	const hostPlatform = platform();
	const hostArch = arch();

	if (hostPlatform === "darwin")
		return {
			platform: "macos",
			architecture: hostArch === "arm64" ? "arm64" : "x64",
		};

	if (hostPlatform === "linux")
		return {
			platform: "linux",
			architecture: hostArch === "arm64" ? "arm64" : "x64",
		};

	throw flnError(
		"UPGRADE_FAILED",
		`Unsupported platform for fln upgrade: ${hostPlatform}`,
	);
}

async function fetchLatestVersion(): Promise<string> {
	const response = await fetch(
		`https://api.github.com/repos/${repository}/releases/latest`,
	);
	if (!response.ok)
		throw flnError(
			"UPGRADE_FAILED",
			`Failed to fetch latest release: HTTP ${response.status}`,
		);

	const payload = (await response.json()) as { tag_name?: string };
	const tag = payload.tag_name?.replace(/^v/, "");
	if (!tag) throw flnError("UPGRADE_FAILED", "Latest release tag is missing.");

	return tag;
}

function resolveInstallTarget(): string {
	if (upgradeTestHooks.installTarget) return upgradeTestHooks.installTarget;

	const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
	const installDir = process.env.INSTALL_DIR ?? join(home, ".local", "bin");

	return join(installDir, "fln");
}

function isCosignAvailable(): boolean {
	if (upgradeTestHooks.cosignAvailable !== undefined)
		return upgradeTestHooks.cosignAvailable;

	const which = platform() === "win32" ? "where" : "which";

	return (
		(upgradeTestHooks.spawnSync ?? spawnSync)(which, ["cosign"], {
			encoding: "utf8",
		}).status === 0
	);
}

async function verifyCosignSignature(
	archivePath: string,
	assetName: string,
	latest: string,
): Promise<void> {
	const baseUrl = `https://github.com/${repository}/releases/download/${latest}/${assetName}`;
	const [signatureResponse, certificateResponse] = await Promise.all([
		fetch(`${baseUrl}.sig`),
		fetch(`${baseUrl}.pem`),
	]);

	if (!signatureResponse.ok || !certificateResponse.ok)
		throw flnError(
			"UPGRADE_FAILED",
			"Signature assets are missing from the latest release.",
		);

	const tempDir = await mkdtemp(join(tmpdir(), "fln-upgrade-sig-"));
	const signaturePath = join(tempDir, `${assetName}.sig`);
	const certificatePath = join(tempDir, `${assetName}.pem`);

	try {
		await writeFile(
			signaturePath,
			Buffer.from(await signatureResponse.arrayBuffer()),
		);
		await writeFile(
			certificatePath,
			Buffer.from(await certificateResponse.arrayBuffer()),
		);

		const verify = (upgradeTestHooks.spawnSync ?? spawnSync)(
			"cosign",
			[
				"verify-blob",
				"--certificate",
				certificatePath,
				"--signature",
				signaturePath,
				"--certificate-identity",
				`https://github.com/${repository}/.github/workflows/release-binary.yaml@refs/tags/${latest}`,
				"--certificate-oidc-issuer",
				"https://token.actions.githubusercontent.com",
				archivePath,
			],
			{ encoding: "utf8" },
		);

		if (verify.status !== 0)
			throw flnError("UPGRADE_FAILED", "Signature verification failed.");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export async function runUpgradeCommand(): Promise<void> {
	const latest = await fetchLatestVersion();
	if (latest === VERSION) {
		console.info(`fln is already up to date (${VERSION}).`);
		return;
	}

	const { platform: assetPlatform, architecture } = resolvePlatformAsset();
	const assetName = `fln-${assetPlatform}-${architecture}.tar.gz`;
	const downloadUrl = `https://github.com/${repository}/releases/download/${latest}/${assetName}`;
	const checksumUrl = `${downloadUrl}.sha256`;

	const [archiveResponse, checksumResponse] = await Promise.all([
		fetch(downloadUrl),
		fetch(checksumUrl),
	]);

	if (!archiveResponse.ok || !checksumResponse.ok)
		throw flnError(
			"UPGRADE_FAILED",
			`Failed to download release assets for ${latest}.`,
		);

	const archiveBuffer = Buffer.from(await archiveResponse.arrayBuffer());
	const expectedChecksum = (await checksumResponse.text())
		.trim()
		.split(/\s+/)[0];
	const actualChecksum = createHash("sha256")
		.update(archiveBuffer)
		.digest("hex");

	if (expectedChecksum !== actualChecksum)
		throw flnError("UPGRADE_FAILED", "Checksum verification failed.");

	const tempDir = await mkdtemp(join(tmpdir(), "fln-upgrade-"));
	const archivePath = join(tempDir, assetName);
	const extractDir = join(tempDir, "extract");

	try {
		await writeFile(archivePath, archiveBuffer);

		if (isCosignAvailable())
			await verifyCosignSignature(archivePath, assetName, latest);
		else
			console.error(
				"fln: cosign not found; skipping signature verification (sha256 only).",
			);

		await mkdir(extractDir, { recursive: true });
		const extractResult = (upgradeTestHooks.spawnSync ?? spawnSync)(
			"tar",
			["-xzf", archivePath, "-C", extractDir],
			{
				encoding: "utf8",
			},
		);
		if (extractResult.status !== 0)
			throw flnError(
				"UPGRADE_FAILED",
				extractResult.stderr?.trim() || "Failed to extract release archive.",
			);

		const binaryPath = join(extractDir, "fln");
		const installPath = resolveInstallTarget();
		const binary = await readFile(binaryPath);
		await writeFile(installPath, binary);
		await chmod(installPath, 0o755);

		console.info(`Upgraded fln ${VERSION} → ${latest} at ${installPath}`);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}
