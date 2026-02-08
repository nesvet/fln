use crate::processor::Report;

pub fn formatReport(report: Report) -> String {
	let mut lines = vec![
		format!("Project: {}", report.projectName),
		format!("Lines: {}", report.lineCount),
		"Filtered:".to_string(),
	];
	for line in report.filteredLines {
		lines.push(format!("- {}", line));
	}

	lines.join("\n")
}
