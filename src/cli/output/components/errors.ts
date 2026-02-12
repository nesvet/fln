import { applyColor, colors, symbols } from "../styles.js";


export type FileError = {
	path: string;
	reason: string;
};

export function renderErrors(
	errors: FileError[],
	useColors: boolean,
	verbose: boolean
): string {
	if (errors.length === 0)
		return "";
	
	const symbol = applyColor(symbols.error, colors.error, useColors);
	const count = errors.length;
	
	if (!verbose)
		return `${symbol} ${count} ${count === 1 ? "file" : "files"} failed — run with --verbose for details`;
	
	
	const lines = [ `${symbol} ${count} ${count === 1 ? "file" : "files"} failed`, "" ];
	
	for (const error of errors)
		lines.push(`  ${error.path}`, `    ${applyColor(error.reason, colors.dim, useColors)}`, "");
	
	return lines.join("\n");
}
