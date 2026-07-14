import pc from "picocolors";

export type StyleFunction = (text: number | string) => string;

export const colors = {
	success: pc.green,
	warning: pc.yellow,
	error: pc.red,
	info: pc.cyan,
	dim: pc.dim,
	bold: pc.bold,
	reset: pc.reset,
} as const;

export const symbols = {
	success: "✓",
	warning: "⚠",
	error: "✗",
	info: "ℹ",
	pancake: "🥞",
	branch: "├─",
	lastBranch: "└─",
	barFull: "█",
	barEmpty: "░",
} as const;

export function applyColor(
	text: number | string,
	colorFn: StyleFunction,
	useColors: boolean,
): string {
	if (!useColors) return String(text);

	return colorFn(String(text));
}
