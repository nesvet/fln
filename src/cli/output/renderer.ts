import type { FlnResult } from "../../api";
import type { LogLevel } from "../../core";
import {
	ProgressBar,
	renderBreakdown,
	renderErrors,
	renderSummary,
	renderWarnings,
	type Warning
} from "./components";
import { formatTime } from "./formatter";
import { applyColor, colors, symbols } from "./styles";


export type RendererOptions = {
	logLevel: LogLevel;
	useAnsi: boolean;
};

export type SuccessData = {
	outputPath: string;
	result: FlnResult;
	elapsedMs: number;
	breakdown?: Map<string, number>;
	processedFiles?: string[];
};

export class OutputRenderer {
	#logLevel: LogLevel;
	#useColors: boolean;
	
	constructor(options: RendererOptions) {
		this.#logLevel = options.logLevel;
		this.#useColors = options.useAnsi;
	}
	
	createProgressBar(total: number): ProgressBar {
		return new ProgressBar(total, this.#useColors);
	}
	
	renderSuccess(data: SuccessData): void {
		if (this.#logLevel === "silent")
			return;
		
		switch (this.#logLevel) {
			case "normal":
				this.#renderNormal(data);
				break;
			case "verbose":
				this.#renderVerbose(data);
				break;
			case "debug":
				this.#renderDebug(data);
				break;
		}
	}
	
	#renderNormal(data: SuccessData): void {
		const { result, outputPath } = data;
		
		const summary = renderSummary({
			outputPath,
			files: result.files,
			tokens: result.outputTokenCount,
			useColors: this.#useColors
		});
		
		console.info(summary);
		
		const parts: string[] = [];
		
		if (result.skipped > 0) {
			const count = result.skipped;
			parts.push(`${count} ${count === 1 ? "file" : "files"} skipped`);
		}
		
		if (result.binary > 0) {
			const count = result.binary;
			parts.push(`${count} binary ${count === 1 ? "file" : "files"}`);
		}
		
		if (parts.length > 0) {
			const symbol = applyColor(symbols.info, colors.dim, this.#useColors);
			const text = parts.join(", ");
			console.info(`${symbol} ${applyColor(text, colors.dim, this.#useColors)}`);
		}
		
		const warnings = this.#collectWarnings(result);
		if (warnings.length > 0) {
			const warningsText = renderWarnings(warnings, this.#useColors);
			if (warningsText)
				console.info(warningsText);
		}
		
		if (result.errors > 0) {
			const errorsText = renderErrors([], this.#useColors, false);
			if (errorsText)
				console.error(errorsText);
		}
	}
	
	#renderVerbose(data: SuccessData): void {
		const { result, outputPath, elapsedMs, breakdown } = data;
		
		console.info("");
		
		const summary = renderSummary({
			outputPath,
			files: result.files,
			tokens: result.outputTokenCount,
			useColors: this.#useColors,
			verbose: true
		});
		
		console.info(summary);
		console.info("");
		
		const maxLabelLength = 6;
		
		const filesLabel = applyColor("Files".padEnd(maxLabelLength), colors.dim, this.#useColors);
		const filesProcessed = applyColor(result.files, colors.success, this.#useColors);
		const filesSkipped = result.skipped > 0 ? `, ${result.skipped} skipped` : "";
		const filesBinary = result.binary > 0 ? `, ${result.binary} binary` : "";
		const filesErrors = result.errors > 0 ? `, ${applyColor(result.errors, colors.error, this.#useColors)} errors` : "";
		
		console.info(`${filesLabel}  ${filesProcessed} processed${filesSkipped}${filesBinary}${filesErrors}`);
		
		const tokensLabel = applyColor("Tokens".padEnd(maxLabelLength), colors.dim, this.#useColors);
		const tokensValue = applyColor(
			`~${Math.round(result.outputTokenCount / 1000)}K`,
			colors.success,
			this.#useColors
		);
		console.info(`${tokensLabel}  ${tokensValue}`);
		
		const timeLabel = applyColor("Time".padEnd(maxLabelLength), colors.dim, this.#useColors);
		const timeValue = applyColor(formatTime(elapsedMs), colors.success, this.#useColors);
		console.info(`${timeLabel}  ${timeValue}`);
		
		if (breakdown && breakdown.size > 0) {
			console.info("");
			const breakdownText = renderBreakdown(breakdown, this.#useColors);
			console.info(breakdownText);
		}
	}
	
	#renderDebug(data: SuccessData): void {
		const { processedFiles } = data;
		
		this.#renderVerbose(data);
		
		if (processedFiles && processedFiles.length > 0) {
			console.info("");
			const title = this.#useColors ? colors.bold("Processed files") : "Processed files";
			console.info(title);
			
			for (const file of processedFiles) {
				const filePath = applyColor(`./${file}`, colors.dim, this.#useColors);
				console.info(`  ${filePath}`);
			}
		}
	}
	
	#collectWarnings(result: FlnResult): Warning[] {
		const warnings: Warning[] = [];
		
		if (result.outputTokenCount > 200_000)
			warnings.push({
				type: "large_output",
				tokens: result.outputTokenCount
			});
		
		return warnings;
	}
}
