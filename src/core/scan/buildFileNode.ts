import { open } from "node:fs/promises";
import {
	analyzeTextFileHeader,
	readMaxBacktickSample,
} from "../fileContent.js";
import {
	getSecurityHeaderBytes,
	isSecuritySensitivePath,
	type SecurityCheckMode,
} from "../securityMatcher.js";
import type { FileNode, SkipReason } from "../types.js";
import type { FileNodeInput, ScanContext } from "./types.js";

async function inspectFile(
	filePath: string,
	fileSize: number,
	securityCheck: SecurityCheckMode,
): Promise<{
	isGenerated: boolean;
	isBinary: boolean;
	secretDetail?: string;
}> {
	if (fileSize === 0) return { isGenerated: false, isBinary: false };

	const headerBytes = getSecurityHeaderBytes(securityCheck);
	const handle = await open(filePath, "r");
	try {
		const buffer = Buffer.alloc(Math.min(headerBytes, fileSize));
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);

		return analyzeTextFileHeader(buffer, bytesRead, {
			strict: securityCheck === "strict",
		});
	} finally {
		await handle.close();
	}
}

export async function buildFileNode(
	ctx: ScanContext,
	input: FileNodeInput,
): Promise<FileNode> {
	if (input.isForceIncluded) ctx.forceIncludeMatchCount++;

	ctx.stats.filesScanned++;
	ctx.stats.totalSizeBytes += input.fileSize;

	ctx.processedItems++;
	if (ctx.totalEstimate === 0)
		ctx.totalEstimate = Math.max(ctx.processedItems + 50, 100);

	if (ctx.options.onProgress)
		ctx.options.onProgress(
			ctx.processedItems,
			Math.max(ctx.totalEstimate, ctx.processedItems),
		);

	let skipReason: SkipReason | undefined;
	let isBinary = false;
	let securityDetail: string | undefined;
	const { scanMtimeMs } = input;
	const scanSize = input.fileSize;

	if (
		isSecuritySensitivePath(input.normalizedRelativePath, ctx.securityPatterns)
	) {
		skipReason = "security";
		securityDetail = "matches sensitive path pattern";
	}

	const needsHeaderRead =
		input.fileSize > 0 &&
		(input.fileSize <= ctx.options.maxFileSize || !input.isForceIncluded);

	if (!skipReason && needsHeaderRead)
		try {
			const {
				isGenerated,
				isBinary: binary,
				secretDetail: secret,
			} = await ctx.ioLimit(() =>
				inspectFile(
					input.currentPath,
					input.fileSize,
					ctx.options.securityCheck ?? "default",
				),
			);
			if (isGenerated) skipReason = "generated";
			if (secret) {
				skipReason = "security";
				securityDetail = secret;
			}
			isBinary = binary;
		} catch (error) {
			ctx.stats.errors++;
			skipReason = "readError";
			ctx.logger.warn(
				`Failed to read ${input.normalizedRelativePath || "."}: ${String(error)}`,
			);
		}

	if (
		!skipReason &&
		input.fileSize > ctx.options.maxFileSize &&
		!input.isForceIncluded
	)
		skipReason = "tooLarge";

	if (isBinary) ctx.stats.binary++;

	if (skipReason) {
		ctx.stats.skipped++;

		if (skipReason === "security" && input.isForceIncluded)
			ctx.logger.info(
				`Content omitted (security${securityDetail ? `: ${securityDetail}` : ""}): ${input.normalizedRelativePath || "."}`,
			);

		return {
			name: input.name,
			path: input.normalizedRelativePath,
			type: "file",
			size: input.fileSize,
			isBinary,
			target: input.symlinkTarget,
			skipReason,
			securityDetail,
			scanMtimeMs,
			scanSize,
		};
	}

	let maxBacktickRun: number | undefined;

	if (
		ctx.options.contents &&
		!ctx.options.dryRun &&
		!isBinary &&
		input.fileSize > 0
	)
		try {
			maxBacktickRun = await ctx.ioLimit(() =>
				readMaxBacktickSample(
					input.currentPath,
					scanSize,
					ctx.options.encoding,
				),
			);
		} catch (error) {
			ctx.stats.errors++;
			ctx.stats.skipped++;
			ctx.logger.warn(
				`Failed to read ${input.normalizedRelativePath || "."}: ${String(error)}`,
			);

			return {
				name: input.name,
				path: input.normalizedRelativePath,
				type: "file",
				size: input.fileSize,
				isBinary,
				target: input.symlinkTarget,
				skipReason: "readError",
				scanMtimeMs,
				scanSize,
			};
		}

	ctx.stats.filesIncluded++;

	return {
		name: input.name,
		path: input.normalizedRelativePath,
		type: "file",
		size: input.fileSize,
		isBinary,
		target: input.symlinkTarget,
		maxBacktickRun,
		scanMtimeMs,
		scanSize,
	};
}
