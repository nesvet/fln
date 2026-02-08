from dataclasses import dataclass


@dataclass(frozen=True)
class Report:
	projectName: str
	lineCount: int
	filteredLines: list[str]


def buildReport(projectName: str, lines: list[str], minLineLength: int) -> Report:
	filteredLines = [line for line in lines if len(line) >= minLineLength]
	return Report(
		projectName=projectName,
		lineCount=len(lines),
		filteredLines=filteredLines
	)
