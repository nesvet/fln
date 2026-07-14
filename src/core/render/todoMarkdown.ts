import type { TodoCollector } from "./todoCollector.js";

export async function writeTodoSection(
	writeLine: (line: string) => Promise<void>,
	collector: TodoCollector,
): Promise<void> {
	const entries = collector.getEntries();
	if (entries.length === 0) return;

	await writeLine("## TODOs & Notes");
	await writeLine("");

	for (const entry of entries) {
		const owner = entry.owner ? `(${entry.owner})` : "";
		await writeLine(
			`${entry.file}:${entry.line}  ${entry.marker}${owner} ${entry.text}`.trimEnd(),
		);
	}

	if (collector.truncated)
		await writeLine("<!-- more entries omitted (cap 1000) -->");

	await writeLine("");
}
