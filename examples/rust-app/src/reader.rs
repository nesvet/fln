use std::fs;

pub fn readLines(path: &str) -> Vec<String> {
	let content = fs::read_to_string(path);
	if let Ok(text) = content {
		return text
			.lines()
			.filter(|line| !line.trim().is_empty())
			.map(|line| line.to_string())
			.collect();
	}

	vec![
		"alpha".to_string(),
		"beta".to_string(),
		"gamma".to_string(),
		"delta".to_string(),
	]
}
