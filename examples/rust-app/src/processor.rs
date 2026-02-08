pub struct Report {
	pub projectName: String,
	pub lineCount: usize,
	pub filteredLines: Vec<String>,
}

pub fn buildReport(projectName: String, lines: Vec<String>, minLineLength: usize) -> Report {
	let filteredLines = lines
		.iter()
		.filter(|line| line.len() >= minLineLength)
		.map(|line| line.to_string())
		.collect::<Vec<String>>();

	Report {
		projectName,
		lineCount: lines.len(),
		filteredLines,
	}
}
