import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { normalizeExcludePattern, normalizeIncludePattern } from "../src/pattern/index.js";


describe("normalizeExcludePattern", () => {
	const base = join("/", "home", "user", "project");
	
	it("keeps pure glob patterns", () => {
		expect(normalizeExcludePattern("*.ts", base)).toBe("**/*.ts");
		expect(normalizeExcludePattern("**/*.test.ts", base)).toBe("**/*.test.ts");
	});
	
	it("normalizes path with glob", () => {
		expect(normalizeExcludePattern("src/**/*.test.ts", base)).toBe("src/**/*.test.ts");
	});
	
	it("handles negation", () => {
		expect(normalizeExcludePattern("!important", base)).toBe("!**/important");
	});
	
	it("returns null for pattern resolving outside base", () => {
		expect(normalizeExcludePattern("../outside", base)).toBeNull();
		expect(normalizeExcludePattern("../sibling/file", base)).toBeNull();
	});
	
	it("strips leading ./ from path", () => {
		expect(normalizeExcludePattern("./dist", base)).toBe("**/dist");
	});
	
	it("handles directory pattern with trailing slash", () => {
		expect(normalizeExcludePattern("node_modules/", base)).toBe("**/node_modules");
	});
	
	it("returns null for empty or whitespace pattern", () => {
		expect(normalizeExcludePattern("", base)).toBeNull();
		expect(normalizeExcludePattern("   ", base)).toBeNull();
		expect(normalizeExcludePattern("!", base)).toBeNull();
	});
	
	it("strips leading slash from path", () => {
		expect(normalizeExcludePattern("/dist", base)).toBe("**/dist");
	});
	
	it("handles double negation", () => {
		expect(normalizeExcludePattern("!!important", base)).toBe("**/important");
	});
	
	it("handles bare folder name without glob", () => {
		expect(normalizeExcludePattern("folder", base)).toBe("**/folder");
	});
	
	it("handles brace expansion in path", () => {
		expect(normalizeExcludePattern("src/{a,b}.ts", base)).toBe("src/{a,b}.ts");
	});
	
	it("handles escaped negation", () => {
		expect(normalizeExcludePattern(String.raw`\!important`, base)).toBe("**/!important");
	});
});

describe("normalizeIncludePattern", () => {
	const base = join("/", "home", "user", "project");
	
	it("keeps pure glob patterns", () => {
		expect(normalizeIncludePattern("*.ts", base)).toBe("**/*.ts");
		expect(normalizeIncludePattern("**/*.ts", base)).toBe("**/*.ts");
	});
	
	it("normalizes path with glob", () => {
		expect(normalizeIncludePattern("src/**", base)).toBe("src/**");
	});
	
	it("returns null for pattern resolving outside base", () => {
		expect(normalizeIncludePattern("../outside", base)).toBeNull();
	});
	
	it("strips leading ./ from path", () => {
		expect(normalizeIncludePattern("./src/**", base)).toBe("src/**");
	});
	
	it("handles path with glob in middle", () => {
		expect(normalizeIncludePattern("src/**/*.ts", base)).toBe("src/**/*.ts");
	});
	
	it("returns null for empty or whitespace pattern", () => {
		expect(normalizeIncludePattern("", base)).toBeNull();
		expect(normalizeIncludePattern("   ", base)).toBeNull();
	});
	
	it("strips leading slash from path", () => {
		expect(normalizeIncludePattern("/src/**", base)).toBe("src/**");
	});
	
	it("handles character class in path", () => {
		expect(normalizeIncludePattern("src/[id]/file.ts", base)).toBe("src/[id]/file.ts");
	});
});
