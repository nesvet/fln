import { isAbsolute, relative, resolve } from "node:path";
import { toIgnoreSafePath } from "./ignoreSafe.js";
import { toPosixPath } from "./posix.js";

export function stripLeadingDotSlash(path: string): string {
	return path.startsWith("./") ? path.slice(2) : path;
}

export function toDisplayPath(relativePath: string, base: string): string {
	const safe = toIgnoreSafePath(relativePath, base);

	return safe ?? (stripLeadingDotSlash(toPosixPath(relativePath)) || ".");
}

/** Absolute input under cwd → portable relative (`.` / `src/...`); else absolute. */
export function displayInputPath(input: string, cwd = process.cwd()): string {
	const absolute = resolve(cwd, input);
	const rel = relative(cwd, absolute);
	if (rel === "") return ".";
	if (!rel.startsWith("..") && !isAbsolute(rel)) return toPosixPath(rel);

	return absolute;
}
