package example.javaapp;

import java.util.StringJoiner;

import example.javaapp.Processor.Report;

public final class Formatter {

	private Formatter() {}

	public static String formatReport(Report report) {
		StringJoiner joiner = new StringJoiner("\n");
		joiner.add("Project: " + report.projectName());
		joiner.add("Lines: " + report.lineCount());
		joiner.add("Filtered:");
		for (String line : report.filteredLines()) {
			joiner.add("- " + line);
		}
		return joiner.toString();
	}
}
