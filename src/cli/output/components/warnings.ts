import { applyColor, colors, symbols } from "../styles.js";


export type Warning = {
	type: "large_output";
	tokens: number;
};

export function renderWarnings(warnings: Warning[], useColors: boolean): string {
	if (warnings.length === 0)
		return "";
	
	const lines = warnings.map(warning => {
		const symbol = applyColor(symbols.warning, colors.warning, useColors);
		const tokens = Math.round(warning.tokens / 1000);
		
		return `${symbol} Output size is large (~${tokens}K tokens) — consider using --exclude`;
	});
	
	return lines.join("\n");
}
