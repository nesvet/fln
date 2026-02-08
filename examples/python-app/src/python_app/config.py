from dataclasses import dataclass


@dataclass(frozen=True)
class AppConfig:
	projectName: str
	inputPath: str
	minLineLength: int


def loadConfig() -> AppConfig:
	return AppConfig(
		projectName="python-app",
		inputPath="sample.txt",
		minLineLength=3
	)
