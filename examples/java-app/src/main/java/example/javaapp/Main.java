package example.javaapp;

public final class Main {

	private Main() {}

	public static void main(String[] args) {
		AppConfig config = Config.loadConfig();
		var lines = Reader.readLines(config.inputPath());
		var report = Processor.buildReport(config.projectName(), lines, config.minLineLength());
		System.out.println(Formatter.formatReport(report));
	}
}
