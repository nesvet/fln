from .processor import Report


def formatReport(report: Report) -> str:
	lines = [
		f"Project: {report.projectName}",
		f"Lines: {report.lineCount}",
		"Filtered:"
	]
	lines.extend([f"- {line}" for line in report.filteredLines])
	return "\n".join(lines)
