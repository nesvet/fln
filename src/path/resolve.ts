import { isAbsolute, resolve } from "node:path";

export function resolveFromBase(
	path: string | null | undefined,
	base: string,
): string {
	if (path === null || path === undefined) return base;

	return isAbsolute(path) ? path : resolve(base, path);
}
