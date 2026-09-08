import { sanitizeColor } from "@core/shared/color-utils";

describe("sanitizeColor", () => {
	it("falls back for incomplete hex colors that crash Pixi TextStyle", () => {
		expect(sanitizeColor("#00")).toBe("#ffffff");
		expect(sanitizeColor("#0")).toBe("#ffffff");
		expect(sanitizeColor("")).toBe("#ffffff");
		expect(sanitizeColor("   ")).toBe("#ffffff");
	});

	it("falls back for nullish and non-string values", () => {
		expect(sanitizeColor(undefined)).toBe("#ffffff");
		expect(sanitizeColor(null)).toBe("#ffffff");
	});

	it("preserves valid hex, named, and functional colors", () => {
		expect(sanitizeColor("#ffffff")).toBe("#ffffff");
		expect(sanitizeColor("#fff")).toBe("#fff");
		expect(sanitizeColor("#ff00ff00")).toBe("#ff00ff00");
		expect(sanitizeColor("red")).toBe("red");
		expect(sanitizeColor("rgb(255, 0, 0)")).toBe("rgb(255, 0, 0)");
	});

	it("uses a custom fallback when provided", () => {
		expect(sanitizeColor("#00", "#000000")).toBe("#000000");
	});
});
