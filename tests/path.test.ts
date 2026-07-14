import { describe, expect, it } from "bun:test";
import { join, posix, win32 } from "node:path";
import {
	displayInputPath,
	hasTrailingSeparator,
	isNullishOutput,
	resolveFromBase,
	stripLeadingDotSlash,
	toCanonicalRelative,
	toDisplayPath,
	toIgnoreSafePath,
	toPosixPath,
} from "../src/path/index.js";

describe("toCanonicalRelative", () => {
	const base = join("/", "home", "user", "project");

	it("normalizes ./ prefix to path without it", () => {
		expect(toCanonicalRelative("./projects-full", base)).toBe("projects-full");
		expect(toCanonicalRelative("./src/index.ts", base)).toBe("src/index.ts");
	});

	it("returns path as-is when already normalized and inside base", () => {
		expect(toCanonicalRelative("projects-full", base)).toBe("projects-full");
		expect(toCanonicalRelative("src/file.ts", base)).toBe("src/file.ts");
	});

	it("returns null when path resolves outside base", () => {
		expect(toCanonicalRelative("../sibling", base)).toBeNull();
		expect(toCanonicalRelative("../../outside", base)).toBeNull();
		expect(toCanonicalRelative("../my-project/folder", base)).toBeNull();
	});

	it("returns empty string for base itself", () => {
		expect(toCanonicalRelative("", base)).toBe("");
		expect(toCanonicalRelative(".", base)).toBe("");
	});

	it("normalizes path with trailing slash", () => {
		expect(toCanonicalRelative("dist/", base)).toBe("dist");
	});

	it("returns null for empty base", () => {
		expect(toCanonicalRelative("src/file", "")).toBeNull();
	});

	it("normalizes double separators", () => {
		expect(toCanonicalRelative("src//file.ts", base)).toBe("src/file.ts");
	});

	it("handles Windows-style paths when base is Windows", () => {
		const windowsBase = win32.join("C:", "Users", "dev", "project");
		expect(toCanonicalRelative("src/file.ts", windowsBase)).toBe("src/file.ts");
		expect(
			toCanonicalRelative(posix.join("src", "nested", "file.ts"), windowsBase),
		).toBe("src/nested/file.ts");
	});

	it("handles base with trailing slash", () => {
		const baseWithSlash = `${join("/", "home", "user", "project")}/`;
		expect(toCanonicalRelative("src", baseWithSlash)).toBe("src");
	});

	it("normalizes .. in middle of path", () => {
		expect(toCanonicalRelative("src/../other", base)).toBe("other");
		expect(toCanonicalRelative("a/b/../c", base)).toBe("a/c");
	});
});

describe("toPosixPath", () => {
	it("returns path as-is on POSIX", () => {
		expect(toPosixPath("src/file.ts")).toBe("src/file.ts");
	});

	it("converts backslash to forward slash", () => {
		const withBackslash = win32.join("src", "file.ts");
		expect(toPosixPath(withBackslash)).toBe("src/file.ts");
	});

	it("handles mixed separators", () => {
		expect(toPosixPath(String.raw`src\file/mixed.ts`)).toBe(
			"src/file/mixed.ts",
		);
	});
});

describe("toIgnoreSafePath", () => {
	const base = join("/", "home", "user", "project");

	it("returns canonical path for valid input", () => {
		expect(toIgnoreSafePath("src/file.ts", base)).toBe("src/file.ts");
		expect(toIgnoreSafePath("projects-full", base)).toBe("projects-full");
	});

	it("returns null for path outside base", () => {
		expect(toIgnoreSafePath("../sibling", base)).toBeNull();
		expect(toIgnoreSafePath("../my-project/folder", base)).toBeNull();
	});

	it("preserves trailing slash for directories", () => {
		expect(toIgnoreSafePath("src/dir/", base)).toBe("src/dir/");
	});

	it("returns null for empty path", () => {
		expect(toIgnoreSafePath("", base)).toBeNull();
	});

	it("strips ./ prefix from path", () => {
		expect(toIgnoreSafePath("./src/file.ts", base)).toBe("src/file.ts");
		expect(toIgnoreSafePath("./src", base)).toBe("src");
	});
});

describe("resolveFromBase", () => {
	const base = join("/", "home", "user", "project");

	it("returns absolute path as-is", () => {
		expect(resolveFromBase("/tmp/output.json", base)).toBe("/tmp/output.json");
	});

	it("resolves relative path against base", () => {
		expect(resolveFromBase("dist/output.json", base)).toBe(
			join(base, "dist", "output.json"),
		);
	});

	it("handles ./ prefix", () => {
		expect(resolveFromBase("./output.json", base)).toBe(
			join(base, "output.json"),
		);
	});

	it("resolves empty and dot to base", () => {
		expect(resolveFromBase("", base)).toBe(base);
		expect(resolveFromBase(".", base)).toBe(base);
	});

	it("returns base when path is null or undefined", () => {
		expect(resolveFromBase(null, base)).toBe(base);
		expect(resolveFromBase(undefined, base)).toBe(base);
	});
});

describe("stripLeadingDotSlash", () => {
	it("removes ./ prefix", () => {
		expect(stripLeadingDotSlash("./src/file.ts")).toBe("src/file.ts");
		expect(stripLeadingDotSlash("./")).toBe("");
	});

	it("returns path as-is when no ./ prefix", () => {
		expect(stripLeadingDotSlash("src/file.ts")).toBe("src/file.ts");
		expect(stripLeadingDotSlash("")).toBe("");
	});
});

describe("toDisplayPath", () => {
	const base = join("/", "home", "user", "project");

	it("returns canonical path for valid input", () => {
		expect(toDisplayPath("src/file.ts", base)).toBe("src/file.ts");
	});

	it("returns . for empty or base path", () => {
		expect(toDisplayPath("", base)).toBe(".");
		expect(toDisplayPath(".", base)).toBe(".");
	});

	it("strips ./ prefix", () => {
		expect(toDisplayPath("./src", base)).toBe("src");
	});

	it("falls back to stripLeadingDotSlash+toPosix when path is outside base", () => {
		expect(toDisplayPath("../outside", base)).toBe("../outside");
	});
});

describe("displayInputPath", () => {
	const cwd = join("/", "home", "user", "project");

	it("returns . when input resolves to cwd", () => {
		expect(displayInputPath(cwd, cwd)).toBe(".");
		expect(displayInputPath(".", cwd)).toBe(".");
	});

	it("returns relative path under cwd", () => {
		expect(displayInputPath(join(cwd, "src", "cli"), cwd)).toBe("src/cli");
	});

	it("keeps absolute path outside cwd", () => {
		expect(displayInputPath(join("/", "tmp", "other"), cwd)).toBe(
			join("/", "tmp", "other"),
		);
	});
});

describe("hasTrailingSeparator", () => {
	it("returns true for trailing slash", () => {
		expect(hasTrailingSeparator("dist/")).toBe(true);
		expect(hasTrailingSeparator("/tmp/output/")).toBe(true);
	});

	it("returns true for trailing backslash on Windows path", () => {
		expect(hasTrailingSeparator("C:\\output\\")).toBe(true);
	});

	it("returns false when no trailing separator", () => {
		expect(hasTrailingSeparator("dist")).toBe(false);
		expect(hasTrailingSeparator("/tmp/output")).toBe(false);
	});
});

describe("isNullishOutput", () => {
	it("returns true for /dev/null and nul", () => {
		expect(isNullishOutput("/dev/null")).toBe(true);
		expect(isNullishOutput("nul")).toBe(true);
	});

	it("returns false for other paths", () => {
		expect(isNullishOutput("/tmp/output.json")).toBe(false);
		expect(isNullishOutput("")).toBe(false);
	});
});
