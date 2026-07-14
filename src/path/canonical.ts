import { relative, resolve } from "node:path";
import { toPosixPath } from "./posix.js";

export function toCanonicalRelative(path: string, base: string): string | null {
	if (!base || base === "") return null;

	const resolved = resolve(base, path);
	const relativePath = relative(base, resolved);
	const withForwardSlash = toPosixPath(relativePath);
	const withoutLeadingDot = withForwardSlash.startsWith("./")
		? withForwardSlash.slice(2)
		: withForwardSlash;

	if (withoutLeadingDot.startsWith("../") || withoutLeadingDot === "..")
		return null;

	return withoutLeadingDot === "" ? "" : withoutLeadingDot;
}
