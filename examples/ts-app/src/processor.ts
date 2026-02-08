export type Report = {
	projectName: string;
	lineCount: number;
	filteredLines: string[];
};

export const buildReport = (
	projectName: string,
	lines: string[],
	minLineLength: number
): Report => {
	const filteredLines = lines.filter((line) => line.length >= minLineLength);
	return {
		projectName,
		lineCount: lines.length,
		filteredLines
	};
};
