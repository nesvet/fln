import { formatFileCount } from "../formatter";
import { applyColor, colors, symbols } from "../styles";


export function renderBreakdown(
	stats: Map<string, number>,
	useColors: boolean
): string {
	const entries = Array.from(stats.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10);
	
	if (entries.length === 0)
		return "";
	
	const maxExtLength = Math.max(...entries.map(([ ext ]) => ext.length));
	
	const lines = entries.map(([ ext, count ], index) => {
		const isLast = index === entries.length - 1;
		const branch = isLast ? symbols.lastBranch : symbols.branch;
		const branchSymbol = applyColor(branch, colors.dim, useColors);
		const padding = " ".repeat(maxExtLength - ext.length);
		const extension = applyColor(ext, colors.info, useColors);
		const label = applyColor(formatFileCount(count), colors.success, useColors);
		
		return `  ${branchSymbol} ${extension}${padding}  ${label}`;
	});
	
	const title = useColors ? colors.bold("Breakdown") : "Breakdown";
	
	return [ title, ...lines ].join("\n");
}
