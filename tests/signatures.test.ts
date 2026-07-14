import { describe, expect, it } from "bun:test";
import { compressContent } from "../src/core/compress.js";
import {
	extractSignatures,
	isSignatureExtractionSupported,
} from "../src/core/signatures.js";

describe("isSignatureExtractionSupported", () => {
	it("supports TS/JS extensions", () => {
		expect(isSignatureExtractionSupported("test.ts")).toBe(true);
		expect(isSignatureExtractionSupported("test.tsx")).toBe(true);
		expect(isSignatureExtractionSupported("test.js")).toBe(true);
		expect(isSignatureExtractionSupported("test.jsx")).toBe(true);
		expect(isSignatureExtractionSupported("test.mjs")).toBe(true);
		expect(isSignatureExtractionSupported("test.cjs")).toBe(true);
	});

	it("supports Python, Go, Rust, Java", () => {
		expect(isSignatureExtractionSupported("test.py")).toBe(true);
		expect(isSignatureExtractionSupported("test.go")).toBe(true);
		expect(isSignatureExtractionSupported("test.rs")).toBe(true);
		expect(isSignatureExtractionSupported("Test.java")).toBe(true);
	});

	it("does not support unsupported extensions", () => {
		expect(isSignatureExtractionSupported("test.md")).toBe(false);
		expect(isSignatureExtractionSupported("test.css")).toBe(false);
		expect(isSignatureExtractionSupported("test.json")).toBe(false);
		expect(isSignatureExtractionSupported("test.txt")).toBe(false);
	});
});

describe("extractSignatures — TypeScript", () => {
	it("extracts function signatures, drops bodies", () => {
		const code = [
			"import { readFile } from 'node:fs/promises';",
			"",
			"export function greet(name: string): string {",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: test fixture string
			"  return `Hello, ${name}`;",
			"}",
			"",
			"function helper(): void {",
			"  console.log('helper');",
			"}",
		].join("\n");

		const { text, hadBodyOmission } = extractSignatures(code, "test.ts");

		expect(text).toContain("import { readFile }");
		expect(text).toContain("export function greet(name: string): string");
		expect(text).toContain("function helper(): void");
		// biome-ignore lint/suspicious/noTemplateCurlyInString: asserting template literal was stripped
		expect(text).not.toContain("Hello, ${name}");
		expect(text).not.toContain("console.log('helper')");
		expect(hadBodyOmission).toBe(true);
	});

	it("keeps interface and type declarations (full body)", () => {
		const code = [
			"export interface User {",
			"  name: string;",
			"  age: number;",
			"}",
			"",
			"export type Status = 'active' | 'inactive';",
		].join("\n");

		const { text } = extractSignatures(code, "test.ts");

		expect(text).toContain("export interface User");
		expect(text).toContain("name: string;");
		expect(text).toContain("age: number;");
		expect(text).toContain("export type Status");
	});

	it("keeps class declarations", () => {
		const code = [
			"export class Calculator {",
			"  private value = 0;",
			"  ",
			"  add(n: number): this {",
			"    this.value += n;",
			"    return this;",
			"  }",
			"  ",
			"  result(): number {",
			"    return this.value;",
			"  }",
			"}",
		].join("\n");

		const { text } = extractSignatures(code, "test.ts");

		expect(text).toContain("export class Calculator");
	});

	it("keeps doc comments above declarations", () => {
		const code = [
			"/**",
			" * Greet a user by name.",
			" * @param name - The user's name",
			" */",
			"export function greet(name: string): string {",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: test fixture string
			"  return `Hello, ${name}`;",
			"}",
		].join("\n");

		const { text } = extractSignatures(code, "test.ts");

		expect(text).toContain("Greet a user by name.");
		expect(text).toContain("@param name");
	});

	it("keeps const declarations", () => {
		const code = [
			"export const VERSION = '1.0.0';",
			"export const handler = async () => {",
			"  await something();",
			"};",
		].join("\n");

		const { text } = extractSignatures(code, "test.ts");

		expect(text).toContain("export const VERSION");
		expect(text).toContain("export const handler");
	});
});

describe("extractSignatures — Python", () => {
	it("extracts function signatures, drops bodies", () => {
		const code = [
			"import os",
			"",
			"def greet(name: str) -> str:",
			"    return f'Hello, {name}'",
			"",
			"class Calculator:",
			"    def add(self, n: int) -> int:",
			"        return self.value + n",
		].join("\n");

		const { text, hadBodyOmission } = extractSignatures(code, "test.py");

		expect(text).toContain("import os");
		expect(text).toContain("def greet(name: str) -> str:");
		expect(text).not.toContain("return f'Hello");
		expect(text).toContain("class Calculator:");
		expect(hadBodyOmission).toBe(true);
	});
});

describe("extractSignatures — Go", () => {
	it("extracts function signatures, drops bodies", () => {
		const code = [
			"package main",
			"",
			'import "fmt"',
			"",
			"func greet(name string) string {",
			'    return fmt.Sprintf("Hello, %s", name)',
			"}",
			"",
			"type User struct {",
			"    Name string",
			"    Age  int",
			"}",
		].join("\n");

		const { text, hadBodyOmission } = extractSignatures(code, "test.go");

		expect(text).toContain("package main");
		expect(text).toContain('import "fmt"');
		expect(text).toContain("func greet(name string) string");
		expect(text).not.toContain("Sprintf");
		expect(text).toContain("type User struct");
		expect(hadBodyOmission).toBe(true);
	});
});

describe("extractSignatures — Rust", () => {
	it("extracts function signatures, drops bodies", () => {
		const code = [
			"use std::fs;",
			"",
			"pub fn greet(name: &str) -> String {",
			'    format!("Hello, {}", name)',
			"}",
			"",
			"pub struct User {",
			"    pub name: String,",
			"}",
		].join("\n");

		const { text, hadBodyOmission } = extractSignatures(code, "test.rs");

		expect(text).toContain("use std::fs");
		expect(text).toContain("pub fn greet(name: &str) -> String");
		expect(text).not.toContain("format!");
		expect(text).toContain("pub struct User");
		expect(hadBodyOmission).toBe(true);
	});
});

describe("extractSignatures — unsupported extensions", () => {
	it("returns content unchanged for unsupported extensions", () => {
		const code =
			"# Hello\nThis is markdown.\n\n```ts\nfunction foo() {}\n```\n";
		const { text, hadBodyOmission } = extractSignatures(code, "test.md");

		expect(text).toBe(code);
		expect(hadBodyOmission).toBe(false);
	});
});

describe("compressContent", () => {
	it("uses signature extraction for TS files", () => {
		const code = "export function foo(): void {\n  console.log('hello');\n}\n";
		const result = compressContent(code, "test.ts");

		expect(result).toContain("export function foo(): void");
		expect(result).not.toContain("console.log");
	});

	it("falls back to comment stripping for CSS", () => {
		const css = ".a { color: red; }\n/* comment */\n";
		const result = compressContent(css, "style.css");

		expect(result).toContain(".a { color: red; }");
		expect(result).not.toContain("/* comment */");
	});

	it("returns content unchanged for unsupported files", () => {
		const md = "# Hello\nWorld\n";
		const result = compressContent(md, "test.md");

		expect(result).toBe(md);
	});
});

describe("extractSignatures — preserves string literals", () => {
	it("does not break on strings containing brace-like characters", () => {
		const code = [
			"export const msg = 'function { fake }';",
			"",
			"export function real(): void {",
			"  console.log(msg);",
			"}",
		].join("\n");

		const { text } = extractSignatures(code, "test.ts");

		expect(text).toContain("export const msg");
		expect(text).toContain("export function real(): void");
		expect(text).not.toContain("console.log(msg)");
	});
});

describe("extractSignatures — token reduction", () => {
	it("significantly reduces tokens for implementation-heavy files", () => {
		const lines: string[] = ["import { readFile } from 'node:fs';", ""];
		lines.push("export function process(data: string): string {");
		for (let i = 0; i < 50; i++)
			lines.push(`  const step${i} = data + '${i}';`);
		lines.push("  return step49;", "}");

		const code = lines.join("\n");
		const { text } = extractSignatures(code, "test.ts");

		const originalTokens = Math.ceil(code.length / 4);
		const compressedTokens = Math.ceil(text.length / 4);

		expect(compressedTokens).toBeLessThan(originalTokens / 2);
	});
});
