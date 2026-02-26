import { readFile, stat } from "node:fs/promises";
import { basename, join, parse } from "node:path";
import { hasTrailingSeparator, isNullishOutput } from "../path/index.js";


export function normalizeFileToken(rawValue: string): string {
	return rawValue
		.trim()
		.replaceAll(/[^\w.-]+/g, "-")
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

export async function getProjectMetadata(input: string): Promise<{ name: string; version?: string }> {
	// Node.js (package.json)
	const packageJsonContent = await readTextFile(join(input, "package.json"));
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
	const vcpkgContent = await readTextFile(join(input, "vcpkg.json"));
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
	
	// Java/Kotlin (pom.xml)
	const pomContent = await readTextFile(join(input, "pom.xml"));
	if (pomContent) {
		const projectSection = pomContent
			.replace(/<dependencies[\S\s]*/i, "")
			.replace(/<build[\S\s]*/i, "")
			.replace(/<profiles[\S\s]*/i, "")
			.replace(/<dependencymanagement[\S\s]*/i, "");
		const projectWithoutParent = projectSection.replace(/<parent[\S\s]*?<\/parent>/i, "");
		const artifactIdMatch = projectWithoutParent.match(/<artifactid>\s*([^\s<]+)\s*<\/artifactid>/i);
		if (artifactIdMatch) {
			const normalizedName = normalizeFileToken(artifactIdMatch[1]);
			if (normalizedName) {
				const directVersionMatch = projectSection
					.replace(/<parent[\S\s]*?<\/parent>/i, "")
					.match(/<version>\s*([^\s$<][^\s<]*)\s*<\/version>/i);
				const parentVersionMatch = projectSection.match(
					/<parent[\S\s]*?<version>\s*([^\s$<][^\s<]*)\s*<\/version>[\S\s]*?<\/parent>/i
				);
				const rawVersion = directVersionMatch?.[1] ?? parentVersionMatch?.[1];
				const normalizedVersion = rawVersion ? normalizeFileToken(rawVersion) : "";
				
				return {
					name: normalizedName,
					...(normalizedVersion && { version: normalizedVersion })
				};
			}
		}
	}
	
	// Python (pyproject.toml)
	const pyprojectContent = await readTextFile(join(input, "pyproject.toml"));
	if (pyprojectContent) {
		const pythonName = pyprojectContent.match(/^\[project][^[]*?^name\s*=\s*["']([^\n\r"']+)["']/ms)?.[1] ??
			pyprojectContent.match(/^\[tool\.poetry][^[]*?^name\s*=\s*["']([^\n\r"']+)["']/ms)?.[1];
		const pythonVersion = pyprojectContent.match(/^\[project][^[]*?^version\s*=\s*["']([^\n\r"']+)["']/ms)?.[1] ??
			pyprojectContent.match(/^\[tool\.poetry][^[]*?^version\s*=\s*["']([^\n\r"']+)["']/ms)?.[1];
		
		const normalizedName = pythonName ? normalizeFileToken(pythonName) : "";
		const normalizedVersion = pythonVersion ? normalizeFileToken(pythonVersion) : "";
		if (normalizedName)
			return {
				name: normalizedName,
				version: normalizedVersion
			};
	}
	
	// Rust (Cargo.toml)
	const cargoContent = await readTextFile(join(input, "Cargo.toml"));
	if (cargoContent) {
		const rustName = cargoContent.match(/^\[package][^[]*?^name\s*=\s*["']([^\n\r"']+)["']/ms)?.[1];
		const rustVersion = cargoContent.match(/^\[package][^[]*?^version\s*=\s*["']([^\n\r"']+)["']/ms)?.[1];
		
		const normalizedName = rustName ? normalizeFileToken(rustName) : "";
		const normalizedVersion = rustVersion ? normalizeFileToken(rustVersion) : "";
		if (normalizedName)
			return {
				name: normalizedName,
				version: normalizedVersion
			};
	}
	
	// Go (go.mod)
	const goModContent = await readTextFile(join(input, "go.mod"));
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
	const cmakeContent = await readTextFile(join(input, "CMakeLists.txt"));
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
		name: normalizeFileToken(basename(input)) || "project"
	};
}


async function tryStat(pathValue: string): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
	try {
		return await stat(pathValue);
	} catch {
		return undefined;
	}
}

async function resolveUniquePath(filePath: string, overwrite: boolean): Promise<string> {
	if (overwrite)
		return filePath;
	
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
	input: string,
	projectMetadata: { name: string; version?: string },
	overwrite: boolean,
	format: "json" | "md"
): Promise<string> {
	const baseFileName = projectMetadata.version ?
		`${projectMetadata.name}-${projectMetadata.version}.${format}` :
		`${projectMetadata.name}.${format}`;
	
	if (!outputValue)
		return await resolveUniquePath(join(input, baseFileName), overwrite);
	
	if (outputValue === "-")
		return "-";
	
	if (isNullishOutput(outputValue))
		return outputValue;
	
	const hasTrailingSep = hasTrailingSeparator(outputValue);
	const outputStats = await tryStat(outputValue);
	
	if (hasTrailingSep || outputStats?.isDirectory()) {
		const filePath = join(outputValue, baseFileName);
		
		return await resolveUniquePath(filePath, overwrite);
	}
	
	const hasRealExtension = /\.[A-Za-z]+$/.test(outputValue);
	const filePath = hasRealExtension ? outputValue : `${outputValue}.${format}`;
	
	return await resolveUniquePath(filePath, overwrite);
}
