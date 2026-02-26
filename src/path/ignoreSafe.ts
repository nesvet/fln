import ignore from "ignore";
import { toCanonicalRelative } from "./canonical.js";
import { toPosixPath } from "./posix.js";


export function toIgnoreSafePath(relativePath: string, base: string): string | null {
	const hasTrailingSlash = relativePath.endsWith("/") && relativePath !== "/";
	const pathWithoutSlash = hasTrailingSlash ? relativePath.slice(0, -1) : relativePath;
	
	const canonical = toCanonicalRelative(pathWithoutSlash, base);
	if (canonical === null)
		return null;
	
	const posix = toPosixPath(canonical);
	const result = hasTrailingSlash ? `${posix}/` : posix;
	if (!ignore.isPathValid(result))
		return null;
	
	return result;
}
