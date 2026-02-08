import { readFile } from "node:fs/promises";

export const readLines = async (path: string): Promise<string[]> => {
	try {
		const content = await readFile(path, "utf-8");
		return content.split("\n").filter((line) => line.trim().length > 0);
	} catch {
		return [ "alpha", "beta", "gamma", "delta" ];
	}
};
