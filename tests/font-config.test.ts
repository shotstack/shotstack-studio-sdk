/**
 * Regression tests for font configuration and resolution.
 * These tests ensure the correct priority order for font resolution
 * to prevent issues with variable vs static fonts.
 */

import { resolveFontPath, parseFontFamily, isGoogleFont, getFontDisplayName } from "../src/core/fonts/font-config";

describe("Font Configuration", () => {
	describe("resolveFontPath priority order", () => {
		/**
		 * REGRESSION TEST: Built-in fonts must take priority over Google Fonts by display name.
		 *
		 * Bug: "Work Sans" was resolving to Google Fonts (static font) instead of
		 * the CDN (variable font), causing font weight not to apply.
		 *
		 * Fix: Changed priority order so built-in fonts are checked before
		 * Google Fonts by display name.
		 */
		it("resolves built-in fonts before Google Fonts by display name", () => {
			// "Work Sans" exists in both FONT_PATHS and Google Fonts by display name
			// It MUST resolve to the built-in CDN URL (variable font), NOT Google Fonts (static)
			const resolvedUrl = resolveFontPath("Work Sans");

			expect(resolvedUrl).toBe("https://templates.shotstack.io/basic/asset/font/worksans.ttf");
			expect(resolvedUrl).not.toContain("fonts.gstatic.com");
		});

		it("resolves Google Fonts by filename hash (highest priority for FontPicker)", () => {
			// When a user explicitly selects a font via FontPicker, the filename hash is used
			// This should have highest priority as it's an explicit user choice
			const filenameHash = "QGYsz_wNahGAdqQ43RhPe6rol_lQ4A";
			const resolvedUrl = resolveFontPath(filenameHash);

			// Should resolve to Google Fonts URL
			expect(resolvedUrl).toContain("fonts.gstatic.com");
		});

		it("falls back to Google Fonts for non-built-in fonts", () => {
			// Fonts not in FONT_PATHS should fall back to Google Fonts by display name
			const resolvedUrl = resolveFontPath("Playfair Display");

			// Should resolve to Google Fonts (if "Playfair Display" is in google-fonts.ts)
			// or undefined if not found anywhere
			if (resolvedUrl) {
				expect(resolvedUrl).toContain("fonts.gstatic.com");
			}
		});

		it("returns undefined for completely unknown fonts", () => {
			const resolvedUrl = resolveFontPath("NonExistentFontFamily12345");

			expect(resolvedUrl).toBeUndefined();
		});
	});

	describe("built-in font resolution", () => {
		it("resolves built-in fonts by exact name", () => {
			expect(resolveFontPath("Montserrat")).toBe("https://templates.shotstack.io/basic/asset/font/Montserrat.ttf");
			expect(resolveFontPath("Open Sans")).toBe("https://templates.shotstack.io/basic/asset/font/OpenSans.ttf");
			expect(resolveFontPath("Roboto")).toBe("https://templates.shotstack.io/basic/asset/font/Roboto.ttf");
		});

		it("resolves built-in fonts with weight suffix via base name fallback", () => {
			// Weight-specific entries removed — "Montserrat Bold" parses to base "Montserrat" → variable font
			expect(resolveFontPath("Montserrat Bold")).toBe("https://templates.shotstack.io/basic/asset/font/Montserrat.ttf");
			expect(resolveFontPath("Open Sans Bold")).toBe("https://templates.shotstack.io/basic/asset/font/OpenSans.ttf");
		});

		it("resolves built-in fonts by alias", () => {
			// CamelCase aliases should resolve to the canonical font
			expect(resolveFontPath("OpenSans")).toBe("https://templates.shotstack.io/basic/asset/font/OpenSans.ttf");
			expect(resolveFontPath("WorkSans")).toBe("https://templates.shotstack.io/basic/asset/font/worksans.ttf");
		});
	});

	describe("parseFontFamily", () => {
		it("extracts weight from font family name", () => {
			expect(parseFontFamily("Montserrat Bold")).toEqual({
				baseFontFamily: "Montserrat",
				fontWeight: 700
			});
			expect(parseFontFamily("Montserrat ExtraBold")).toEqual({
				baseFontFamily: "Montserrat",
				fontWeight: 800
			});
			expect(parseFontFamily("Open Sans Light")).toEqual({
				baseFontFamily: "Open Sans",
				fontWeight: 300
			});
		});

		it("defaults to weight 400 when no modifier present", () => {
			expect(parseFontFamily("Work Sans")).toEqual({
				baseFontFamily: "Work Sans",
				fontWeight: 400
			});
			expect(parseFontFamily("Roboto")).toEqual({
				baseFontFamily: "Roboto",
				fontWeight: 400
			});
		});

		it("handles case-insensitive weight modifiers", () => {
			// The font family might come with different casing
			expect(parseFontFamily("Montserrat bold")).toEqual({
				baseFontFamily: "Montserrat",
				fontWeight: 700
			});
			expect(parseFontFamily("Montserrat BOLD")).toEqual({
				baseFontFamily: "Montserrat",
				fontWeight: 700
			});
		});
	});

	describe("isGoogleFont", () => {
		it("identifies Google Fonts by filename hash", () => {
			// Work Sans filename hash from FontPicker
			expect(isGoogleFont("QGYsz_wNahGAdqQ43RhPe6rol_lQ4A")).toBe(true);
		});

		it("identifies Google Fonts by display name", () => {
			expect(isGoogleFont("Work Sans")).toBe(true);
			expect(isGoogleFont("Inter")).toBe(true);
		});

		it("returns false for built-in only fonts", () => {
			// MovLette is only in built-in fonts, not Google Fonts
			expect(isGoogleFont("MovLette")).toBe(false);
		});
	});

	describe("getFontDisplayName", () => {
		it("resolves filename hash to display name", () => {
			expect(getFontDisplayName("QGYsz_wNahGAdqQ43RhPe6rol_lQ4A")).toBe("Work Sans");
		});

		it("returns input unchanged for non-hash names", () => {
			expect(getFontDisplayName("Work Sans")).toBe("Work Sans");
			expect(getFontDisplayName("Roboto")).toBe("Roboto");
		});
	});
});

describe("resolveFontPath with weight", () => {
	it("resolves variable font for weight 400", () => {
		expect(resolveFontPath("Roboto", 400)).toBe("https://templates.shotstack.io/basic/asset/font/Roboto.ttf");
	});

	it("resolves variable font for all weights (no weight-specific files needed)", () => {
		// Variable fonts handle all weights via wght axis — same URL for any weight
		expect(resolveFontPath("Roboto", 700)).toBe("https://templates.shotstack.io/basic/asset/font/Roboto.ttf");
		expect(resolveFontPath("Montserrat", 900)).toBe("https://templates.shotstack.io/basic/asset/font/Montserrat.ttf");
		expect(resolveFontPath("Open Sans", 800)).toBe("https://templates.shotstack.io/basic/asset/font/OpenSans.ttf");
	});

	/**
	 * REGRESSION TEST for issue #76: Roboto weight 900 must NOT resolve to
	 * a static font that can't provide weight 900.
	 * With variable fonts, the base font handles all weights via wght axis.
	 */
	it("resolves Roboto weight 900 to CDN variable font", () => {
		const url = resolveFontPath("Roboto", 900);
		expect(url).toBe("https://templates.shotstack.io/basic/asset/font/Roboto.ttf");
	});

	it("resolves alias-based family names with weight", () => {
		expect(resolveFontPath("OpenSans", 700)).toBe("https://templates.shotstack.io/basic/asset/font/OpenSans.ttf");
	});

	it("falls back to weight-specific built-in for non-variable fonts", () => {
		// Clear Sans is static (no variable version) — weight-specific entries still used
		expect(resolveFontPath("Clear Sans", 700)).toBe("https://templates.shotstack.io/basic/asset/font/clearsans-bold.ttf");
	});

	it("resolves Google Fonts by filename hash even with non-default weight", () => {
		// FontPicker selection (filename hash) should always resolve regardless of weight
		const filenameHash = "QGYsz_wNahGAdqQ43RhPe6rol_lQ4A";
		const url = resolveFontPath(filenameHash, 900);
		expect(url).toContain("fonts.gstatic.com");
	});

	it("returns undefined for completely unknown fonts with weight", () => {
		expect(resolveFontPath("NonExistentFont12345", 900)).toBeUndefined();
	});
});

describe("Font Resolution Regression Tests", () => {
	describe("variable font support", () => {
		/**
		 * This test documents the expected behavior for variable font resolution.
		 * Built-in fonts on the CDN include variable fonts that support weight variations.
		 * Google Fonts by display name may serve static fonts that don't support weight.
		 */
		it("Work Sans resolves to CDN variable font, not Google static font", () => {
			const url = resolveFontPath("Work Sans");

			// CDN URL pattern
			expect(url).toMatch(/templates\.shotstack\.io.*worksans\.ttf$/);

			// NOT Google Fonts
			expect(url).not.toContain("gstatic");
			expect(url).not.toContain("googleapis");
		});

		it("all built-in base fonts resolve to CDN, not Google", () => {
			const builtInFonts = ["Montserrat", "Open Sans", "Roboto", "Work Sans"];

			builtInFonts.forEach(fontName => {
				const url = resolveFontPath(fontName);
				expect(url).toContain("templates.shotstack.io");
				expect(url).not.toContain("gstatic");
			});
		});
	});

	describe("priority order documentation", () => {
		it("documents the correct priority order", () => {
			// Priority order (highest to lowest):
			// 1. Google Fonts by filename hash - explicit FontPicker selection
			// 2. Built-in fonts by exact name - curated variable fonts
			// 3. Built-in fonts by alias/base name
			// 4. Google Fonts by display name - fallback

			// This test documents the expected behavior
			const priorities = [
				{
					input: "QGYsz_wNahGAdqQ43RhPe6rol_lQ4A",
					source: "Google Fonts by filename hash",
					expectedPattern: /gstatic/
				},
				{ input: "Work Sans", source: "Built-in fonts (exact)", expectedPattern: /templates\.shotstack\.io/ },
				{ input: "WorkSans", source: "Built-in fonts (alias)", expectedPattern: /templates\.shotstack\.io/ }
			];

			priorities.forEach(({ input, expectedPattern }) => {
				const url = resolveFontPath(input);
				expect(url).toMatch(expectedPattern);
			});
		});
	});
});
