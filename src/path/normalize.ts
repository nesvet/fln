import { toIgnoreSafePath } from "./ignoreSafe.js";
import { toPosixPath } from "./posix.js";


export function stripLeadingDotSlash(path: string): string {
	return path.startsWith("./") ? path.slice(2) : path;
}

export function toDisplayPath(relativePath: string, base: string): string {
	const safe = toIgnoreSafePath(relativePath, base);
	
	return safe ?? (stripLeadingDotSlash(toPosixPath(relativePath)) || ".");
}
