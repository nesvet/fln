import type { FlnOptions } from "../api/types.js";
import { resolveAnnotateTree, resolveSecurityCheck } from "../config/index.js";
import { shouldUseColors } from "../infra/terminal.js";
import type { ParsedCliFlags } from "./flagsManifest.js";

export function mapCliNegationToFlnOptions(
	flags: ParsedCliFlags,
): Pick<Partial<FlnOptions>, "contents" | "gitignore" | "tree"> {
	return {
		tree: flags.noTree === true ? false : undefined,
		contents: flags.noContents === true ? false : undefined,
		gitignore: flags.noGitignore === true ? false : undefined,
	};
}

export function mapCliFlagsToFlnOptions(
	flags: ParsedCliFlags,
): Partial<FlnOptions> {
	return {
		...mapCliNegationToFlnOptions(flags),
		output: flags.output,
		exclude: flags.exclude,
		include: flags.include,
		only: flags.only,
		relevant: flags.relevant,
		includeHidden: flags.includeHidden,
		strictLimits: flags.strictLimits,
		strictToctou: flags.strictToctou,
		compress: flags.compress,
		outline: flags.outline,
		diffHunks: flags.diffHunks,
		encoding:
			flags.encoding === "utf8" ||
			flags.encoding === "latin1" ||
			flags.encoding === "auto"
				? flags.encoding
				: undefined,
		format: flags.format as FlnOptions["format"],
		dryRun: flags.dryRun,
		copy: flags.copy,
		overwrite: flags.overwrite,
		ignoreConfig: flags.ignoreConfig,
		date: flags.date,
		banner: flags.banner,
		bannerFile: flags.bannerFile,
		footer: flags.footer,
		footerFile: flags.footerFile,
		since: flags.since,
		followSymlinks: flags.followSymlinks,
		securityCheck: flags.securityCheck
			? resolveSecurityCheck(flags.securityCheck)
			: undefined,
		annotateTree: flags.annotateTree
			? resolveAnnotateTree(flags.annotateTree)
			: undefined,
		collectTodo: flags.collectTodo ?? undefined,
	};
}

export function resolveCliAnsi(flags: ParsedCliFlags, tty: boolean): boolean {
	if (flags.noAnsi) return false;

	return tty && shouldUseColors();
}
