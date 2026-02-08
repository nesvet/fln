<!-- 🥞 fln 1.0.0 -->

# Codebase Snapshot: python-app

Generated: 2026-01-01 00:00
Files: 8 | Directories: 3

---

## Directory Tree
```text
├── README.md
├── pyproject.toml
└── src
    └── python_app
        ├── main.py
        ├── config.py
        ├── __init__.py
        ├── formatter.py
        ├── processor.py
        └── reader.py
```

---

## Source Files

### README.md
```md
# python-app

Python app example.
```

### pyproject.toml
```toml
[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.build_meta"

[project]
name = "python-app"
version = "0.1.0"
description = "Compact example project for fln."
readme = "README.md"
requires-python = ">=3.10"

[tool.setuptools.packages.find]
where = ["src"]
```

### src/python_app/main.py
```py
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
```

### src/python_app/config.py
```py
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
```

### src/python_app/__init__.py
```py
from .main import run

__all__ = ["run"]
```

### src/python_app/formatter.py
```py
from .processor import Report


def formatReport(report: Report) -> str:
	lines = [
		f"Project: {report.projectName}",
		f"Lines: {report.lineCount}",
		"Filtered:"
	]
	lines.extend([f"- {line}" for line in report.filteredLines])
	return "\n".join(lines)
```

### src/python_app/processor.py
```py
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
```

### src/python_app/reader.py
```py
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
```
