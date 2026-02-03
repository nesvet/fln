import type { LogLevel } from "$core";
import {
	ansi,
	getTerminalInfo,
	renderBox,
	symbols
} from "./terminal";


type LoggerOptions = {
	useAnsi: boolean;
	logLevel: LogLevel;
};

export type Logger = {
	info: (message: string) => void;
	success: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
	debug: (message: string) => void;
	header: (text: string) => void;
	section: (title: string, items: Record<string, number | string>) => void;
	box: (title: string, content: string[], showDivider?: boolean) => void;
	empty: () => void;
};

export function createLogger(options: LoggerOptions): Logger {
	const { useAnsi, logLevel } = options;
	const { width } = getTerminalInfo();
	const isSilent = logLevel === "silent";
	const isVerbose = logLevel === "verbose" || logLevel === "debug";
	
	const formatMessage = (symbol: string, color: string, message: string): string => {
		if (!useAnsi)
			return `${symbol} ${message}`;
		
		return `  ${color}${symbol}${ansi.reset} ${message}`;
	};
	
	const writeInfo = (formatted: string) => {
		if (!isSilent)
			console.info(formatted);
	};
	
	return {
		info: (message: string) => {
			if (!isSilent)
				if (useAnsi)
					console.info(`  ${ansi.dim}${message}${ansi.reset}`);
				else
					console.info(message);
		},
		
		success: (message: string) => {
			writeInfo(formatMessage(symbols.check, ansi.green, message));
		},
		
		warn: (message: string) => {
			if (!isSilent)
				console.warn(formatMessage(symbols.warning, ansi.yellow, message));
		},
		
		error: (message: string) => {
			console.error(formatMessage(symbols.cross, ansi.red, message));
		},
		
		debug: (message: string) => {
			if (!isSilent && isVerbose)
				if (useAnsi)
					console.info(`  ${ansi.dim}${symbols.info} ${message}${ansi.reset}`);
				else
					console.info(`${symbols.info} ${message}`);
		},
		
		header: (text: string) => {
			if (isSilent)
				return;
			
			if (useAnsi) {
				const boxWidth = Math.min(width - 4, 60);
				const paddedText = text.padEnd(boxWidth - 4);
				console.info("");
				console.info(`${ansi.dim}${symbols.boxTopLeft}${symbols.boxHorizontal.repeat(boxWidth - 2)}${symbols.boxTopRight}${ansi.reset}`);
				console.info(`${ansi.dim}${symbols.boxVertical}${ansi.reset}${ansi.bold}${paddedText}${ansi.reset} ${ansi.dim}${symbols.boxVertical}${ansi.reset}`);
				console.info(`${ansi.dim}${symbols.boxBottomLeft}${symbols.boxHorizontal.repeat(boxWidth - 2)}${symbols.boxBottomRight}${ansi.reset}`);
				console.info("");
			} else {
				console.info("");
				console.info(`=== ${text} ===`);
				console.info("");
			}
		},
		
		section: (title: string, items: Record<string, number | string>) => {
			if (isSilent)
				return;
			
			if (useAnsi) {
				console.info("");
				console.info(`${ansi.bold}${title}${ansi.reset}`);
				console.info("");
			} else {
				console.info("");
				console.info(title);
			}
			
			const maxKeyLength = Math.max(...Object.keys(items).map(key => key.length));
			
			for (const [ key, value ] of Object.entries(items)) {
				const paddedKey = key.padEnd(maxKeyLength);
				if (useAnsi)
					console.info(`  ${ansi.dim}${paddedKey}${ansi.reset}  ${value}`);
				else
					console.info(`  ${paddedKey}  ${value}`);
			}
		},
		
		box: (title: string, content: string[], showDivider = false) => {
			if (isSilent)
				return;
			
			const boxWidth = Math.min(width - 4, 60);
			const box = renderBox({
				title,
				content,
				width: boxWidth,
				useAnsi,
				showDivider
			});
			
			console.info("");
			console.info(box);
		},
		
		empty: () => {
			if (!isSilent)
				console.info("");
		}
	};
}
