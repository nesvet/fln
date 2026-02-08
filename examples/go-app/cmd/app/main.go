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
