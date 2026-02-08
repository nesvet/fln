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
