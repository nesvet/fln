from pathlib import Path


def readLines(path: str) -> list[str]:
	filePath = Path(path)
	if filePath.is_file():
		return filePath.read_text(encoding="utf-8").splitlines()
	
	return [
		"alpha",
		"beta",
		"gamma",
		"delta"
	]
