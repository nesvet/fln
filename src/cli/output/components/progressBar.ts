import { applyColor, colors, symbols } from "../styles.js";


export class ProgressBar {
	#total: number;
	#current = 0;
	#visible = false;
	#isTTY: boolean;
	#useColors: boolean;
	
	constructor(total: number, useColors: boolean) {
		this.#total = total;
		this.#isTTY = Boolean(process.stdout.isTTY);
		this.#useColors = useColors;
	}
	
	increment(message?: string): void {
		this.#current++;
		
		if (!this.#isTTY)
			return;
		
		if (!this.#visible)
			this.#visible = true;
		
		this.#render(message);
	}
	
	clear(): void {
		if (!this.#visible || !this.#isTTY)
			return;
		
		process.stdout.write(`\r${" ".repeat(80)}\r`);
		this.#visible = false;
	}
	
	#render(message?: string): void {
		const percent = Math.floor((this.#current / this.#total) * 100);
		const filledCount = Math.floor(percent / 5);
		const emptyCount = 20 - filledCount;
		
		const filledBar = applyColor(
			symbols.barFull.repeat(filledCount),
			colors.info,
			this.#useColors
		);
		const emptyBar = applyColor(
			symbols.barEmpty.repeat(emptyCount),
			colors.dim,
			this.#useColors
		);
		
		const bar = filledBar + emptyBar;
		const text = message ?? "Scanning...";
		const counter = applyColor(
			`${this.#current}/${this.#total}`,
			colors.dim,
			this.#useColors
		);
		
		process.stdout.write(
			`\r${symbols.pancake} ${text} ${bar} ${percent}% (${counter} files)`
		);
	}
}
