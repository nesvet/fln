import pc from "picocolors";
import type { LogLevel } from "../core/index.js";
import { getTerminalInfo, renderBox, symbols } from "./terminal.js";

type LoggerOptions = {
	ansi: boolean;
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
	const { ansi: useAnsi, logLevel } = options;
	const { width } = getTerminalInfo();
	const isSilent = logLevel === "silent";
	const isVerbose = logLevel === "verbose" || logLevel === "debug";

	const formatMessage = (symbolOrColored: string, message: string): string =>
		`${useAnsi ? "  " : ""}${symbolOrColored} ${message}`;

	const writeInfo = (formatted: string) => {
		if (!isSilent) console.info(formatted);
	};

	return {
		info: (message: string) => {
			if (!isSilent)
				if (useAnsi) console.info(`  ${pc.dim(message)}`);
				else console.info(message);
		},

		success: (message: string) => {
			writeInfo(
				formatMessage(
					useAnsi ? pc.green(symbols.check) : symbols.check,
					message,
				),
			);
		},

		warn: (message: string) => {
			if (!isSilent)
				console.warn(
					formatMessage(
						useAnsi ? pc.yellow(symbols.warning) : symbols.warning,
						message,
					),
				);
		},

		error: (message: string) => {
			console.error(
				formatMessage(useAnsi ? pc.red(symbols.cross) : symbols.cross, message),
			);
		},

		debug: (message: string) => {
			if (!isSilent && isVerbose)
				if (useAnsi) console.info(`  ${pc.dim(`${symbols.info} ${message}`)}`);
				else console.info(`${symbols.info} ${message}`);
		},

		header: (text: string) => {
			if (isSilent) return;

			if (useAnsi) {
				const boxWidth = Math.min(width - 4, 60);
				const paddedText = text.padEnd(boxWidth - 4);
				console.info("");
				console.info(
					pc.dim(
						`${symbols.boxTopLeft}${symbols.boxHorizontal.repeat(boxWidth - 2)}${symbols.boxTopRight}`,
					),
				);
				console.info(
					`${pc.dim(symbols.boxVertical)}${pc.bold(paddedText)} ${pc.dim(symbols.boxVertical)}`,
				);
				console.info(
					pc.dim(
						`${symbols.boxBottomLeft}${symbols.boxHorizontal.repeat(boxWidth - 2)}${symbols.boxBottomRight}`,
					),
				);
				console.info("");
			} else {
				console.info("");
				console.info(`=== ${text} ===`);
				console.info("");
			}
		},

		section: (title: string, items: Record<string, number | string>) => {
			if (isSilent) return;

			if (useAnsi) {
				console.info("");
				console.info(pc.bold(title));
				console.info("");
			} else {
				console.info("");
				console.info(title);
			}

			const maxKeyLength = Math.max(
				...Object.keys(items).map((key) => key.length),
			);

			for (const [key, value] of Object.entries(items)) {
				const paddedKey = key.padEnd(maxKeyLength);
				if (useAnsi) console.info(`  ${pc.dim(paddedKey)}  ${value}`);
				else console.info(`  ${paddedKey}  ${value}`);
			}
		},

		box: (title: string, content: string[], showDivider = false) => {
			if (isSilent) return;

			const boxWidth = Math.min(width - 4, 60);
			const box = renderBox({
				title,
				content,
				width: boxWidth,
				ansi: useAnsi,
				showDivider,
			});

			console.info("");
			console.info(box);
		},

		empty: () => {
			if (!isSilent) console.info("");
		},
	};
}
