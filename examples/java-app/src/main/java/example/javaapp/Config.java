package example.javaapp;

public record AppConfig(String projectName, String inputPath, int minLineLength) {

	public static AppConfig loadConfig() {
		return new AppConfig("java-app", "sample.txt", 3);
	}
}
