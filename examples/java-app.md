<!-- 🥞 fln 1.1.2 -->

# Codebase Snapshot: java-app

Generated: 2026-01-01 00:00  
Files: 7 | Directories: 6

---

## Directory Tree
```text
├── README.md
├── pom.xml
└── src
    └── main
        └── java
            └── example
                └── javaapp
                    ├── Main.java
                    ├── Config.java
                    ├── Formatter.java
                    ├── Processor.java
                    └── Reader.java
```

---

## Source Files

### README.md
```md
# java-app

Java app example.
```

### pom.xml
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
	xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
	xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
	<modelVersion>4.0.0</modelVersion>

	<groupId>example</groupId>
	<artifactId>java-app</artifactId>
	<version>0.1.0</version>
	<packaging>jar</packaging>
	<description>Java app example project.</description>

	<properties>
		<maven.compiler.source>17</maven.compiler.source>
		<maven.compiler.target>17</maven.compiler.target>
		<project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
	</properties>
</project>
```

### src/main/java/example/javaapp/Main.java
```java
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
```

### src/main/java/example/javaapp/Config.java
```java
package example.javaapp;

public record AppConfig(String projectName, String inputPath, int minLineLength) {

	public static AppConfig loadConfig() {
		return new AppConfig("java-app", "sample.txt", 3);
	}
}
```

### src/main/java/example/javaapp/Formatter.java
```java
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
```

### src/main/java/example/javaapp/Processor.java
```java
package example.javaapp;

import java.util.List;
import java.util.stream.Collectors;

public final class Processor {

	private Processor() {}

	public record Report(String projectName, int lineCount, List<String> filteredLines) {}

	public static Report buildReport(String projectName, List<String> lines, int minLineLength) {
		List<String> filteredLines = lines.stream()
				.filter(line -> line.length() >= minLineLength)
				.collect(Collectors.toList());
		return new Report(projectName, lines.size(), filteredLines);
	}
}
```

### src/main/java/example/javaapp/Reader.java
```java
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
```
