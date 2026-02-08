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
