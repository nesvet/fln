export function hasTrailingSeparator(path: string): boolean {
	return /[/\\]+$/.test(path);
}

export function isNullishOutput(path: string): boolean {
	return path === "/dev/null" || path === "nul";
}
