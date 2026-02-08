from .config import loadConfig
from .formatter import formatReport
from .processor import buildReport
from .reader import readLines


def run() -> str:
	config = loadConfig()
	lines = readLines(config.inputPath)
	report = buildReport(config.projectName, lines, config.minLineLength)
	return formatReport(report)


def main() -> None:
	print(run())


if __name__ == "__main__":
	main()
