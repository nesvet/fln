import { describe, expect, it } from "bun:test";
import { formatDateTime, parseDate } from "../src/infra/datetime.js";

describe("datetime utilities", () => {
	it("formatDateTime returns YYYY-MM-DD HH:mm", () => {
		expect(formatDateTime()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
	});

	it("parseDate accepts valid format", () => {
		expect(parseDate("2026-02-08 12:00")).toBe("2026-02-08 12:00");
		expect(parseDate("  2026-02-08 12:00  ")).toBe("2026-02-08 12:00");
	});

	it("parseDate throws on invalid format", () => {
		expect(() => parseDate("invalid")).toThrow("Invalid date");
		expect(() => parseDate("invalid")).toThrow(
			"Expected format: YYYY-MM-DD HH:mm",
		);
		expect(() => parseDate("2026-02-08")).toThrow("Invalid date");
		expect(() => parseDate("12:00")).toThrow("Invalid date");
	});
});
