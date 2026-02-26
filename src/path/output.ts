export function hasTrailingSeparator(path: string): boolean {
	return /[/\\]+$/.test(path);
}

export function getNullishOutput(): string {
	return process.platform === "win32" ? "nul" : "/dev/null";
}

export function isNullishOutput(path: string): boolean {
	return path === "/dev/null" || path === "nul";
}

export function isStdoutOutput(path: string): boolean {
	return path === "-";
}
