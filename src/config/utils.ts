import { readFile, stat } from "node:fs/promises";
import { basename, join, parse } from "node:path";


export function normalizeFileToken(rawValue: string): string {
	return rawValue
		.trim()
		.replaceAll("@", "")
		.replaceAll("/", "-")
		.replaceAll("\\", "-")
		.replaceAll(" ", "-")
		.replaceAll(/[^\w.-]/g, "-")
		.replaceAll(/-+/g, "-")
		.replaceAll(/^[.-]+|[.-]+$/g, "");
}


async function readTextFile(filePath: string): Promise<string | undefined> {
	try {
		return await readFile(filePath, "utf8");
	} catch {
		return undefined;
	}
}

function extractTomlValue(content: string, sectionName: string, key: string): string | undefined {
	const lines = content.split("\n");
	let isInSection = false;
	
	for (const rawLine of lines) {
		const trimmedLine = rawLine.split("#")[0]?.trim() ?? "";
		if (trimmedLine === "")
			continue;
		
		if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
			isInSection = trimmedLine === `[${sectionName}]`;
			continue;
		}
		
		if (!isInSection)
			continue;
		
		const match = trimmedLine.match(new RegExp(String.raw`^${key}\s*=\s*["'](.+)["']\s*$`));
		if (match)
			return match[1];
	}
	
	return undefined;
}


export async function getProjectMetadata(rootDirectory: string): Promise<{ name: string; version?: string }> {
	// Node.js (package.json)
	const packageJsonContent = await readTextFile(join(rootDirectory, "package.json"));
	if (packageJsonContent)
		try {
			const packageJson = JSON.parse(packageJsonContent) as { name?: string; version?: string };
			const normalizedName = packageJson.name ? normalizeFileToken(packageJson.name) : "";
			const normalizedVersion = packageJson.version ? normalizeFileToken(packageJson.version) : "";
			if (normalizedName)
				return {
					name: normalizedName,
					version: normalizedVersion
				};
		} catch {}
	
	// C++ Modern (vcpkg.json)
	const vcpkgContent = await readTextFile(join(rootDirectory, "vcpkg.json"));
	if (vcpkgContent)
		try {
			const vcpkg = JSON.parse(vcpkgContent) as { name?: string; version?: string };
			const normalizedName = vcpkg.name ? normalizeFileToken(vcpkg.name) : "";
			const normalizedVersion = vcpkg.version ? normalizeFileToken(vcpkg.version) : "";
			if (normalizedName)
				return {
					name: normalizedName,
					version: normalizedVersion
				};
		} catch {}
	
	// Python (pyproject.toml)
	const pyprojectContent = await readTextFile(join(rootDirectory, "pyproject.toml"));
	if (pyprojectContent) {
		const pythonName = extractTomlValue(pyprojectContent, "project", "name") ??
			extractTomlValue(pyprojectContent, "tool.poetry", "name");
		const pythonVersion = extractTomlValue(pyprojectContent, "project", "version") ??
			extractTomlValue(pyprojectContent, "tool.poetry", "version");
		
		const normalizedName = pythonName ? normalizeFileToken(pythonName) : "";
		const normalizedVersion = pythonVersion ? normalizeFileToken(pythonVersion) : "";
		if (normalizedName)
			return {
				name: normalizedName,
				version: normalizedVersion
			};
	}
	
	// Rust (Cargo.toml)
	const cargoContent = await readTextFile(join(rootDirectory, "Cargo.toml"));
	if (cargoContent) {
		const rustName = extractTomlValue(cargoContent, "package", "name");
		const rustVersion = extractTomlValue(cargoContent, "package", "version");
		
		const normalizedName = rustName ? normalizeFileToken(rustName) : "";
		const normalizedVersion = rustVersion ? normalizeFileToken(rustVersion) : "";
		if (normalizedName)
			return {
				name: normalizedName,
				version: normalizedVersion
			};
	}
	
	// Go (go.mod)
	const goModContent = await readTextFile(join(rootDirectory, "go.mod"));
	if (goModContent) {
		const match = goModContent.match(/^module\s+(.+)$/m);
		
		if (match) {
			const fullPath = match[1].trim();
			const shortName = fullPath.split("/").pop();
			const normalizedName = shortName ? normalizeFileToken(shortName) : "";
			
			if (normalizedName)
				return {
					name: normalizedName
				};
		}
	}
	
	// C++ Legacy/Standard (CMakeLists.txt)
	const cmakeContent = await readTextFile(join(rootDirectory, "CMakeLists.txt"));
	if (cmakeContent) {
		const nameMatch = cmakeContent.match(/project\s*\(\s*([\w.-]+)/i);
		const versionMatch = cmakeContent.match(/version\s+([\d.]+)/i);
		
		const normalizedName = nameMatch ? normalizeFileToken(nameMatch[1]) : "";
		const normalizedVersion = versionMatch ? normalizeFileToken(versionMatch[1]) : "";
		
		if (normalizedName)
			return {
				name: normalizedName,
				version: normalizedVersion
			};
	}
	
	return {
		name: normalizeFileToken(basename(rootDirectory)) || "project"
	};
}


async function tryStat(pathValue: string): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
	try {
		return await stat(pathValue);
	} catch {
		return undefined;
	}
}

async function resolveUniquePath(filePath: string): Promise<string> {
	const existingStats = await tryStat(filePath);
	if (!existingStats)
		return filePath;
	
	const parsed = parse(filePath);
	let counter = 1;
	
	while (true) {
		const candidatePath = join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
		const candidateStats = await tryStat(candidatePath);
		
		if (!candidateStats)
			return candidatePath;
		
		counter += 1;
	}
}


export async function resolveOutputPath(
	outputValue: string | undefined,
	rootDirectory: string,
	format: "json" | "md"
): Promise<string> {
	const projectMeta = await getProjectMetadata(rootDirectory);
	const baseFileName = projectMeta.version ?
		`${projectMeta.name}-${projectMeta.version}.${format}` :
		`${projectMeta.name}.${format}`;
	
	if (!outputValue)
		return await resolveUniquePath(join(rootDirectory, baseFileName));
	
	if (outputValue === "/dev/null" || outputValue === "nul")
		return outputValue;
	
	const hasTrailingSeparator = /[/\\]+$/.test(outputValue);
	const outputStats = await tryStat(outputValue);
	
	if (hasTrailingSeparator || outputStats?.isDirectory()) {
		const filePath = join(outputValue, baseFileName);
		
		return await resolveUniquePath(filePath);
	}
	
	return await resolveUniquePath(outputValue);
}
