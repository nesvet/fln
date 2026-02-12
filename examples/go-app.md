<!-- 🥞 fln 1.1.3 -->

# Codebase Snapshot: go-app

Generated: 2026-01-01 00:00  
Files: 7 | Directories: 8

---

## Directory Tree
```text
├── README.md
├── go.mod
├── cmd
│   └── app
│       └── main.go
└── internal
    ├── config
    │   └── config.go
    ├── formatter
    │   └── formatter.go
    ├── processor
    │   └── processor.go
    └── reader
        └── reader.go
```

---

## Source Files

### README.md
```md
# go-app

Go app example.
```

### go.mod
```mod
module example.com/go-app

go 1.22
```

### cmd/app/main.go
```go
package main

import (
	"fmt"

	"example.com/go-app/internal/config"
	"example.com/go-app/internal/formatter"
	"example.com/go-app/internal/processor"
	"example.com/go-app/internal/reader"
)

func main() {
	appConfig := config.LoadConfig()
	lines := reader.ReadLines(appConfig.InputPath)
	report := processor.BuildReport(appConfig.ProjectName, lines, appConfig.MinLineLength)
	fmt.Println(formatter.FormatReport(report))
}
```

### internal/config/config.go
```go
package config

type Config struct {
	ProjectName   string
	InputPath     string
	MinLineLength int
}

func LoadConfig() Config {
	return Config{
		ProjectName:   "go-app",
		InputPath:     "sample.txt",
		MinLineLength: 3,
	}
}
```

### internal/formatter/formatter.go
```go
package formatter

import (
	"strconv"
	"strings"

	"example.com/go-app/internal/processor"
)

func FormatReport(report processor.Report) string {
	lines := []string{
		"Project: " + report.ProjectName,
		"Lines: " + formatCount(report.LineCount),
		"Filtered:",
	}
	for _, line := range report.FilteredLines {
		lines = append(lines, "- "+line)
	}

	return strings.Join(lines, "\n")
}

func formatCount(value int) string {
	return strconv.Itoa(value)
}
```

### internal/processor/processor.go
```go
package processor

type Report struct {
	ProjectName   string
	LineCount     int
	FilteredLines []string
}

func BuildReport(projectName string, lines []string, minLineLength int) Report {
	filteredLines := make([]string, 0, len(lines))
	for _, line := range lines {
		if len(line) >= minLineLength {
			filteredLines = append(filteredLines, line)
		}
	}

	return Report{
		ProjectName:   projectName,
		LineCount:     len(lines),
		FilteredLines: filteredLines,
	}
}
```

### internal/reader/reader.go
```go
package reader

import (
	"os"
	"strings"
)

func ReadLines(path string) []string {
	content, err := os.ReadFile(path)
	if err != nil {
		return []string{"alpha", "beta", "gamma", "delta"}
	}

	lines := strings.Split(string(content), "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		if line != "" {
			result = append(result, line)
		}
	}

	return result
}
```
