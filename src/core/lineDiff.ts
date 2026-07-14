export function computeUnifiedHunks(
	path: string,
	beforeText: string,
	afterText: string,
	maxHunks = 20,
): string[] {
	const beforeLines = beforeText.split("\n");
	const afterLines = afterText.split("\n");
	const hunks: string[] = [];
	const context = 3;
	let indexBefore = 0;
	let indexAfter = 0;

	while (
		indexBefore < beforeLines.length &&
		indexAfter < afterLines.length &&
		hunks.length < maxHunks
	) {
		if (beforeLines[indexBefore] === afterLines[indexAfter]) {
			indexBefore += 1;
			indexAfter += 1;
			continue;
		}

		const startBefore = Math.max(0, indexBefore - context);
		const startAfter = Math.max(0, indexAfter - context);
		let endBefore = indexBefore;
		let endAfter = indexAfter;

		while (
			endBefore < beforeLines.length &&
			endAfter < afterLines.length &&
			beforeLines[endBefore] !== afterLines[endAfter]
		) {
			endBefore += 1;
			endAfter += 1;
		}

		const oldChunk = beforeLines.slice(startBefore, endBefore);
		const newChunk = afterLines.slice(startAfter, endAfter);
		const hunkLines = [
			`--- a/${path}`,
			`+++ b/${path}`,
			`@@ -${startBefore + 1},${oldChunk.length} +${startAfter + 1},${newChunk.length} @@`,
			...oldChunk.map((line) => `-${line}`),
			...newChunk.map((line) => `+${line}`),
		];
		hunks.push(hunkLines.join("\n"));
		indexBefore = endBefore;
		indexAfter = endAfter;
	}

	return hunks;
}
