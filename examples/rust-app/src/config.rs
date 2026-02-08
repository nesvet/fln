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
