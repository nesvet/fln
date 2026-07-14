export type TodoEntry = {
	file: string;
	line: number;
	marker: string;
	owner?: string;
	text: string;
};

const TODO_PATTERN =
	/\b(TODO|FIXME|HACK|XXX|NOTE|BUG|WARN)\b(\(([^)]+)\))?\s*[:-]?\s*(.*)$/;

export const MAX_TODO_ENTRIES = 1000;

export class TodoCollector {
	#entries: TodoEntry[] = [];
	#truncated = false;

	scanLine(line: string, filePath: string, lineNumber: number): void {
		if (this.#truncated) return;

		const match = line.match(TODO_PATTERN);
		if (!match) return;

		if (this.#entries.length >= MAX_TODO_ENTRIES) {
			this.#truncated = true;

			return;
		}

		const [, marker, , owner, text] = match;
		this.#entries.push({
			file: filePath,
			line: lineNumber,
			marker: marker ?? "",
			owner: owner || undefined,
			text: (text ?? "").trim(),
		});
	}

	scanText(text: string, filePath: string): void {
		const lines = text.split("\n");
		for (let index = 0; index < lines.length; index++)
			this.scanLine(lines[index] ?? "", filePath, index + 1);
	}

	getEntries(): TodoEntry[] {
		return this.#entries;
	}

	get truncated(): boolean {
		return this.#truncated;
	}
}
