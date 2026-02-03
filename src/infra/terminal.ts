type TerminalInfo = {
	width: number;
	supportsAnsi: boolean;
};

export function getTerminalInfo(): TerminalInfo {
	const width = process.stdout.columns || 80;
	const supportsAnsi = process.stdout.isTTY && process.env.TERM !== "dumb";
	
	return { width, supportsAnsi };
}

export function isTTY(): boolean {
	return Boolean(process.stdout.isTTY);
}

export function shouldUseColors(): boolean {
	return isTTY() && process.env.NO_COLOR !== "1" && process.env.TERM !== "dumb";
}

export const ansi = {
	cursorHide: "\x1B[?25l",
	cursorShow: "\x1B[?25h",
	cursorUp: (lines: number) => `\x1B[${lines}A`,
	cursorDown: (lines: number) => `\x1B[${lines}B`,
	cursorTo: (column: number) => `\x1B[${column}G`,
	clearLine: "\x1B[2K",
	clearLineRight: "\x1B[0K",
	
	reset: "\x1B[0m",
	bold: "\x1B[1m",
	dim: "\x1B[2m",
	
	black: "\x1B[30m",
	red: "\x1B[31m",
	green: "\x1B[32m",
	yellow: "\x1B[33m",
	blue: "\x1B[34m",
	magenta: "\x1B[35m",
	cyan: "\x1B[36m",
	white: "\x1B[37m",
	gray: "\x1B[90m",
	
	bgBlack: "\x1B[40m",
	bgRed: "\x1B[41m",
	bgGreen: "\x1B[42m",
	bgYellow: "\x1B[43m",
	bgBlue: "\x1B[44m",
	bgMagenta: "\x1B[45m",
	bgCyan: "\x1B[46m",
	bgWhite: "\x1B[47m",
	
	brightBlack: "\x1B[90m",
	brightRed: "\x1B[91m",
	brightGreen: "\x1B[92m",
	brightYellow: "\x1B[93m",
	brightBlue: "\x1B[94m",
	brightMagenta: "\x1B[95m",
	brightCyan: "\x1B[96m",
	brightWhite: "\x1B[97m"
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
	barHalf: "▒"
};

type ProgressBarOptions = {
	total: number;
	current: number;
	width: number;
	useAnsi: boolean;
	label?: string;
	suffix?: string;
};

export function renderProgressBar(options: ProgressBarOptions): string {
	const { total, current, width, useAnsi, label, suffix } = options;
	
	if (!useAnsi) {
		const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
		const basicBar = `[${current}/${total}] ${percentage}%`;
		
		return label ? `${label} ${basicBar}` : basicBar;
	}
	
	const percentage = total > 0 ? (current / total) : 0;
	const percentText = `${Math.round(percentage * 100)}%`;
	
	const prefixText = label ? `${label}  ` : "";
	const suffixText = suffix ? ` ${ansi.dim}${suffix}${ansi.reset}` : "";
	const statsText = ` ${percentText} ${ansi.dim}${symbols.dot} ${current}/${total}${ansi.reset}`;
	
	const availableWidth = Math.max(10, width - prefixText.length - statsText.length - suffixText.length - 4);
	const filledWidth = Math.floor(availableWidth * percentage);
	const emptyWidth = availableWidth - filledWidth;
	
	const bar = `${ansi.cyan}${symbols.barFull.repeat(filledWidth)}${ansi.reset}${ansi.dim}${symbols.barEmpty.repeat(emptyWidth)}${ansi.reset}`;
	
	return `${prefixText}${bar}${statsText}${suffixText}`;
}

type BoxOptions = {
	title?: string;
	content: string[];
	width?: number;
	useAnsi: boolean;
	showDivider?: boolean;
};

export function renderBox(options: BoxOptions): string {
	const { title, content, width = 50, useAnsi, showDivider = false } = options;
	
	if (!useAnsi) {
		const lines = [];
		if (title)
			lines.push(`=== ${title} ===`);
		
		for (const line of content)
			lines.push(line);
		
		if (title)
			lines.push("=".repeat(title.length + 8));
		
		return lines.join("\n");
	}
	
	const lines: string[] = [];
	const innerWidth = width - 4;
	
	const topLine = `${ansi.dim}${symbols.boxTopLeft}${symbols.boxHorizontal.repeat(width - 2)}${symbols.boxTopRight}${ansi.reset}`;
	lines.push(topLine);
	
	if (title) {
		const titleWithAnsi = `${ansi.bold}${title}${ansi.reset}`;
		lines.push(`${ansi.dim}${symbols.boxVertical}${ansi.reset} ${titleWithAnsi.padEnd(innerWidth + (titleWithAnsi.length - stripAnsi(titleWithAnsi).length), " ")} ${ansi.dim}${symbols.boxVertical}${ansi.reset}`);
	}
	
	if (showDivider && title) {
		const dividerLine = `${ansi.dim}${symbols.boxTLeft}${symbols.boxHorizontal.repeat(width - 2)}${symbols.boxTRight}${ansi.reset}`;
		lines.push(dividerLine);
	}
	
	for (const line of content) {
		const strippedLength = stripAnsi(line).length;
		const ansiLength = line.length - strippedLength;
		const paddedLine = line.padEnd(innerWidth + ansiLength, " ");
		lines.push(`${ansi.dim}${symbols.boxVertical}${ansi.reset} ${paddedLine} ${ansi.dim}${symbols.boxVertical}${ansi.reset}`);
	}
	
	const bottomLine = `${ansi.dim}${symbols.boxBottomLeft}${symbols.boxHorizontal.repeat(width - 2)}${symbols.boxBottomRight}${ansi.reset}`;
	lines.push(bottomLine);
	
	return lines.join("\n");
}

function stripAnsi(text: string): string {
	return text.replaceAll(/\x1B\[[\d;]*m/g, "");// eslint-disable-line no-control-regex
}

export type ProgressRenderer = {
	start: () => void;
	update: (current: number, total: number, suffix?: string) => void;
	finish: (message?: string) => void;
	cleanup: () => void;
};

export function createProgressRenderer(label: string, useAnsi: boolean, isQuiet: boolean): ProgressRenderer {
	let isActive = false;
	let lastUpdate = 0;
	const { width } = getTerminalInfo();
	
	const cleanup = () => {
		if (!isActive || isQuiet || !useAnsi)
			return;
		
		process.stdout.write(`${ansi.clearLine}\r`);
	};
	
	const handleExit = () => {
		cleanup();
		process.stdout.write(ansi.cursorShow);
	};
	
	return {
		start: () => {
			if (isQuiet)
				return;
			
			isActive = true;
			
			if (useAnsi) {
				process.stdout.write(ansi.cursorHide);
				process.once("SIGINT", handleExit);
				process.once("SIGTERM", handleExit);
			}
		},
		
		update: (current: number, total: number, suffix?: string) => {
			if (!isActive || isQuiet)
				return;
			
			if (useAnsi) {
				const bar = renderProgressBar({
					total,
					current,
					width,
					useAnsi,
					label,
					suffix
				});
				
				process.stdout.write(`${ansi.clearLine}\r${bar}`);
			} else {
				const now = Date.now();
				if (now - lastUpdate < 100 && current < total)
					return;
				
				lastUpdate = now;
			}
		},
		
		finish: (message?: string) => {
			if (!isActive || isQuiet)
				return;
			
			cleanup();
			
			if (message && useAnsi)
				console.info(`${ansi.green}${symbols.check}${ansi.reset} ${message}`);
			else if (message)
				console.info(message);
			
			isActive = false;
		},
		
		cleanup: () => {
			if (!isActive)
				return;
			
			cleanup();
			
			if (useAnsi)
				process.stdout.write(ansi.cursorShow);
			
			isActive = false;
		}
	};
}
