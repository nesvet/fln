import { describe, expect, it } from "bun:test";
import { formatByteSize, formatTokenCount, parseByteSize } from "../src/core/size.js";


describe("size utilities", () => {
	it("parses byte sizes", () => {
		expect(parseByteSize("1")).toBe(1);
		expect(parseByteSize("512kb")).toBe(512 * 1024);
		expect(parseByteSize("10mb")).toBe(10 * 1024 * 1024);
		expect(parseByteSize("1.5gb")).toBe(1610612736);
	});
	
	it("formats byte sizes", () => {
		expect(formatByteSize(0)).toBe("0 B");
		expect(formatByteSize(1024)).toBe("1.00 KB");
		expect(formatByteSize(1048576)).toBe("1.00 MB");
		expect(formatByteSize(1073741824)).toBe("1.00 GB");
	});
	
	it("throws on invalid sizes", () => {
		expect(() => parseByteSize("nope")).toThrow("Invalid size");
	});
	
	it("formats token counts", () => {
		expect(formatTokenCount(0)).toBe("≈ 0");
		expect(formatTokenCount(100)).toBe("≈ 100");
		expect(formatTokenCount(999)).toBe("≈ 999");
		expect(formatTokenCount(1000)).toBe("≈ 1.0K");
		expect(formatTokenCount(1500)).toBe("≈ 1.5K");
		expect(formatTokenCount(999_999)).toBe("≈ 1000.0K");
		expect(formatTokenCount(1_000_000)).toBe("≈ 1.0M");
		expect(formatTokenCount(1_500_000)).toBe("≈ 1.5M");
		expect(formatTokenCount(31_192)).toBe("≈ 31.2K");
	});
});
