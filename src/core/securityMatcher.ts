const builtInSecurityPatterns = [
	".env",
	".env.*",
	"**/.env",
	"**/.env.*",
	"**/id_rsa",
	"**/id_rsa.pub",
	"**/*.pem",
	"**/*.key",
	"**/*.p12",
	"**/*.pfx",
	"**/*.kdbx",
	"**/*.keystore",
	"**/*.jks",
	"**/*.kdb",
	"**/*.keytab",
	"**/credentials.json",
	"**/secrets.json",
	"**/serviceAccount*.json",
	"**/gcloud-service-key*.json",
	"**/.npmrc",
	"**/.pypirc",
	"**/.netrc",
	"**/.aws/credentials",
	"**/.aws/config",
	"**/.ssh/config",
	"**/htpasswd",
	"**/.htpasswd",
	"**/.git-credentials",
];

const strictSecurityPatterns = [
	"**/.env.local",
	"**/.env.production",
	"**/.env.staging",
	"**/*_rsa",
	"**/*.asc",
	"**/*.gpg",
	"**/*.pgp",
	"**/kubeconfig",
	"**/.kube/config",
	"**/terraform.tfvars",
	"**/*.tfstate",
	"**/*.tfvars",
	"**/id_dsa",
	"**/known_hosts",
];

export type SecurityCheckMode = "default" | "strict";

const STRICT_HEADER_BYTES = 4096;
const DEFAULT_HEADER_BYTES = 512;
const STRICT_ENTROPY_THRESHOLD = 4.2;

export function getSecurityHeaderBytes(mode: SecurityCheckMode): number {
	return mode === "strict" ? STRICT_HEADER_BYTES : DEFAULT_HEADER_BYTES;
}

export function getSecurityPatterns(
	customPatterns: string[] = [],
	mode: SecurityCheckMode = "default",
): string[] {
	const patterns = [...builtInSecurityPatterns, ...customPatterns];
	if (mode === "strict") patterns.push(...strictSecurityPatterns);

	return patterns;
}

export function isSecuritySensitivePath(
	relativePath: string,
	patterns: string[],
): boolean {
	const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
	const baseName = normalized.split("/").pop() ?? normalized;

	for (const pattern of patterns) {
		const normalizedPattern = pattern.replaceAll("\\", "/").toLowerCase();

		if (normalizedPattern.includes("*")) {
			const regex = new RegExp(
				`^${normalizedPattern
					.replaceAll(/[$()+.[\\\]^{|}]/g, String.raw`\$&`)
					.replaceAll(/^\*\*\//g, "(?:.*/)?")
					.replaceAll("**/", "(?:.*/)?")
					.replaceAll("**", ".*")
					.replaceAll("*", "[^/]*")}$`,
			);
			if (regex.test(normalized)) return true;
		} else if (
			normalized === normalizedPattern ||
			normalized.endsWith(`/${normalizedPattern}`)
		)
			return true;
	}

	if (
		baseName === "secrets" ||
		baseName === "credentials" ||
		baseName.includes("private_key")
	)
		return true;

	return false;
}

const HIGH_ENTROPY_THRESHOLD = 4.5;
const minSecretLength = 20;
const maxSecretLength = 200;

const knownSecretPatterns: { pattern: RegExp; name: string }[] = [
	{ pattern: /AKIA[\dA-Z]{16}/, name: "AWS access key" },
	{ pattern: /AIza[\w-]{35}/, name: "Google API key" },
	{ pattern: /gh[prsu]_\w{36,}/, name: "GitHub token" },
	{ pattern: /sk_live_[\dA-Za-z]{24,}/, name: "Stripe secret key" },
	{ pattern: /xox[abprs]-[\dA-Za-z-]{10,}/, name: "Slack token" },
	{
		pattern: /AccountKey=[\d+/=A-Za-z]{88}/,
		name: "Azure storage account key",
	},
	{ pattern: /glpt-[\w-]{20,}/, name: "GitLab personal access token" },
	{ pattern: /(?:eyJ[\w-]+\.){2}[\w-]+/, name: "JWT token" },
	{
		pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
		name: "private key block",
	},
];

function shannonEntropy(s: string): number {
	if (s.length === 0) return 0;

	const freq = new Map<string, number>();
	for (const char of s) freq.set(char, (freq.get(char) ?? 0) + 1);

	let entropy = 0;
	for (const count of freq.values()) {
		const probability = count / s.length;
		entropy -= probability * Math.log2(probability);
	}

	return entropy;
}

function extractQuotedStrings(text: string): string[] {
	const matches: string[] = [];
	const pattern = /["'`]([\w+/=-]{20,200})["'`]/g;
	let match = pattern.exec(text);
	while (match !== null) {
		matches.push(match[1]);
		match = pattern.exec(text);
	}

	return matches;
}

export type SecretDetectionResult = {
	detected: boolean;
	detail?: string;
};

export function detectSecretsInBuffer(
	buffer: Buffer,
	bytesRead: number,
	options: { strict?: boolean } = {},
): SecretDetectionResult {
	if (bytesRead === 0) return { detected: false };

	const text = buffer.subarray(0, bytesRead).toString("utf8");
	const entropyThreshold = options.strict
		? STRICT_ENTROPY_THRESHOLD
		: HIGH_ENTROPY_THRESHOLD;

	for (const { pattern, name } of knownSecretPatterns)
		if (pattern.test(text))
			return { detected: true, detail: `${name} detected` };

	const quotedStrings = extractQuotedStrings(text);
	for (const candidate of quotedStrings)
		if (
			candidate.length >= minSecretLength &&
			candidate.length <= maxSecretLength
		) {
			const entropy = shannonEntropy(candidate);
			if (entropy > entropyThreshold)
				return {
					detected: true,
					detail: `high-entropy string detected (possible API key, entropy=${entropy.toFixed(1)})`,
				};
		}

	return { detected: false };
}
