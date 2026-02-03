import {
	lstat,
	open,
	readdir,
	readlink,
	realpath,
	stat
} from "node:fs/promises";
import { cpus } from "node:os";
import { relative, sep } from "node:path";
import type { Dirent } from "node:fs";
import ignore from "ignore";
import type { Logger } from "$infra";
import { IgnoreMatcher } from "./ignoreMatcher";
import type {
	FileNode,
	ScanOptions,
	ScanResult,
	ScanStats,
	SkipReason
} from "./types";


function normalizePathSegment(pathSegment: string): string {
	if (sep === "/")
		return pathSegment;
	
	return pathSegment.split(sep).join("/");
}

function getFileScore(fileName: string): number {
	const lowerName = fileName.toLowerCase();
	
	if (lowerName.startsWith("readme"))
		return 0;
	
	if (
		lowerName === "package.json" ||
		lowerName.startsWith("tsconfig") ||
		lowerName === "pyproject.toml" ||
		lowerName === "cargo.toml" ||
		lowerName === "go.mod" ||
		lowerName === "cmakelists.txt" ||
		lowerName === "makefile" ||
		lowerName === "dockerfile" ||
		lowerName === "vcpkg.json" ||
		lowerName.startsWith(".env") ||
		lowerName.includes(".config.") ||
		lowerName.startsWith(".prettier") ||
		lowerName.startsWith(".eslintrc")
	)
		return 1;
	
	if (
		lowerName.startsWith("index.") ||
		lowerName.startsWith("main.") ||
		lowerName.startsWith("app.") ||
		lowerName.startsWith("server.") ||
		lowerName.startsWith("mod.") ||
		lowerName.startsWith("lib.")
	)
		return 2;
	
	if (
		lowerName.includes("types") ||
		lowerName.includes("interface") ||
		lowerName.includes("schema") ||
		lowerName.includes("config") ||
		lowerName.includes("constants") ||
		lowerName.endsWith(".d.ts") ||
		lowerName.endsWith(".h") ||
		lowerName.endsWith(".hpp")
	)
		return 3;
	
	if (
		lowerName.startsWith("license") ||
		lowerName.startsWith("changelog") ||
		lowerName.startsWith("contributing") ||
		lowerName.startsWith("code_of_conduct") ||
		lowerName.startsWith("security")
	)
		return 15;
	
	if (
		lowerName.includes(".test.") ||
		lowerName.includes(".spec.") ||
		lowerName.startsWith("test_") ||
		lowerName.endsWith("_test.go")
	)
		return 20;
	
	return 10;
}

async function isBinaryFile(filePath: string, fileSize: number): Promise<boolean> {
	if (fileSize === 0)
		return false;
	
	const handle = await open(filePath, "r");
	try {
		const buffer = Buffer.alloc(Math.min(512, fileSize));
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		
		for (let index = 0; index < bytesRead; index++)
			if (buffer[index] === 0)
				return true;
		
		return false;
	} finally {
		await handle.close();
	}
}

async function isGeneratedFile(filePath: string, fileSize: number): Promise<boolean> {
	if (fileSize === 0)
		return false;
	
	const handle = await open(filePath, "r");
	try {
		const buffer = Buffer.alloc(Math.min(100, fileSize));
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		const content = buffer.toString("utf8", 0, bytesRead);
		
		return content.includes("<!-- 🥞 flatr");
	} catch {
		return false;
	} finally {
		await handle.close();
	}
}

export async function scanTree(options: ScanOptions, logger: Logger): Promise<ScanResult> {
	const stats: ScanStats = {
		files: 0,
		directories: 0,
		binary: 0,
		skipped: 0,
		errors: 0,
		totalSizeBytes: 0,
		outputSizeBytes: 0,
		outputTokenCount: 0
	};
	const ignoreMatcher = new IgnoreMatcher({
		rootDirectory: options.rootDirectory,
		excludePatterns: options.excludePatterns,
		useGitignore: options.useGitignore,
		logger
	});
	const includeMatcher = ignore().add(options.includePatterns);
	const concurrencyLimit = Math.max(8, Math.min(64, cpus().length * 4));
	const excludedPathSet = new Set(options.excludedPaths.map(pathItem => normalizePathSegment(pathItem)));
	const visitedRealPaths = new Set<string>();
	
	let processedItems = 0;
	let totalEstimate = 0;
	
	if (options.followSymlinks)
		try {
			const rootRealPath = await realpath(options.rootDirectory);
			visitedRealPaths.add(rootRealPath);
		} catch {
			logger.debug("Failed to resolve root real path.");
		}
	
	const rootNode = await scanEntry(options.rootDirectory, "");
	if (!rootNode || rootNode.type !== "directory")
		throw new Error("Root directory is empty or all files were excluded.");
	
	return { projectName: options.projectName, root: rootNode, stats };
	
	async function scanEntry(currentPath: string, relativePath: string, dirent?: Dirent): Promise<FileNode | undefined> {
		const normalizedRelativePath = normalizePathSegment(relativePath);
		const name = dirent?.name ?? currentPath.split(sep).pop() ?? "";
		
		if (normalizedRelativePath !== "" && excludedPathSet.has(normalizedRelativePath))
			return undefined;
		
		const isExplicitlyIncluded = normalizedRelativePath !== "" && includeMatcher.ignores(normalizedRelativePath);
		
		if (!isExplicitlyIncluded && normalizedRelativePath !== "" && ignoreMatcher.ignores(normalizedRelativePath))
			return undefined;
		
		if (!options.includeHidden && name.startsWith(".") && name !== ".")
			return undefined;
		
		try {
			let symlinkTarget: string | undefined;
			const isSymlink = dirent ? dirent.isSymbolicLink() : undefined;
			
			if (isSymlink) {
				symlinkTarget = await readlink(currentPath);
				
				if (!options.followSymlinks)
					return {
						name,
						path: normalizedRelativePath,
						type: "symlink",
						size: 0,
						target: symlinkTarget
					};
				
				const resolvedPath = await realpath(currentPath);
				if (visitedRealPaths.has(resolvedPath)) {
					stats.skipped++;
					
					return {
						name,
						path: normalizedRelativePath,
						type: "symlink",
						size: 0,
						target: symlinkTarget,
						skipReason: "symlinkCycle"
					};
				}
				
				visitedRealPaths.add(resolvedPath);
				
				const statsResult = await stat(currentPath);
				
				if (statsResult.isFile())
					return await buildFileNode({
						currentPath,
						normalizedRelativePath,
						name,
						fileSize: statsResult.size,
						symlinkTarget,
						isExplicitlyIncluded
					});
				
				if (statsResult.isDirectory())
					return await buildDirectoryNode({
						currentPath,
						normalizedRelativePath,
						name,
						symlinkTarget
					});
				
				return undefined;
			}
			
			if (dirent?.isDirectory())
				return await buildDirectoryNode({
					currentPath,
					normalizedRelativePath,
					name
				});
			
			if (dirent?.isFile()) {
				const statsResult = await stat(currentPath);
				
				return await buildFileNode({
					currentPath,
					normalizedRelativePath,
					name,
					fileSize: statsResult.size,
					isExplicitlyIncluded
				});
			}
			
			if (dirent)
				return undefined;
			
			const entryStats = await lstat(currentPath);
			
			if (entryStats.isSymbolicLink()) {
				symlinkTarget = await readlink(currentPath);
				
				if (!options.followSymlinks)
					return {
						name,
						path: normalizedRelativePath,
						type: "symlink",
						size: 0,
						target: symlinkTarget
					};
				
				const resolvedPath = await realpath(currentPath);
				if (visitedRealPaths.has(resolvedPath)) {
					stats.skipped++;
					
					return {
						name,
						path: normalizedRelativePath,
						type: "symlink",
						size: 0,
						target: symlinkTarget,
						skipReason: "symlinkCycle"
					};
				}
				
				visitedRealPaths.add(resolvedPath);
			}
			
			const statsResult = options.followSymlinks ? await stat(currentPath) : entryStats;
			
			if (statsResult.isFile())
				return await buildFileNode({
					currentPath,
					normalizedRelativePath,
					name,
					fileSize: statsResult.size,
					symlinkTarget,
					isExplicitlyIncluded
				});
			
			if (statsResult.isDirectory())
				return await buildDirectoryNode({
					currentPath,
					normalizedRelativePath,
					name,
					symlinkTarget
				});
		} catch (error) {
			stats.errors++;
			logger.warn(`Failed to access ${normalizedRelativePath || "."}: ${String(error)}`);
		}
		
		return undefined;
	}
	
	type FileNodeInput = {
		currentPath: string;
		normalizedRelativePath: string;
		name: string;
		fileSize: number;
		symlinkTarget?: string;
		isExplicitlyIncluded: boolean;
	};
	
	async function buildFileNode(input: FileNodeInput): Promise<FileNode> {
		stats.files++;
		stats.totalSizeBytes += input.fileSize;
		
		processedItems++;
		if (totalEstimate === 0)
			totalEstimate = Math.max(processedItems + 50, 100);
		
		if (options.onProgress)
			options.onProgress(processedItems, Math.max(totalEstimate, processedItems));
		
		let skipReason: SkipReason | undefined;
		
		if (!input.isExplicitlyIncluded && await isGeneratedFile(input.currentPath, input.fileSize))
			skipReason = "generated";
		
		if (!skipReason && input.fileSize > options.maximumFileSizeBytes)
			skipReason = "tooLarge";
		
		let isBinary = false;
		if (!skipReason)
			try {
				isBinary = await isBinaryFile(input.currentPath, input.fileSize);
			} catch (error) {
				stats.errors++;
				skipReason = "readError";
				logger.warn(`Failed to read ${input.normalizedRelativePath || "."}: ${String(error)}`);
			}
		
		if (isBinary)
			stats.binary++;
		
		if (skipReason) {
			stats.skipped++;
			
			return {
				name: input.name,
				path: input.normalizedRelativePath,
				type: "file",
				size: input.fileSize,
				isBinary,
				target: input.symlinkTarget,
				skipReason
			};
		}
		
		return {
			name: input.name,
			path: input.normalizedRelativePath,
			type: "file",
			size: input.fileSize,
			isBinary,
			target: input.symlinkTarget
		};
	}
	
	type DirectoryNodeInput = {
		currentPath: string;
		normalizedRelativePath: string;
		name: string;
		symlinkTarget?: string;
	};
	
	async function buildDirectoryNode(input: DirectoryNodeInput): Promise<FileNode> {
		stats.directories++;
		await ignoreMatcher.addGitignoreForDirectory(input.currentPath);
		
		const entries = await readdir(input.currentPath, { withFileTypes: true });
		
		totalEstimate = Math.max(totalEstimate, processedItems + entries.length);
		
		const children = (await mapWithConcurrency(entries, concurrencyLimit, async entry => {
			const childPath = `${input.currentPath}${sep}${entry.name}`;
			const childRelativePath = relative(options.rootDirectory, childPath);
			
			return scanEntry(childPath, childRelativePath, entry);
		}))
			.filter((node): node is FileNode => node !== undefined)
			.sort((left, right) => {
				if (left.type !== right.type)
					return left.type === "directory" ? 1 : -1;
				
				if (left.type === "file" && right.type === "file") {
					const scoreA = getFileScore(left.name);
					const scoreB = getFileScore(right.name);
					
					if (scoreA !== scoreB)
						return scoreA - scoreB;
				}
				
				return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
			});
		
		return {
			name: input.name,
			path: input.normalizedRelativePath,
			type: "directory",
			size: 0,
			children,
			target: input.symlinkTarget
		};
	}
}

async function mapWithConcurrency<T, Result>(
	items: T[],
	concurrency: number,
	mapper: (item: T) => Promise<Result>
): Promise<Result[]> {
	if (items.length === 0)
		return [];
	
	const limit = Math.max(1, Math.min(concurrency, items.length));
	if (limit === 1) {
		const results: Result[] = [];
		for (const item of items)
			results.push(await mapper(item));
		
		return results;
	}
	
	const results = new Array<Result>(items.length);
	let nextIndex = 0;
	
	const workers = Array.from({ length: limit }, async () => {
		while (true) {
			const currentIndex = nextIndex++;
			if (currentIndex >= items.length)
				return;
			
			results[currentIndex] = await mapper(items[currentIndex]);
		}
	});
	
	await Promise.all(workers);
	
	return results;
}
