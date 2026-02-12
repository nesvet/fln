import { describe, expect, it } from "bun:test";
import { formatDateTime, parseGeneratedDate } from "../src/infra/datetime.js";


describe("datetime utilities", () => {
	it("formatDateTime returns YYYY-MM-DD HH:mm", () => {
		expect(formatDateTime()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
	});
	
	it("parseGeneratedDate accepts valid format", () => {
		expect(parseGeneratedDate("2026-02-08 12:00")).toBe("2026-02-08 12:00");
		expect(parseGeneratedDate("  2026-02-08 12:00  ")).toBe("2026-02-08 12:00");
	});
	
	it("parseGeneratedDate throws on invalid format", () => {
		expect(() => parseGeneratedDate("invalid")).toThrow("Invalid generated date");
		expect(() => parseGeneratedDate("invalid")).toThrow("Expected format: YYYY-MM-DD HH:mm");
		expect(() => parseGeneratedDate("2026-02-08")).toThrow("Invalid generated date");
		expect(() => parseGeneratedDate("12:00")).toThrow("Invalid generated date");
	});
});
