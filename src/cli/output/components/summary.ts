import { basename } from "node:path";
import { formatFileCount, formatTokenCount } from "../formatter.js";
import { applyColor, colors, symbols } from "../styles.js";


export function renderSummary(data: {
	outputPath: string;
	files: number;
	tokens: number;
	useColors: boolean;
	verbose?: boolean;
}): string {
	const fileName = basename(data.outputPath);
	const successSymbol = applyColor(symbols.success, colors.success, data.useColors);
	
	if (data.verbose)
		return `${successSymbol} ${fileName} created`;
	
	const filesText = applyColor(formatFileCount(data.files), colors.success, data.useColors);
	const tokenCount = applyColor(formatTokenCount(data.tokens), colors.success, data.useColors);
	
	return `${successSymbol} ${fileName} (${filesText}, ${tokenCount} tokens)`;
}
