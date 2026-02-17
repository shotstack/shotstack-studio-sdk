/**
 * @jest-environment jsdom
 */

import { isSimpleRectSvg, updateSvgViewBox } from "@core/shared/svg-utils";

describe("isSimpleRectSvg", () => {
	it("returns true for simple rect-only SVGs", () => {
		const svg = '<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>';
		expect(isSimpleRectSvg(svg)).toBe(true);
	});

	it("returns true for multiple rect elements", () => {
		const svg = '<svg viewBox="0 0 100 100"><rect x="0" y="0" width="50" height="50"/><rect x="50" y="50" width="50" height="50"/></svg>';
		expect(isSimpleRectSvg(svg)).toBe(true);
	});

	it("returns false for SVGs with paths", () => {
		const svg = '<svg viewBox="0 0 1024 1024"><path d="M226 17h560v107H226z"/></svg>';
		expect(isSimpleRectSvg(svg)).toBe(false);
	});

	it("returns false for SVGs with circles", () => {
		const svg = '<svg><circle cx="50" cy="50" r="40"/></svg>';
		expect(isSimpleRectSvg(svg)).toBe(false);
	});

	it("returns false for SVGs with ellipses", () => {
		const svg = '<svg><ellipse cx="50" cy="50" rx="40" ry="30"/></svg>';
		expect(isSimpleRectSvg(svg)).toBe(false);
	});

	it("returns false for SVGs with polygons", () => {
		const svg = '<svg><polygon points="0,0 100,0 50,100"/></svg>';
		expect(isSimpleRectSvg(svg)).toBe(false);
	});

	it("returns false for SVGs with polylines", () => {
		const svg = '<svg><polyline points="0,0 100,0 50,100"/></svg>';
		expect(isSimpleRectSvg(svg)).toBe(false);
	});

	it("returns false for SVGs with lines", () => {
		const svg = '<svg><line x1="0" y1="0" x2="100" y2="100"/></svg>';
		expect(isSimpleRectSvg(svg)).toBe(false);
	});

	it("returns false for SVGs with groups", () => {
		const svg = '<svg><g><rect width="100" height="100"/></g></svg>';
		expect(isSimpleRectSvg(svg)).toBe(false);
	});

	it("returns false for mixed rect and path elements", () => {
		const svg = '<svg><rect width="100" height="100"/><path d="M0 0 L100 100"/></svg>';
		expect(isSimpleRectSvg(svg)).toBe(false);
	});

	it("returns true for SVGs with 'path' in comments (DOM parsing avoids false positives)", () => {
		const svg = '<svg viewBox="0 0 100 100"><!-- path information --><rect width="100" height="100"/></svg>';
		expect(isSimpleRectSvg(svg)).toBe(true);
	});

	it("returns false for malformed SVG", () => {
		const svg = "<svg><invalid>";
		expect(isSimpleRectSvg(svg)).toBe(false);
	});
});

describe("updateSvgViewBox", () => {
	it("updates viewBox dimensions for simple rect SVGs", () => {
		const svg = '<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" rx="10" ry="10" fill="#00FFFF"/></svg>';
		const result = updateSvgViewBox(svg, 200, 200);

		// Check viewBox updated
		expect(result).toContain('viewBox="0 0 200 200"');

		// Check rect dimensions scaled (2x)
		expect(result).toContain('width="200"');
		expect(result).toContain('height="200"');

		// Check corner radius scaled (2x)
		expect(result).toContain('rx="20"');
		expect(result).toContain('ry="20"');
	});

	it("scales rect elements proportionally with different aspect ratio", () => {
		const svg = '<svg viewBox="0 0 100 100"><rect x="10" y="20" width="80" height="60" rx="5"/></svg>';
		const result = updateSvgViewBox(svg, 200, 150);

		// scaleX = 200/100 = 2, scaleY = 150/100 = 1.5
		expect(result).toContain('x="20"'); // 10 * 2
		expect(result).toContain('y="30"'); // 20 * 1.5
		expect(result).toContain('width="160"'); // 80 * 2
		expect(result).toContain('height="90"'); // 60 * 1.5

		// Corner radius uses min(scaleX, scaleY) = 1.5
		expect(result).toContain('rx="7.5"'); // 5 * 1.5
	});

	it("returns original SVG on parse error", () => {
		const invalidSvg = "<svg><invalid>";
		const result = updateSvgViewBox(invalidSvg, 200, 200);
		expect(result).toBe(invalidSvg);
	});

	it("returns original SVG when viewBox is missing", () => {
		const svg = '<svg><rect width="100" height="100"/></svg>';
		const result = updateSvgViewBox(svg, 200, 200);
		expect(result).toBe(svg);
	});

	it("returns original SVG when viewBox has invalid dimensions", () => {
		const svg = '<svg viewBox="0 0 0 0"><rect width="100" height="100"/></svg>';
		const result = updateSvgViewBox(svg, 200, 200);
		expect(result).toBe(svg);
	});

	it("handles multiple rect elements", () => {
		const svg = '<svg viewBox="0 0 100 100"><rect x="0" y="0" width="50" height="50"/><rect x="50" y="50" width="50" height="50"/></svg>';
		const result = updateSvgViewBox(svg, 200, 200);

		// Both rects should be scaled (2x)
		expect(result).toContain('width="100"'); // appears twice
		expect(result).toContain('height="100"'); // appears twice
	});
});
