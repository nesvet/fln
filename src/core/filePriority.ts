const lowPriorityDirNames = new Set([
	"tests",
	"test",
	"__tests__",
	"__mocks__",
	"fixtures",
	"mocks",
	"vendor",
	"third_party",
	"3rd_party",
	"thirdparty",
	"generated",
	"build",
	"dist",
	"out",
	"target",
	".next",
	".nuxt",
	"coverage",
	".cache",
	"e2e",
	"playwright",
	"cypress",
	".vscode-test",
]);

function isInLowPriorityDir(filePath: string): boolean {
	const segments = filePath
		.replaceAll("\\", "/")
		.toLowerCase()
		.split("/")
		.filter(Boolean);

	return segments
		.slice(0, -1)
		.some((segment) => lowPriorityDirNames.has(segment));
}

export function getFileScore(fileName: string, filePath?: string): number {
	const lowerName = fileName.toLowerCase();
	const inLowPriorityDir = filePath ? isInLowPriorityDir(filePath) : false;

	if (lowerName.startsWith("readme")) return 0;

	if (
		lowerName === "package.json" ||
		lowerName.startsWith("tsconfig") ||
		lowerName === "pyproject.toml" ||
		lowerName === "cargo.toml" ||
		lowerName === "go.mod" ||
		lowerName === "cmakelists.txt" ||
		lowerName === "makefile" ||
		lowerName === "dockerfile" ||
		lowerName === "vcpkg.json" ||
		lowerName === "pom.xml" ||
		lowerName.startsWith(".env") ||
		lowerName.includes(".config.") ||
		lowerName.startsWith(".prettier") ||
		lowerName.startsWith(".eslintrc")
	)
		return 1;

	if (
		!inLowPriorityDir &&
		(lowerName.startsWith("index.") ||
			lowerName.startsWith("main.") ||
			lowerName.startsWith("app.") ||
			lowerName.startsWith("server.") ||
			lowerName.startsWith("mod.") ||
			lowerName.startsWith("lib."))
	)
		return 2;

	if (
		!inLowPriorityDir &&
		(lowerName.includes("types") ||
			lowerName.includes("interface") ||
			lowerName.includes("schema") ||
			lowerName.includes("config") ||
			lowerName.includes("constants") ||
			lowerName.endsWith(".d.ts") ||
			lowerName.endsWith(".h") ||
			lowerName.endsWith(".hpp"))
	)
		return 3;

	if (
		lowerName.startsWith("license") ||
		lowerName.startsWith("changelog") ||
		lowerName.startsWith("contributing") ||
		lowerName.startsWith("code_of_conduct") ||
		lowerName.startsWith("security")
	)
		return 15;

	if (
		lowerName.includes(".test.") ||
		lowerName.includes(".spec.") ||
		lowerName.startsWith("test_") ||
		lowerName.endsWith("_test.go")
	)
		return 20;

	if (inLowPriorityDir) return 15;

	return 10;
}

export function compareFilePriority(
	left: { name: string; path: string },
	right: { name: string; path: string },
): number {
	const scoreDelta =
		getFileScore(left.name, left.path) - getFileScore(right.name, right.path);
	if (scoreDelta !== 0) return scoreDelta;

	return left.name.localeCompare(right.name, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

export function sortFileNodesByPriority(
	fileNodes: { name: string; path: string }[],
): void {
	fileNodes.sort((left, right) => compareFilePriority(left, right));
}
