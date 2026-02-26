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
import pLimit from "p-limit";
import { toCanonicalRelative, toIgnoreSafePath, toPosixPath } from "../path/index.js";
import { normalizeIncludePattern } from "../pattern/index.js";
import type { Logger } from "../infra/index.js";
import { IgnoreMatcher } from "./ignoreMatcher.js";
import type {
	FileNode,
	ScanOptions,
	ScanResult,
	ScanStats,
	SkipReason
} from "./types.js";


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
		lowerName === "pom.xml" ||
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

async function inspectFile(filePath: string, fileSize: number): Promise<{
	isGenerated: boolean;
	isBinary: boolean;
}> {
	if (fileSize === 0)
		return { isGenerated: false, isBinary: false };
	
	const handle = await open(filePath, "r");
	try {
		const buffer = Buffer.alloc(Math.min(512, fileSize));
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		const header = buffer.toString("utf8", 0, Math.min(100, bytesRead));
		
		const isGenerated = header.includes("<!-- 🥞 fln");
		const isBinary = !isGenerated && buffer.slice(0, bytesRead).includes(0);
		
		return { isGenerated, isBinary };
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
		input: options.input,
		excludePatterns: options.excludePatterns,
		gitignore: options.gitignore,
		logger
	});
	const normalizedIncludePatterns = options.includePatterns
		.map(pattern => normalizeIncludePattern(pattern, options.input))
		.filter((p): p is string => p !== null);
	const includeMatcher = ignore().add(normalizedIncludePatterns);
	const concurrencyLimit = Math.max(8, Math.min(64, cpus().length * 4));
	const limit = pLimit(concurrencyLimit);
	const excludedPathSet = new Set(
		options.excludedPaths
			.map(path => toCanonicalRelative(path, options.input))
			.filter((p): p is string => p !== null && p !== "")
	);
	const visitedRealPaths = new Set<string>();
	
	let processedItems = 0;
	let totalEstimate = 0;
	
	if (options.followSymlinks)
		try {
			const rootRealPath = await realpath(options.input);
			visitedRealPaths.add(rootRealPath);
		} catch {
			logger.debug("Failed to resolve root real path.");
		}
	
	const rootNode = await scanEntry(options.input, "");
	if (!rootNode || rootNode.type !== "directory")
		throw new Error("Root directory is empty or all files were excluded.");
	
	return { projectName: options.projectName, root: rootNode, stats };
	
	async function scanEntry(currentPath: string, relativePath: string, dirent?: Dirent): Promise<FileNode | undefined> {
		const normalizedRelativePath = toPosixPath(relativePath);
		const name = dirent?.name ?? currentPath.split(sep).pop() ?? "";
		
		if (normalizedRelativePath !== "" && excludedPathSet.has(normalizedRelativePath))
			return undefined;
		
		const pathForCheck = normalizedRelativePath === "" ? "" : (dirent?.isDirectory() ? `${normalizedRelativePath}/` : normalizedRelativePath);
		const safePath = toIgnoreSafePath(pathForCheck, options.input);
		const isExplicitlyIncluded =
			safePath !== null &&
			safePath !== "" &&
			includeMatcher.ignores(safePath);
		
		const isDirectory = pathForCheck.endsWith("/");
		if (
			normalizedIncludePatterns.length > 0 &&
			!isExplicitlyIncluded &&
			pathForCheck !== "" &&
			!isDirectory
		)
			return undefined;
		
		if (!isExplicitlyIncluded && pathForCheck !== "" && ignoreMatcher.ignoresSafePath(safePath))
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
		let isBinary = false;
		
		const needsRead = input.fileSize > 0 &&
			(input.fileSize <= options.maxFileSize || !input.isExplicitlyIncluded);
		
		if (needsRead)
			try {
				const { isGenerated, isBinary: binary } = await inspectFile(input.currentPath, input.fileSize);
				if (!input.isExplicitlyIncluded && isGenerated)
					skipReason = "generated";
				isBinary = binary;
			} catch (error) {
				stats.errors++;
				skipReason = "readError";
				logger.warn(`Failed to read ${input.normalizedRelativePath || "."}: ${String(error)}`);
			}
		
		
		if (!skipReason && input.fileSize > options.maxFileSize)
			skipReason = "tooLarge";
		
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
		
		const children = (await Promise.all(
			entries.map(entry => limit(() => {
				const childPath = `${input.currentPath}${sep}${entry.name}`;
				const childRelativePath = relative(options.input, childPath);
				
				return scanEntry(childPath, childRelativePath, entry);
			}))
		))
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
