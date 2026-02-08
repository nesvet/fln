package example.javaapp;

import java.util.List;
import java.util.stream.Collectors;

public final class Processor {

	private Processor() {}

	public record Report(String projectName, int lineCount, List<String> filteredLines) {}

	public static Report buildReport(String projectName, List<String> lines, int minLineLength) {
		List<String> filteredLines = lines.stream()
				.filter(line -> line.length() >= minLineLength)
				.collect(Collectors.toList());
		return new Report(projectName, lines.size(), filteredLines);
	}
}
