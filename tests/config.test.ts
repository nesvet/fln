import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { getProjectMetadata, resolveOutputPath } from "../src/config/index.js";


async function createTempProject(name: string, version?: string): Promise<string> {
	const rootDirectory = await mkdtemp(join(tmpdir(), "fln-config-test-"));
	const packageJson = version === undefined ? { name } : { name, version };
	await writeFile(join(rootDirectory, "package.json"), JSON.stringify(packageJson, null, "\t"));
	
	return rootDirectory;
}

async function createTempPomProject(pomContent: string): Promise<string> {
	const rootDirectory = await mkdtemp(join(tmpdir(), "fln-config-test-"));
	await writeFile(join(rootDirectory, "pom.xml"), pomContent);
	
	return rootDirectory;
}

describe("resolveOutputPath", () => {
	it("returns join(input, baseFileName) when outputValue is undefined", async () => {
		const input = await createTempProject("my-project", "1.0.0");
		const projectMetadata = await getProjectMetadata(input);
		const result = await resolveOutputPath(undefined, input, projectMetadata, true, "md");
		expect(result).toBe(join(input, "my-project-1.0.0.md"));
	});
	
	it("returns outputValue as-is when it is /dev/null or nul", async () => {
		const input = await createTempProject("p", "1.0.0");
		const projectMetadata = await getProjectMetadata(input);
		expect(await resolveOutputPath("/dev/null", input, projectMetadata, true, "md")).toBe("/dev/null");
		expect(await resolveOutputPath("nul", input, projectMetadata, true, "md")).toBe("nul");
	});
	
	it("returns outputValue as-is when it is - (stdout)", async () => {
		const input = await createTempProject("p", "1.0.0");
		const projectMetadata = await getProjectMetadata(input);
		expect(await resolveOutputPath("-", input, projectMetadata, true, "md")).toBe("-");
	});
	
	it("returns join(outputValue, baseFileName) when outputValue is directory", async () => {
		const input = await createTempProject("dir-output", "2.0.0");
		const projectMetadata = await getProjectMetadata(input);
		const outputDir = join(input, "out");
		await mkdir(outputDir, { recursive: true });
		
		const result = await resolveOutputPath(outputDir, input, projectMetadata, true, "md");
		expect(result).toBe(join(outputDir, "dir-output-2.0.0.md"));
	});
	
	it("returns join(outputValue, baseFileName) when outputValue has trailing slash", async () => {
		const input = await createTempProject("trailing", "1.0.0");
		const projectMetadata = await getProjectMetadata(input);
		const outputDir = join(input, "dist");
		await mkdir(outputDir, { recursive: true });
		
		const result = await resolveOutputPath(`${outputDir}/`, input, projectMetadata, true, "json");
		expect(result).toBe(join(outputDir, "trailing-1.0.0.json"));
	});
	
	it("returns path when outputValue is file and does not exist", async () => {
		const input = await createTempProject("new-file", "1.0.0");
		const projectMetadata = await getProjectMetadata(input);
		const outputFile = join(input, "custom-output.md");
		
		const result = await resolveOutputPath(outputFile, input, projectMetadata, true, "md");
		expect(result).toBe(outputFile);
	});
	
	it("appends .md when outputValue has no extension and format is md", async () => {
		const input = await createTempProject("fln", "1.2.0");
		const projectMetadata = await getProjectMetadata(input);
		const outputFile = join(input, "fln-1.2.0");
		
		const result = await resolveOutputPath(outputFile, input, projectMetadata, true, "md");
		expect(result).toBe(join(input, "fln-1.2.0.md"));
	});
	
	it("appends .json when outputValue has no extension and format is json", async () => {
		const input = await createTempProject("fln", "1.2.0");
		const projectMetadata = await getProjectMetadata(input);
		const outputFile = join(input, "fln-1.2.0");
		
		const result = await resolveOutputPath(outputFile, input, projectMetadata, true, "json");
		expect(result).toBe(join(input, "fln-1.2.0.json"));
	});
	
	it("leaves path unchanged when outputValue has explicit extension", async () => {
		const input = await createTempProject("fln", "1.2.0");
		const projectMetadata = await getProjectMetadata(input);
		const outputFile = join(input, "fln-1.2.0.txt");
		
		const result = await resolveOutputPath(outputFile, input, projectMetadata, true, "md");
		expect(result).toBe(outputFile);
	});
	
	it("returns path-name-1.ext when file exists and overwrite is false", async () => {
		const input = await createTempProject("existing", "1.0.0");
		const projectMetadata = await getProjectMetadata(input);
		const outputFile = join(input, "existing-1.0.0.md");
		await writeFile(outputFile, "content");
		
		const result = await resolveOutputPath(outputFile, input, projectMetadata, false, "md");
		expect(result).toBe(join(input, "existing-1.0.0-1.md"));
	});
	
	it("returns path when file exists and overwrite is true", async () => {
		const input = await createTempProject("overwrite", "1.0.0");
		const projectMetadata = await getProjectMetadata(input);
		const outputFile = join(input, "overwrite-1.0.0.md");
		await writeFile(outputFile, "content");
		
		const result = await resolveOutputPath(outputFile, input, projectMetadata, true, "md");
		expect(result).toBe(outputFile);
	});
	
	it("increments counter when -1 file also exists", async () => {
		const input = await createTempProject("increment", "1.0.0");
		const projectMetadata = await getProjectMetadata(input);
		const baseFile = join(input, "increment-1.0.0.md");
		await writeFile(baseFile, "a");
		await writeFile(join(input, "increment-1.0.0-1.md"), "b");
		
		const result = await resolveOutputPath(baseFile, input, projectMetadata, false, "md");
		expect(result).toBe(join(input, "increment-1.0.0-2.md"));
	});
	
	it("uses name only when project has no version", async () => {
		const input = await createTempProject("no-version");
		const projectMetadata = await getProjectMetadata(input);
		const result = await resolveOutputPath(undefined, input, projectMetadata, true, "md");
		expect(result).toBe(join(input, "no-version.md"));
	});
	
	it("falls back to basename when project has no package.json", async () => {
		const parent = await mkdtemp(join(tmpdir(), "fln-"));
		const root = join(parent, "basename-project");
		await mkdir(root, { recursive: true });
		const projectMetadata = await getProjectMetadata(root);
		
		const result = await resolveOutputPath(undefined, root, projectMetadata, true, "md");
		expect(result).toBe(join(root, "basename-project.md"));
	});
});

describe("getProjectMetadata (pom.xml)", () => {
	it("extracts artifactId and version", async () => {
		const input = await createTempPomProject(`
			<project>
				<artifactId>my-app</artifactId>
				<version>1.2.0</version>
			</project>
		`);
		const projectMetadata = await getProjectMetadata(input);
		const result = await resolveOutputPath(undefined, input, projectMetadata, true, "md");
		expect(result).toBe(join(input, "my-app-1.2.0.md"));
	});
	
	it("uses parent version when project has no version", async () => {
		const input = await createTempPomProject(`
			<project>
				<parent>
					<artifactId>parent-app</artifactId>
					<version>2.0.0</version>
				</parent>
				<artifactId>child-module</artifactId>
			</project>
		`);
		const projectMetadata = await getProjectMetadata(input);
		const result = await resolveOutputPath(undefined, input, projectMetadata, true, "md");
		expect(result).toBe(join(input, "child-module-2.0.0.md"));
	});
	
	it("skips version when it is a property reference", async () => {
		const input = await createTempPomProject(`
			<project>
				<artifactId>my-app</artifactId>
				<version>\${revision}</version>
			</project>
		`);
		const projectMetadata = await getProjectMetadata(input);
		const result = await resolveOutputPath(undefined, input, projectMetadata, true, "md");
		expect(result).toBe(join(input, "my-app.md"));
	});
	
	it("normalizes artifactId with dots", async () => {
		const input = await createTempPomProject(`
			<project>
				<artifactId>my.app.core</artifactId>
				<version>1.0</version>
			</project>
		`);
		const projectMetadata = await getProjectMetadata(input);
		const result = await resolveOutputPath(undefined, input, projectMetadata, true, "md");
		expect(result).toBe(join(input, "my.app.core-1.0.md"));
	});
	
	it("ignores artifactId inside dependencies", async () => {
		const input = await createTempPomProject(`
			<project>
				<artifactId>my-app</artifactId>
				<version>1.0.0</version>
				<dependencies>
					<dependency>
						<artifactId>spring-core</artifactId>
					</dependency>
				</dependencies>
			</project>
		`);
		const projectMetadata = await getProjectMetadata(input);
		const result = await resolveOutputPath(undefined, input, projectMetadata, true, "md");
		expect(result).toBe(join(input, "my-app-1.0.0.md"));
	});
});
