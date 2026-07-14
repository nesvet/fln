import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fln } from "../src/api/index.js";
import { analyzeTextFileHeader } from "../src/core/fileContent.js";
import { collectSkipReasonCounts } from "../src/core/render/collectStats.js";
import {
	detectSecretsInBuffer,
	getSecurityPatterns,
	isSecuritySensitivePath,
} from "../src/core/securityMatcher.js";
import type { FileNode } from "../src/core/types.js";

function findFileNode(root: FileNode, name: string): FileNode | undefined {
	if (root.name === name) return root;
	for (const child of root.children ?? []) {
		const found = findFileNode(child, name);
		if (found) return found;
	}

	return undefined;
}

describe("isSecuritySensitivePath — extended patterns", () => {
	const patterns = getSecurityPatterns();

	it("detects .env at root", () => {
		expect(isSecuritySensitivePath(".env", patterns)).toBe(true);
	});

	it("detects .env in subdirectory", () => {
		expect(isSecuritySensitivePath("config/.env", patterns)).toBe(true);
	});

	it("detects .env.production", () => {
		expect(isSecuritySensitivePath(".env.production", patterns)).toBe(true);
	});

	it("detects .pem files", () => {
		expect(isSecuritySensitivePath("cert.pem", patterns)).toBe(true);
		expect(isSecuritySensitivePath("ssl/cert.pem", patterns)).toBe(true);
	});

	it("detects .p12 files", () => {
		expect(isSecuritySensitivePath("cert.p12", patterns)).toBe(true);
		expect(isSecuritySensitivePath("ssl/cert.p12", patterns)).toBe(true);
	});

	it("detects .pfx files", () => {
		expect(isSecuritySensitivePath("cert.pfx", patterns)).toBe(true);
	});

	it("detects .kdbx files", () => {
		expect(isSecuritySensitivePath("db.kdbx", patterns)).toBe(true);
	});

	it("detects .keystore files", () => {
		expect(isSecuritySensitivePath("app.keystore", patterns)).toBe(true);
	});

	it("detects .jks files", () => {
		expect(isSecuritySensitivePath("app.jks", patterns)).toBe(true);
	});

	it("detects .keytab files", () => {
		expect(isSecuritySensitivePath("kafka.keytab", patterns)).toBe(true);
	});

	it("detects serviceAccount*.json files", () => {
		expect(isSecuritySensitivePath("serviceAccount.json", patterns)).toBe(true);
		expect(isSecuritySensitivePath("serviceAccount-prod.json", patterns)).toBe(
			true,
		);
		expect(
			isSecuritySensitivePath("gcp/serviceAccount-prod.json", patterns),
		).toBe(true);
	});

	it("detects gcloud-service-key*.json files", () => {
		expect(isSecuritySensitivePath("gcloud-service-key.json", patterns)).toBe(
			true,
		);
		expect(
			isSecuritySensitivePath("gcloud-service-key-prod.json", patterns),
		).toBe(true);
	});

	it("detects .npmrc", () => {
		expect(isSecuritySensitivePath(".npmrc", patterns)).toBe(true);
		expect(isSecuritySensitivePath("config/.npmrc", patterns)).toBe(true);
	});

	it("detects .pypirc", () => {
		expect(isSecuritySensitivePath(".pypirc", patterns)).toBe(true);
	});

	it("detects .netrc", () => {
		expect(isSecuritySensitivePath(".netrc", patterns)).toBe(true);
	});

	it("detects .aws/credentials", () => {
		expect(isSecuritySensitivePath(".aws/credentials", patterns)).toBe(true);
	});

	it("detects .aws/config", () => {
		expect(isSecuritySensitivePath(".aws/config", patterns)).toBe(true);
	});

	it("detects .ssh/config", () => {
		expect(isSecuritySensitivePath(".ssh/config", patterns)).toBe(true);
	});

	it("detects htpasswd", () => {
		expect(isSecuritySensitivePath("htpasswd", patterns)).toBe(true);
		expect(isSecuritySensitivePath(".htpasswd", patterns)).toBe(true);
		expect(isSecuritySensitivePath("auth/htpasswd", patterns)).toBe(true);
	});

	it("detects .git-credentials", () => {
		expect(isSecuritySensitivePath(".git-credentials", patterns)).toBe(true);
	});

	it("detects credentials.json and secrets.json", () => {
		expect(isSecuritySensitivePath("credentials.json", patterns)).toBe(true);
		expect(isSecuritySensitivePath("secrets.json", patterns)).toBe(true);
		expect(isSecuritySensitivePath("config/credentials.json", patterns)).toBe(
			true,
		);
	});

	it("does not flag normal source files", () => {
		expect(isSecuritySensitivePath("src/index.ts", patterns)).toBe(false);
		expect(isSecuritySensitivePath("package.json", patterns)).toBe(false);
		expect(isSecuritySensitivePath("README.md", patterns)).toBe(false);
		expect(isSecuritySensitivePath("config/app.ts", patterns)).toBe(false);
	});

	it("respects custom patterns", () => {
		const custom = [...patterns, "**/*.kubeconfig"];
		expect(isSecuritySensitivePath("prod.kubeconfig", custom)).toBe(true);
		expect(isSecuritySensitivePath("prod.kubeconfig", patterns)).toBe(false);
	});
});

describe("detectSecretsInBuffer — known secret formats", () => {
	it("detects AWS access key ID", () => {
		const buffer = Buffer.from('aws_key = "AKIAIOSFODNN7EXAMPLE"\n');
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("AWS access key");
	});

	it("detects Google API key", () => {
		// Assembled at runtime so push-protection scanners do not see a literal.
		const googleKey = ["AIza", "SyD_wAqVsTc5pJOzKpZcQpBxTQ3qHrJzV5c"].join("");
		const buffer = Buffer.from(`google_key = "${googleKey}"\n`);
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("Google API key");
	});

	it("detects GitHub token", () => {
		const githubToken = ["ghp", "_1234567890abcdefghijklmnopqrstuvwxyz123456"].join(
			"",
		);
		const buffer = Buffer.from(`token = "${githubToken}"\n`);
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("GitHub token");
	});

	it("detects Stripe secret key", () => {
		const stripeKey = ["sk", "live", "1234567890abcdefghijklmnopqrstu"].join("_");
		const buffer = Buffer.from(`stripe_key = "${stripeKey}"\n`);
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("Stripe secret key");
	});

	it("detects Slack token", () => {
		const slackToken = ["xox", "b-1234567890-abcdefghijklmnopqrstuvwxyz"].join("");
		const buffer = Buffer.from(`slack = "${slackToken}"\n`);
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("Slack token");
	});

	it("detects Azure storage account key", () => {
		const key = "A".repeat(88);
		const buffer = Buffer.from(`AccountKey=${key}\n`);
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("Azure storage account key");
	});

	it("detects GitLab personal access token", () => {
		const buffer = Buffer.from('token = "glpt-abcdefghijklmnopqrst"\n');
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("GitLab personal access token");
	});

	it("detects JWT token", () => {
		const buffer = Buffer.from(
			'auth = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"\n',
		);
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("JWT token");
	});

	it("detects PEM private key block", () => {
		const buffer = Buffer.from(
			"-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n",
		);
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("private key block");
	});

	it("detects OPENSSH private key block", () => {
		const buffer = Buffer.from("-----BEGIN OPENSSH PRIVATE KEY-----\n...");
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("private key block");
	});
});

describe("detectSecretsInBuffer — entropy detection", () => {
	it("detects high-entropy quoted string", () => {
		const buffer = Buffer.from(
			'api_key = "x9Kf2mQ7vR4pL8nA3wE6bD1cT5jH0gY2sU4iN6oP"\n',
		);
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(true);
		expect(result.detail).toContain("high-entropy");
	});

	it("does not flag short quoted strings", () => {
		const buffer = Buffer.from('name = "hello"\n');
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(false);
	});

	it("does not flag normal code content", () => {
		const buffer = Buffer.from(
			'const greeting = "Hello, World!";\nconsole.log(greeting);\n',
		);
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(false);
	});

	it("does not flag low-entropy long strings (repeated chars)", () => {
		const buffer = Buffer.from('const s = "aaaaaaaaaaaaaaaaaaaaaaaa"\n');
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(false);
	});

	it("does not flag URLs", () => {
		const buffer = Buffer.from(
			'const url = "https://api.example.com/v1/users"\n',
		);
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(false);
	});

	it("does not flag file paths", () => {
		const buffer = Buffer.from('const path = "/usr/local/bin/node"\n');
		const result = detectSecretsInBuffer(buffer, buffer.length);
		expect(result.detected).toBe(false);
	});

	it("returns empty for empty buffer", () => {
		const buffer = Buffer.alloc(0);
		const result = detectSecretsInBuffer(buffer, 0);
		expect(result.detected).toBe(false);
	});
});

describe("analyzeTextFileHeader — secret detection integration", () => {
	it("returns secretDetail for file with AWS key in header", () => {
		const buffer = Buffer.from('aws_access_key_id = "AKIAIOSFODNN7EXAMPLE"\n');
		const result = analyzeTextFileHeader(buffer, buffer.length);
		expect(result.secretDetail).toBeDefined();
		expect(result.secretDetail).toContain("AWS");
		expect(result.isBinary).toBe(false);
	});

	it("returns secretDetail for file with high-entropy secret in header", () => {
		const buffer = Buffer.from(
			'API_KEY = "x9Kf2mQ7vR4pL8nA3wE6bD1cT5jH0gY2sU4iN6oP"\n',
		);
		const result = analyzeTextFileHeader(buffer, buffer.length);
		expect(result.secretDetail).toBeDefined();
		expect(result.secretDetail).toContain("high-entropy");
	});

	it("does not return secretDetail for normal source code", () => {
		const buffer = Buffer.from(
			'import { readFile } from "node:fs/promises";\n\n',
		);
		const result = analyzeTextFileHeader(buffer, buffer.length);
		expect(result.secretDetail).toBeUndefined();
	});

	it("does not return secretDetail for binary files", () => {
		const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
		const result = analyzeTextFileHeader(buffer, buffer.length);
		expect(result.isBinary).toBe(true);
		expect(result.secretDetail).toBeUndefined();
	});
});

describe("security — end-to-end entropy detection", () => {
	it("flags file with embedded AWS key as security skip", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-security-entropy-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "entropy-test", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(
			join(input, "config.ts"),
			'const awsKey = "AKIAIOSFODNN7EXAMPLE";\nexport default awsKey;\n',
		);
		await writeFile(join(input, "ok.txt"), "ok\n");

		const result = await fln({
			input,
			output: join(input, "out", "out.md"),
			overwrite: true,
			logLevel: "silent",
		});

		expect(result.filesIncluded).toBeGreaterThan(0);
	});

	it("flags file with high-entropy string as security skip", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-security-high-entropy-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "entropy-test2", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(
			join(input, "secrets.ts"),
			'export const API_KEY = "x9Kf2mQ7vR4pL8nA3wE6bD1cT5jH0gY2sU4iN6oP";\n',
		);
		await writeFile(
			join(input, "safe.ts"),
			'export const greeting = "Hello, World!";\n',
		);

		const inspected = await fln.inspect({
			input,
			format: "json",
			logLevel: "silent",
		});

		const secretsNode = findFileNode(inspected.root, "secrets.ts");
		expect(secretsNode?.skipReason).toBe("security");
		expect(secretsNode?.securityDetail).toBeDefined();

		const safeNode = findFileNode(inspected.root, "safe.ts");
		expect(safeNode?.skipReason).toBeUndefined();

		const skipCounts = collectSkipReasonCounts(inspected.root);
		expect(skipCounts.get("security")).toBeGreaterThanOrEqual(1);
	});

	it("does not flag normal TypeScript source files", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-security-false-positive-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "fp-test", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(
			join(input, "index.ts"),
			'import { readFile } from "node:fs/promises";\n\nasync function main(): Promise<void> {\n\tconst data = await readFile("./data.txt", "utf8");\n\tconsole.log(data);\n}\n\nvoid main();\n',
		);
		await writeFile(
			join(input, "utils.ts"),
			"export function add(a: number, b: number): number {\n\treturn a + b;\n}\n",
		);

		const inspected = await fln.inspect({
			input,
			format: "json",
			logLevel: "silent",
		});

		const indexNode = findFileNode(inspected.root, "index.ts");
		expect(indexNode?.skipReason).toBeUndefined();

		const utilsNode = findFileNode(inspected.root, "utils.ts");
		expect(utilsNode?.skipReason).toBeUndefined();

		const skipCounts = collectSkipReasonCounts(inspected.root);
		expect(skipCounts.get("security") ?? 0).toBe(0);
	});
});
