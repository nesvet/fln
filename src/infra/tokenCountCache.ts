import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TokenModel } from "./tokenBudget.js";
import { countTextTokensAsync } from "./tokenBudget.js";

type CacheEntry = {
	tokenCount: number;
};

type CacheFile = Record<string, CacheEntry>;

const cacheDir = join(
	process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
	"fln",
);
const cachePath = join(cacheDir, "token-count-cache.json");

let memoryCache: CacheFile | undefined;
let loadPromise: Promise<CacheFile> | undefined;

function buildCacheKey(
	path: string,
	mtimeMs: number | undefined,
	size: number,
	tokenModel: TokenModel,
): string {
	return createHash("sha1")
		.update(`${path}\0${mtimeMs ?? 0}\0${size}\0${tokenModel}`)
		.digest("hex");
}

async function loadCacheFile(): Promise<CacheFile> {
	if (memoryCache) return memoryCache;
	if (!loadPromise) {
		loadPromise = (async () => {
			try {
				const raw = await readFile(cachePath, "utf8");
				memoryCache = JSON.parse(raw) as CacheFile;
			} catch {
				memoryCache = {};
			}

			return memoryCache;
		})();
	}

	return loadPromise;
}

async function persistCache(cache: CacheFile): Promise<void> {
	await mkdir(cacheDir, { recursive: true });
	await writeFile(cachePath, JSON.stringify(cache), "utf8");
}

export async function countTextTokensCached(
	text: string,
	tokenModel: TokenModel,
	cacheKey?: string,
): Promise<number> {
	if (!text) return 0;
	if (!cacheKey) return countTextTokensAsync(text, tokenModel);

	const cache = await loadCacheFile();
	const existing = cache[cacheKey];
	if (existing) return existing.tokenCount;

	const tokenCount = await countTextTokensAsync(text, tokenModel);
	cache[cacheKey] = { tokenCount };
	await persistCache(cache);

	return tokenCount;
}

export function fileTokenCacheKey(
	path: string,
	mtimeMs: number | undefined,
	size: number,
	tokenModel: TokenModel,
): string {
	return buildCacheKey(path, mtimeMs, size, tokenModel);
}
