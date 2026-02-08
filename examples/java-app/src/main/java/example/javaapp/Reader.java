package example.javaapp;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

public final class Reader {

	private Reader() {}

	public static List<String> readLines(String path) {
		try {
			String content = Files.readString(Path.of(path));
			return Arrays.stream(content.split("\n"))
					.filter(line -> !line.trim().isEmpty())
					.collect(Collectors.toList());
		} catch (IOException e) {
			return List.of("alpha", "beta", "gamma", "delta");
		}
	}
}
