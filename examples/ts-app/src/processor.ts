export type Report = {
	projectName: string;
	lineCount: number;
	filteredLines: string[];
	apiKeyConfigured: boolean;
};

export const buildReport = (
	projectName: string,
	lines: string[],
	minLineLength: number,
	apiKeyConfigured: boolean,
): Report => {
	const filteredLines = lines.filter((line) => line.length >= minLineLength);
	return {
		projectName,
		lineCount: lines.length,
		filteredLines,
		apiKeyConfigured,
	};
};
