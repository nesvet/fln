import type { Report } from "./processor";

export const formatReport = (report: Report): string => {
	const lines = [
		`Project: ${report.projectName}`,
		`Lines: ${report.lineCount}`,
		`API key configured: ${report.apiKeyConfigured ? "yes" : "no"}`,
		"Filtered:",
	];
	lines.push(...report.filteredLines.map((line) => `- ${line}`));
	return lines.join("\n");
};
