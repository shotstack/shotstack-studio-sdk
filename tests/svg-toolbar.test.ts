/**
 * @jest-environment jsdom
 */

/**
 * SVG Toolbar Regression Tests
 *
 * Tests for critical bug fixes in the SvgToolbar implementation:
 * 1. DOMParser-based SVG manipulation (replaced regex)
 * 2. Separate initial state fields (prevents race conditions)
 * 3. Pure scaling calculation function (eliminates duplication)
 * 4. Dimension parsing from shape elements (not SVG root)
 * 5. Negative value clamping
 * 6. Error state cleanup
 */

import type { ResolvedClip, SvgAsset } from "@schemas";
import { sec } from "@timing/types";
import type { Edit } from "@core/edit-session";

// Polyfill structuredClone for jsdom
if (typeof structuredClone === "undefined") {
	global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

// Mock dependencies
jest.mock("@styles/inject", () => ({
	injectShotstackStyles: jest.fn()
}));

// Import after mocks
// eslint-disable-next-line import/first
import { SvgToolbar } from "@core/ui/svg-toolbar";

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function createMockEditSession() {
	return {
		getClipId: jest.fn().mockReturnValue("clip-123"),
		getResolvedClip: jest.fn(),
		updateClipInDocument: jest.fn(),
		resolveClip: jest.fn(),
		commitClipUpdate: jest.fn()
	};
}

function createSvgClip(svgSrc: string): ResolvedClip {
	return {
		id: "clip-123",
		asset: {
			type: "svg",
			src: svgSrc
		} as SvgAsset,
		start: sec(0),
		length: sec(10)
	};
}

function createToolbar(mockEdit: ReturnType<typeof createMockEditSession>) {
	const toolbar = new SvgToolbar(mockEdit as unknown as Edit);
	// @ts-expect-error - accessing protected property for testing
	toolbar.selectedTrackIdx = 0;
	// @ts-expect-error - accessing protected property for testing
	toolbar.selectedClipIdx = 0;

	// Create a mock parent element
	const parent = document.createElement("div");
	document.body.appendChild(parent);

	toolbar.mount(parent);

	return { toolbar, parent };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Critical Bug Fixes
// ─────────────────────────────────────────────────────────────────────────────

describe("SvgToolbar - Critical Bug Fixes", () => {
	describe("updateSvgAttr - DOMParser approach", () => {
		it("updates shape attributes, not SVG root attributes", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = createToolbar(mockEdit);

			// SVG with fill on root and shape
			const svg = '<svg fill="none"><rect fill="red" width="100" height="100"/></svg>';

			// @ts-expect-error - accessing private method for testing
			const result = toolbar.updateSvgAttr(svg, "fill", "blue");

			// Parse result to verify
			const doc = new DOMParser().parseFromString(result, "image/svg+xml");
			const svgRoot = doc.querySelector("svg");
			const rect = doc.querySelector("rect");

			// Root fill should remain unchanged
			expect(svgRoot?.getAttribute("fill")).toBe("none");
			// Shape fill should be updated
			expect(rect?.getAttribute("fill")).toBe("blue");
		});

		it("targets only the first shape element", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = createToolbar(mockEdit);

			const svg = '<svg><rect fill="red" width="100" height="100"/><circle fill="green" r="50"/></svg>';

			// @ts-expect-error - accessing private method for testing
			const result = toolbar.updateSvgAttr(svg, "fill", "blue");

			const doc = new DOMParser().parseFromString(result, "image/svg+xml");
			const rect = doc.querySelector("rect");
			const circle = doc.querySelector("circle");

			// Only first shape should be updated
			expect(rect?.getAttribute("fill")).toBe("blue");
			expect(circle?.getAttribute("fill")).toBe("green");
		});

		it("adds attribute if shape doesn't have it", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = createToolbar(mockEdit);

			const svg = '<svg><rect width="100" height="100"/></svg>';

			// @ts-expect-error - accessing private method for testing
			const result = toolbar.updateSvgAttr(svg, "rx", "10");

			const doc = new DOMParser().parseFromString(result, "image/svg+xml");
			const rect = doc.querySelector("rect");

			expect(rect?.getAttribute("rx")).toBe("10");
		});

		it("handles SVG with no shape elements (fallback)", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = createToolbar(mockEdit);

			const svg = "<svg><g></g></svg>";

			// @ts-expect-error - accessing private method for testing
			const result = toolbar.updateSvgAttr(svg, "fill", "blue");

			// Should return original SVG unchanged (no shapes to modify)
			expect(result).toBe(svg);
		});

		it("handles all shape types (rect, circle, polygon, path, ellipse, line, polyline)", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = createToolbar(mockEdit);

			const shapeTypes = [
				'<rect width="100" height="100"/>',
				'<circle r="50"/>',
				'<polygon points="0,0 100,0 50,100"/>',
				'<path d="M0,0 L100,100"/>',
				'<ellipse rx="50" ry="30"/>',
				'<line x1="0" y1="0" x2="100" y2="100"/>',
				'<polyline points="0,0 100,0 100,100"/>'
			];

			shapeTypes.forEach(shapeElement => {
				const svg = `<svg>${shapeElement}</svg>`;

				// @ts-expect-error - accessing private method for testing
				const result = toolbar.updateSvgAttr(svg, "fill", "blue");

				const doc = new DOMParser().parseFromString(result, "image/svg+xml");
				const shape = doc.querySelector("svg")?.querySelector("rect, circle, polygon, path, ellipse, line, polyline");

				expect(shape?.getAttribute("fill")).toBe("blue");
			});
		});
	});

	describe("getScalingInfo - Pure function", () => {
		it("calculates scaling with viewBox", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = createToolbar(mockEdit);

			const svg = '<svg viewBox="0 0 200 200"><rect width="100" height="100"/></svg>';
			const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
			const shape = doc.querySelector("rect")!;

			// @ts-expect-error - accessing private method for testing
			const { scaleFactor, maxRadius } = toolbar.getScalingInfo(svg, shape);

			expect(scaleFactor).toBe(2); // 200 / 100
			expect(maxRadius).toBe(25); // (min(100, 100) / 2) / 2
		});

		it("defaults to scaleFactor 1 without viewBox", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = createToolbar(mockEdit);

			const svg = '<svg><rect width="100" height="100"/></svg>';
			const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
			const shape = doc.querySelector("rect")!;

			// @ts-expect-error - accessing private method for testing
			const { scaleFactor, maxRadius } = toolbar.getScalingInfo(svg, shape);

			expect(scaleFactor).toBe(1);
			expect(maxRadius).toBe(50); // min(100, 100) / 2
		});

		it("uses smallest dimension for maxRadius", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = createToolbar(mockEdit);

			const svg = '<svg><rect width="200" height="100"/></svg>';
			const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
			const shape = doc.querySelector("rect")!;

			// @ts-expect-error - accessing private method for testing
			const { maxRadius } = toolbar.getScalingInfo(svg, shape);

			expect(maxRadius).toBe(50); // min(200, 100) / 2
		});

		it("handles missing width/height attributes", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = createToolbar(mockEdit);

			const svg = "<svg><rect/></svg>";
			const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
			const shape = doc.querySelector("rect")!;

			// @ts-expect-error - accessing private method for testing
			const { maxRadius } = toolbar.getScalingInfo(svg, shape);

			expect(maxRadius).toBe(50); // defaults to 100x100, so 100/2
		});

		it("is a pure function (no side effects)", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = createToolbar(mockEdit);

			const svg = '<svg viewBox="0 0 200 200"><rect width="100" height="100"/></svg>';
			const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
			const shape = doc.querySelector("rect")!;

			// Call twice with same inputs
			// @ts-expect-error - accessing private method for testing
			const result1 = toolbar.getScalingInfo(svg, shape);
			// @ts-expect-error - accessing private method for testing
			const result2 = toolbar.getScalingInfo(svg, shape);

			// Should return identical results
			expect(result1).toEqual(result2);
		});
	});

	describe("Separate initial state fields", () => {
		it("maintains independent undo state for fill and corner radius", () => {
			const mockEdit = createMockEditSession();
			const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect fill="red" width="50" height="50"/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			const { toolbar } = createToolbar(mockEdit);

			// Get input elements
			// @ts-expect-error - accessing private property
			const fillInput = toolbar.fillColorInput as HTMLInputElement;
			// @ts-expect-error - accessing private property
			const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

			// Simulate fill color interaction
			fillInput.dispatchEvent(new Event("pointerdown"));

			// Verify fillInitialState is set, cornerInitialState is not
			// @ts-expect-error - accessing private property
			expect(toolbar.fillInitialState).toBeTruthy();
			// @ts-expect-error - accessing private property
			expect(toolbar.cornerInitialState).toBeNull();

			// Simulate corner radius interaction
			cornerInput.value = "10";
			cornerInput.dispatchEvent(new Event("input"));

			// Verify cornerInitialState is now set independently
			// @ts-expect-error - accessing private property
			expect(toolbar.fillInitialState).toBeTruthy();
			// @ts-expect-error - accessing private property
			expect(toolbar.cornerInitialState).toBeTruthy();

			// Verify they're different objects (not same reference)
			// @ts-expect-error - accessing private property
			expect(toolbar.fillInitialState).not.toBe(toolbar.cornerInitialState);
		});

		it("commits separate undo entries for fill and corner radius", () => {
			const mockEdit = createMockEditSession();
			const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect fill="red" width="50" height="50"/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			const { toolbar } = createToolbar(mockEdit);

			// @ts-expect-error - accessing private property
			const fillInput = toolbar.fillColorInput as HTMLInputElement;
			// @ts-expect-error - accessing private property
			const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

			// Complete fill color change
			fillInput.dispatchEvent(new Event("pointerdown"));
			fillInput.value = "#0000ff";
			fillInput.dispatchEvent(new Event("input"));
			fillInput.dispatchEvent(new Event("change"));

			// commitClipUpdate should be called once for fill
			expect(mockEdit.commitClipUpdate).toHaveBeenCalledTimes(1);

			// Complete corner radius change
			cornerInput.value = "10";
			cornerInput.dispatchEvent(new Event("input"));
			cornerInput.dispatchEvent(new Event("blur"));

			// commitClipUpdate should be called twice (once for each control)
			expect(mockEdit.commitClipUpdate).toHaveBeenCalledTimes(2);
		});

		it("clears state fields after commit", () => {
			const mockEdit = createMockEditSession();
			const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect fill="red" width="50" height="50"/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			const { toolbar } = createToolbar(mockEdit);

			// @ts-expect-error - accessing private property
			const fillInput = toolbar.fillColorInput as HTMLInputElement;

			fillInput.dispatchEvent(new Event("pointerdown"));
			fillInput.value = "#0000ff";
			fillInput.dispatchEvent(new Event("input"));
			fillInput.dispatchEvent(new Event("change"));

			// fillInitialState should be cleared after commit
			// @ts-expect-error - accessing private property
			expect(toolbar.fillInitialState).toBeNull();
		});
	});

	describe("Dimension parsing from shape elements", () => {
		it("uses shape dimensions, not SVG root dimensions", () => {
			const mockEdit = createMockEditSession();
			// SVG root has 100% width, shape has specific dimensions
			const svgClip = createSvgClip('<svg width="100%" height="100%" viewBox="0 0 100 100"><rect width="50" height="50"/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			const { toolbar } = createToolbar(mockEdit);

			// Call syncState to initialize max value based on SVG
			// @ts-expect-error - accessing protected method for testing
			toolbar.syncState();

			// @ts-expect-error - accessing private property
			const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

			// Max should be calculated from rect (50x50), not svg (100%)
			// scaleFactor = 1 (viewBox 100 / 100), smallestDimension = 50
			// maxRadius = (50/2)/1 = 25
			expect(cornerInput.max).toBe("25");
		});

		it("handles shapes without explicit dimensions", () => {
			const mockEdit = createMockEditSession();
			const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			const { toolbar } = createToolbar(mockEdit);

			// Call syncState to initialize max value based on SVG
			// @ts-expect-error - accessing protected method for testing
			toolbar.syncState();

			// @ts-expect-error - accessing private property
			const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

			// Should use default 100x100 dimensions
			expect(cornerInput.max).toBe("50");
		});
	});

	describe("Negative value clamping", () => {
		it("clamps negative corner radius values to 0", () => {
			const mockEdit = createMockEditSession();
			const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect width="50" height="50"/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			const { toolbar } = createToolbar(mockEdit);

			// @ts-expect-error - accessing private property
			const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

			// Try to set negative value
			cornerInput.value = "-5";
			cornerInput.dispatchEvent(new Event("input"));

			// Value should be clamped to 0
			expect(cornerInput.value).toBe("0");
		});

		it("allows 0 as valid corner radius", () => {
			const mockEdit = createMockEditSession();
			const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect width="50" height="50"/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			const { toolbar } = createToolbar(mockEdit);

			// @ts-expect-error - accessing private property
			const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

			cornerInput.value = "0";
			cornerInput.dispatchEvent(new Event("input"));

			expect(cornerInput.value).toBe("0");
			// 0 radius returns early after NaN check but doesn't update - this is expected behavior
		});

		it("clamps values exceeding maxRadius", () => {
			const mockEdit = createMockEditSession();
			const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect width="50" height="50"/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			const { toolbar } = createToolbar(mockEdit);

			// @ts-expect-error - accessing private property
			const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

			// Clamping happens dynamically during input event based on parsed SVG
			// The value is clamped to calculated maxRadius
			cornerInput.value = "50";
			cornerInput.dispatchEvent(new Event("input"));

			// Value is clamped to maxRadius calculated from SVG dimensions
			// For 50x50 rect with viewBox 100, maxRadius = (50/2)/1 = 25
			const clampedValue = parseInt(cornerInput.value, 10);
			expect(clampedValue).toBeLessThanOrEqual(25);
		});
	});

	describe("Error state cleanup", () => {
		it("clears cornerInitialState on error", () => {
			const mockEdit = createMockEditSession();
			const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect width="50" height="50"/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			// Force an error by making updateClipInDocument throw
			mockEdit.updateClipInDocument.mockImplementation(() => {
				throw new Error("Update failed");
			});

			const { toolbar } = createToolbar(mockEdit);

			// @ts-expect-error - accessing private property
			const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

			const consoleSpy = jest.spyOn(console, "error").mockImplementation();

			cornerInput.value = "10";
			cornerInput.dispatchEvent(new Event("input"));

			// cornerInitialState should be cleared after error
			// @ts-expect-error - accessing private property
			expect(toolbar.cornerInitialState).toBeNull();

			consoleSpy.mockRestore();
		});

		it("logs error when corner radius update fails", () => {
			const mockEdit = createMockEditSession();
			const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect width="50" height="50"/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			mockEdit.updateClipInDocument.mockImplementation(() => {
				throw new Error("Update failed");
			});

			const { toolbar } = createToolbar(mockEdit);

			// @ts-expect-error - accessing private property
			const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

			const consoleSpy = jest.spyOn(console, "error").mockImplementation();

			cornerInput.value = "10";
			cornerInput.dispatchEvent(new Event("input"));

			expect(consoleSpy).toHaveBeenCalledWith("[SVG Corner Radius] Error applying radius:", expect.any(Error));

			consoleSpy.mockRestore();
		});
	});

	describe("dispose cleanup", () => {
		it("clears both initial state fields", () => {
			const mockEdit = createMockEditSession();
			const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect fill="red" width="50" height="50"/></svg>');
			mockEdit.getResolvedClip.mockReturnValue(svgClip);

			const { toolbar } = createToolbar(mockEdit);

			// Set both initial states
			// @ts-expect-error - accessing private property
			const fillInput = toolbar.fillColorInput as HTMLInputElement;
			// @ts-expect-error - accessing private property
			const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

			fillInput.dispatchEvent(new Event("pointerdown"));
			cornerInput.value = "10";
			cornerInput.dispatchEvent(new Event("input"));

			// Verify both are set
			// @ts-expect-error - accessing private property
			expect(toolbar.fillInitialState).toBeTruthy();
			// @ts-expect-error - accessing private property
			expect(toolbar.cornerInitialState).toBeTruthy();

			// Dispose
			toolbar.dispose();

			// Both should be null
			// @ts-expect-error - accessing private property
			expect(toolbar.fillInitialState).toBeNull();
			// @ts-expect-error - accessing private property
			expect(toolbar.cornerInitialState).toBeNull();
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Data Flow Integrity (From Abramov Review)
// ─────────────────────────────────────────────────────────────────────────────

describe("SvgToolbar - Data Flow Integrity", () => {
	it("reads from edit session as single source of truth", () => {
		const mockEdit = createMockEditSession();
		const svgClip = createSvgClip('<svg><rect fill="red" width="50" height="50"/></svg>');
		mockEdit.getResolvedClip.mockReturnValue(svgClip);

		const { toolbar } = createToolbar(mockEdit);

		// Toolbar reads from edit session when syncState is called
		// @ts-expect-error - accessing protected method for testing
		toolbar.syncState();

		expect(mockEdit.getResolvedClip).toHaveBeenCalled();
	});

	it("writes changes immediately back to edit session", () => {
		const mockEdit = createMockEditSession();
		const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect fill="red" width="50" height="50"/></svg>');
		mockEdit.getResolvedClip.mockReturnValue(svgClip);

		const { toolbar } = createToolbar(mockEdit);

		// @ts-expect-error - accessing private property
		const fillInput = toolbar.fillColorInput as HTMLInputElement;

		fillInput.value = "#0000ff";
		fillInput.dispatchEvent(new Event("input"));

		// Should immediately update document
		expect(mockEdit.updateClipInDocument).toHaveBeenCalled();
		expect(mockEdit.resolveClip).toHaveBeenCalled();
	});

	it("commits to undo history only once per edit session", () => {
		const mockEdit = createMockEditSession();
		const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect fill="red" width="50" height="50"/></svg>');
		mockEdit.getResolvedClip.mockReturnValue(svgClip);

		const { toolbar } = createToolbar(mockEdit);

		// @ts-expect-error - accessing private property
		const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

		// Multiple input events (user typing)
		cornerInput.value = "5";
		cornerInput.dispatchEvent(new Event("input"));
		cornerInput.value = "10";
		cornerInput.dispatchEvent(new Event("input"));
		cornerInput.value = "15";
		cornerInput.dispatchEvent(new Event("input"));

		// No undo commits yet
		expect(mockEdit.commitClipUpdate).not.toHaveBeenCalled();

		// Blur (complete edit)
		cornerInput.dispatchEvent(new Event("blur"));

		// Single undo commit
		expect(mockEdit.commitClipUpdate).toHaveBeenCalledTimes(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe("SvgToolbar - Edge Cases", () => {
	it("handles SVG with no src attribute", () => {
		const mockEdit = createMockEditSession();
		const svgClip = createSvgClip("");
		// Remove src to test undefined/null handling
		// @ts-expect-error - intentionally creating invalid state for edge case testing
		delete svgClip.asset.src;
		mockEdit.getResolvedClip.mockReturnValue(svgClip);

		const { toolbar } = createToolbar(mockEdit);

		// @ts-expect-error - accessing private property
		const fillInput = toolbar.fillColorInput as HTMLInputElement;

		// Should handle gracefully without throwing
		expect(() => {
			fillInput.value = "#0000ff";
			fillInput.dispatchEvent(new Event("input"));
		}).not.toThrow();
	});

	it("handles malformed SVG gracefully", () => {
		const mockEdit = createMockEditSession();
		const svgClip = createSvgClip("not valid xml <>");
		mockEdit.getResolvedClip.mockReturnValue(svgClip);

		const { toolbar } = createToolbar(mockEdit);

		// @ts-expect-error - accessing private method for testing
		const result = toolbar.updateSvgAttr(svgClip.asset.src!, "fill", "blue");

		// Should return fallback (original or modified)
		expect(result).toBeTruthy();
	});

	it("handles NaN corner radius input", () => {
		const mockEdit = createMockEditSession();
		const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect width="50" height="50"/></svg>');
		mockEdit.getResolvedClip.mockReturnValue(svgClip);

		const { toolbar } = createToolbar(mockEdit);

		// @ts-expect-error - accessing private property
		const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

		cornerInput.value = "abc";
		cornerInput.dispatchEvent(new Event("input"));

		// Should not update document with NaN
		expect(mockEdit.updateClipInDocument).not.toHaveBeenCalled();
	});

	it("handles empty corner radius input", () => {
		const mockEdit = createMockEditSession();
		const svgClip = createSvgClip('<svg viewBox="0 0 100 100"><rect width="50" height="50"/></svg>');
		mockEdit.getResolvedClip.mockReturnValue(svgClip);

		const { toolbar } = createToolbar(mockEdit);

		// @ts-expect-error - accessing private property
		const cornerInput = toolbar.cornerRadiusInput as HTMLInputElement;

		cornerInput.value = "";
		cornerInput.dispatchEvent(new Event("input"));

		// Should not update document with empty value
		expect(mockEdit.updateClipInDocument).not.toHaveBeenCalled();
	});
});
