import pc from "picocolors";
import stripAnsi from "strip-ansi";

type TerminalInfo = {
	width: number;
	supportsAnsi: boolean;
};

export function getTerminalInfo(): TerminalInfo {
	const width = process.stdout.columns || 80;
	const supportsAnsi =
		process.stdout.isTTY &&
		!process.env.NO_COLOR &&
		process.env.TERM !== "dumb";

	return { width, supportsAnsi };
}

export function isTTY(): boolean {
	return Boolean(process.stdout.isTTY);
}

function isForceColorEnabled(): boolean {
	const value = process.env.FORCE_COLOR;
	if (!value || value === "0" || value === "false") return false;

	return true;
}

export function shouldUseColors(): boolean {
	if (process.env.NO_COLOR || process.env.TERM === "dumb") return false;

	return isTTY() || isForceColorEnabled();
}

export const cursor = {
	cursorHide: "\x1B[?25l",
	cursorShow: "\x1B[?25h",
	cursorUp: (lines: number) => `\x1B[${lines}A`,
	cursorDown: (lines: number) => `\x1B[${lines}B`,
	cursorTo: (column: number) => `\x1B[${column}G`,
	clearLine: "\x1B[2K",
	clearLineRight: "\x1B[0K",
};

export const symbols = {
	dot: "•",
	check: "✓",
	cross: "✗",
	warning: "⚠",
	info: "ℹ",
	arrowRight: "→",

	boxTopLeft: "╭",
	boxTopRight: "╮",
	boxBottomLeft: "╰",
	boxBottomRight: "╯",
	boxVertical: "│",
	boxHorizontal: "─",
	boxCross: "┼",
	boxTLeft: "├",
	boxTRight: "┤",

	barFull: "█",
	barEmpty: "░",
	barQuarter: "▓",
	barHalf: "▒",
};

type ProgressBarOptions = {
	total: number;
	current: number;
	width: number;
	ansi: boolean;
	label?: string;
	suffix?: string;
};

export function renderProgressBar(options: ProgressBarOptions): string {
	const { total, current, width, ansi: useAnsi, label, suffix } = options;

	if (!useAnsi) {
		const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
		const basicBar = `[${current}/${total}] ${percentage}%`;

		return label ? `${label} ${basicBar}` : basicBar;
	}

	const percentage = total > 0 ? current / total : 0;
	const percentText = `${Math.round(percentage * 100)}%`;

	const prefixText = label ? `${label}  ` : "";
	const suffixText = suffix ? ` ${pc.dim(suffix)}` : "";
	const statsText = ` ${percentText} ${pc.dim(`${symbols.dot} ${current}/${total}`)}`;

	const availableWidth = Math.max(
		10,
		width - prefixText.length - statsText.length - suffixText.length - 4,
	);
	const filledWidth = Math.min(
		availableWidth,
		Math.max(0, Math.floor(availableWidth * percentage)),
	);
	const emptyWidth = Math.max(0, availableWidth - filledWidth);

	const bar = `${pc.cyan(symbols.barFull.repeat(filledWidth))}${pc.dim(symbols.barEmpty.repeat(emptyWidth))}`;

	return `${prefixText}${bar}${statsText}${suffixText}`;
}

type BoxOptions = {
	title?: string;
	content: string[];
	width?: number;
	ansi: boolean;
	showDivider?: boolean;
};

export function renderBox(options: BoxOptions): string {
	const {
		title,
		content,
		width = 50,
		ansi: useAnsi,
		showDivider = false,
	} = options;

	if (!useAnsi) {
		const lines = [];
		if (title) lines.push(`=== ${title} ===`);

		for (const line of content) lines.push(line);

		if (title) lines.push("=".repeat(title.length + 8));

		return lines.join("\n");
	}

	const lines: string[] = [];
	const innerWidth = width - 4;

	const topLine = pc.dim(
		`${symbols.boxTopLeft}${symbols.boxHorizontal.repeat(width - 2)}${symbols.boxTopRight}`,
	);
	lines.push(topLine);

	if (title) {
		const titleWithAnsi = pc.bold(title);
		lines.push(
			`${pc.dim(symbols.boxVertical)} ${titleWithAnsi.padEnd(innerWidth + (titleWithAnsi.length - stripAnsi(titleWithAnsi).length), " ")} ${pc.dim(symbols.boxVertical)}`,
		);
	}

	if (showDivider && title) {
		const dividerLine = pc.dim(
			`${symbols.boxTLeft}${symbols.boxHorizontal.repeat(width - 2)}${symbols.boxTRight}`,
		);
		lines.push(dividerLine);
	}

	for (const line of content) {
		const strippedLength = stripAnsi(line).length;
		const ansiLength = line.length - strippedLength;
		const paddedLine = line.padEnd(innerWidth + ansiLength, " ");
		lines.push(
			`${pc.dim(symbols.boxVertical)} ${paddedLine} ${pc.dim(symbols.boxVertical)}`,
		);
	}

	const bottomLine = pc.dim(
		`${symbols.boxBottomLeft}${symbols.boxHorizontal.repeat(width - 2)}${symbols.boxBottomRight}`,
	);
	lines.push(bottomLine);

	return lines.join("\n");
}

export type ProgressRenderer = {
	start: () => void;
	update: (current: number, total: number, suffix?: string) => void;
	finish: (message?: string) => void;
	cleanup: () => void;
};

export function createProgressRenderer(
	label: string,
	ansi: boolean,
	isQuiet: boolean,
): ProgressRenderer {
	let isActive = false;
	let lastUpdate = 0;
	const { width } = getTerminalInfo();

	const useAnsi = ansi;
	const cleanup = () => {
		if (!isActive || isQuiet || !useAnsi) return;

		process.stdout.write(`${cursor.clearLine}\r`);
	};

	const handleExit = () => {
		cleanup();
		process.stdout.write(cursor.cursorShow);
	};

	return {
		start: () => {
			if (isQuiet) return;

			isActive = true;

			if (useAnsi) {
				process.stdout.write(cursor.cursorHide);
				process.once("SIGINT", handleExit);
				process.once("SIGTERM", handleExit);
			}
		},

		update: (current: number, total: number, suffix?: string) => {
			if (!isActive || isQuiet) return;

			if (useAnsi) {
				const bar = renderProgressBar({
					total,
					current,
					width,
					ansi: useAnsi,
					label,
					suffix,
				});

				process.stdout.write(`${cursor.clearLine}\r${bar}`);
			} else {
				const now = Date.now();
				if (now - lastUpdate < 100 && current < total) return;

				lastUpdate = now;
			}
		},

		finish: (message?: string) => {
			if (!isActive || isQuiet) return;

			cleanup();

			if (message && useAnsi)
				console.info(`${pc.green(symbols.check)} ${message}`);
			else if (message) console.info(message);

			isActive = false;
		},

		cleanup: () => {
			if (!isActive) return;

			cleanup();

			if (useAnsi) process.stdout.write(cursor.cursorShow);

			isActive = false;
		},
	};
}
