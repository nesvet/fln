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
