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
