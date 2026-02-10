<!-- 🥞 fln 1.0.0 -->

# Codebase Snapshot: rust-app

Generated: 2026-01-01 00:00  
Files: 8 | Directories: 2

---

## Directory Tree
```text
├── README.md
├── Cargo.toml
└── src
    ├── lib.rs
    ├── main.rs
    ├── config.rs
    ├── formatter.rs
    ├── processor.rs
    └── reader.rs
```

---

## Source Files

### README.md
```md
# rust-app

Rust app example.
```

### Cargo.toml
```toml
[package]
name = "rust-app"
version = "0.1.0"
edition = "2021"
description = "Compact Rust example project for fln."

[dependencies]
```

### src/lib.rs
```rs
pub mod config;
pub mod formatter;
pub mod processor;
pub mod reader;
```

### src/main.rs
```rs
use rust_app::config::loadConfig;
use rust_app::formatter::formatReport;
use rust_app::processor::buildReport;
use rust_app::reader::readLines;

fn main() {
	let config = loadConfig();
	let lines = readLines(&config.inputPath);
	let report = buildReport(config.projectName, lines, config.minLineLength);
	println!("{}", formatReport(report));
}
```

### src/config.rs
```rs
pub struct AppConfig {
	pub projectName: String,
	pub inputPath: String,
	pub minLineLength: usize,
}

pub fn loadConfig() -> AppConfig {
	AppConfig {
		projectName: "rust-app".to_string(),
		inputPath: "sample.txt".to_string(),
		minLineLength: 3,
	}
}
```

### src/formatter.rs
```rs
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
```

### src/processor.rs
```rs
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
```

### src/reader.rs
```rs
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
```
