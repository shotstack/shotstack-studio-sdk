/**
 * SelectionOverlay Unit Tests
 *
 * Tests for selection UI components: cursor generation, outline rendering config.
 * These are regression tests to ensure refactoring doesn't break selection behavior.
 */

import {
	buildRotationCursor,
	buildResizeCursor,
	getRotationCursorAngle,
	getResizeCursorAngle,
	calculateHitArea,
	CURSOR_BASE_ANGLES,
	SELECTION_CONSTANTS
} from "@core/interaction/selection-overlay";

describe("SelectionOverlay", () => {
	// ─── Constants Tests ──────────────────────────────────────────────────────

	describe("constants", () => {
		it("has correct scale handle radius", () => {
			expect(SELECTION_CONSTANTS.SCALE_HANDLE_RADIUS).toBe(4);
		});

		it("has correct outline width", () => {
			expect(SELECTION_CONSTANTS.OUTLINE_WIDTH).toBe(1);
		});

		it("has correct edge hit zone", () => {
			expect(SELECTION_CONSTANTS.EDGE_HIT_ZONE).toBe(8);
		});

		it("has correct rotation hit zone", () => {
			expect(SELECTION_CONSTANTS.ROTATION_HIT_ZONE).toBe(15);
		});

		it("has all corner base angles", () => {
			expect(CURSOR_BASE_ANGLES["topLeft"]).toBe(0);
			expect(CURSOR_BASE_ANGLES["topRight"]).toBe(90);
			expect(CURSOR_BASE_ANGLES["bottomRight"]).toBe(180);
			expect(CURSOR_BASE_ANGLES["bottomLeft"]).toBe(270);
		});

		it("has all resize base angles", () => {
			expect(CURSOR_BASE_ANGLES["topLeftResize"]).toBe(45);
			expect(CURSOR_BASE_ANGLES["topRightResize"]).toBe(-45);
			expect(CURSOR_BASE_ANGLES["bottomRightResize"]).toBe(45);
			expect(CURSOR_BASE_ANGLES["bottomLeftResize"]).toBe(-45);
		});

		it("has all edge base angles", () => {
			expect(CURSOR_BASE_ANGLES["left"]).toBe(0);
			expect(CURSOR_BASE_ANGLES["right"]).toBe(0);
			expect(CURSOR_BASE_ANGLES["top"]).toBe(90);
			expect(CURSOR_BASE_ANGLES["bottom"]).toBe(90);
		});
	});

	// ─── Cursor Generation Tests ──────────────────────────────────────────────

	describe("buildRotationCursor", () => {
		it("returns a data URI cursor string", () => {
			const cursor = buildRotationCursor(0);

			expect(cursor).toMatch(/^url\("data:image\/svg\+xml,/);
			expect(cursor).toContain("12 12, auto");
		});

		it("includes SVG with rotation path", () => {
			const cursor = buildRotationCursor(0);

			expect(cursor).toContain("svg");
			expect(cursor).toContain("path");
		});

		it("does not include transform for 0 degrees", () => {
			const cursor = buildRotationCursor(0);

			expect(cursor).not.toContain("rotate");
		});

		it("includes rotation transform for non-zero angles", () => {
			const cursor = buildRotationCursor(45);

			expect(cursor).toContain("rotate(45)");
		});

		it("handles negative angles", () => {
			const cursor = buildRotationCursor(-90);

			expect(cursor).toContain("rotate(-90)");
		});

		it("handles large angles", () => {
			const cursor = buildRotationCursor(270);

			expect(cursor).toContain("rotate(270)");
		});
	});

	describe("buildResizeCursor", () => {
		it("returns a data URI cursor string", () => {
			const cursor = buildResizeCursor(0);

			expect(cursor).toMatch(/^url\("data:image\/svg\+xml,/);
			expect(cursor).toContain("12 12, auto");
		});

		it("includes SVG with resize path and matrix transform", () => {
			const cursor = buildResizeCursor(0);

			expect(cursor).toContain("svg");
			expect(cursor).toContain("path");
			expect(cursor).toContain("matrix");
		});

		it("always includes rotation transform (even for 0 degrees)", () => {
			const cursor = buildResizeCursor(0);

			// The resize cursor always has rotation wrapper for consistency
			expect(cursor).toContain("rotate(0");
		});

		it("includes rotation transform for non-zero angles", () => {
			const cursor = buildResizeCursor(45);

			expect(cursor).toContain("rotate(45");
		});

		it("handles negative angles", () => {
			const cursor = buildResizeCursor(-45);

			expect(cursor).toContain("rotate(-45");
		});
	});

	// ─── Cursor Angle Calculation Tests ───────────────────────────────────────

	describe("getRotationCursorAngle", () => {
		it("returns correct angle for topLeft corner with no rotation", () => {
			const angle = getRotationCursorAngle("topLeft", 0);

			expect(angle).toBe(0);
		});

		it("returns correct angle for topRight corner with no rotation", () => {
			const angle = getRotationCursorAngle("topRight", 0);

			expect(angle).toBe(90);
		});

		it("returns correct angle for bottomRight corner with no rotation", () => {
			const angle = getRotationCursorAngle("bottomRight", 0);

			expect(angle).toBe(180);
		});

		it("returns correct angle for bottomLeft corner with no rotation", () => {
			const angle = getRotationCursorAngle("bottomLeft", 0);

			expect(angle).toBe(270);
		});

		it("adds clip rotation to base angle", () => {
			const angle = getRotationCursorAngle("topLeft", 45);

			expect(angle).toBe(45);
		});

		it("handles combined rotation", () => {
			const angle = getRotationCursorAngle("topRight", 30);

			expect(angle).toBe(120); // 90 + 30
		});
	});

	describe("getResizeCursorAngle", () => {
		it("returns correct angle for topLeft resize with no rotation", () => {
			const angle = getResizeCursorAngle("topLeftResize", 0);

			expect(angle).toBe(45);
		});

		it("returns correct angle for topRight resize with no rotation", () => {
			const angle = getResizeCursorAngle("topRightResize", 0);

			expect(angle).toBe(-45);
		});

		it("returns correct angle for left edge with no rotation", () => {
			const angle = getResizeCursorAngle("left", 0);

			expect(angle).toBe(0);
		});

		it("returns correct angle for top edge with no rotation", () => {
			const angle = getResizeCursorAngle("top", 0);

			expect(angle).toBe(90);
		});

		it("adds clip rotation to base angle", () => {
			const angle = getResizeCursorAngle("left", 45);

			expect(angle).toBe(45);
		});

		it("handles combined rotation for diagonal", () => {
			const angle = getResizeCursorAngle("topLeftResize", 30);

			expect(angle).toBe(75); // 45 + 30
		});
	});

	// ─── Hit Area Tests ───────────────────────────────────────────────────────

	describe("calculateHitArea", () => {
		it("calculates expanded hit area with margin", () => {
			const size = { width: 100, height: 80 };
			const uiScale = 1;

			const hitArea = calculateHitArea(size, uiScale);

			// Margin = (15 + 4) / 1 = 19
			expect(hitArea.x).toBe(-19);
			expect(hitArea.y).toBe(-19);
			expect(hitArea.width).toBe(138); // 100 + 19*2
			expect(hitArea.height).toBe(118); // 80 + 19*2
		});

		it("scales margin inversely with UI scale", () => {
			const size = { width: 100, height: 80 };
			const uiScale = 2;

			const hitArea = calculateHitArea(size, uiScale);

			// Margin = (15 + 4) / 2 = 9.5
			expect(hitArea.x).toBe(-9.5);
			expect(hitArea.y).toBe(-9.5);
			expect(hitArea.width).toBe(119); // 100 + 9.5*2
			expect(hitArea.height).toBe(99); // 80 + 9.5*2
		});

		it("handles small UI scale (zoomed out)", () => {
			const size = { width: 100, height: 80 };
			const uiScale = 0.5;

			const hitArea = calculateHitArea(size, uiScale);

			// Margin = (15 + 4) / 0.5 = 38
			expect(hitArea.x).toBe(-38);
			expect(hitArea.y).toBe(-38);
			expect(hitArea.width).toBe(176); // 100 + 38*2
			expect(hitArea.height).toBe(156); // 80 + 38*2
		});
	});

	// ─── Selection Colors Tests ───────────────────────────────────────────────

	describe("selection colors", () => {
		it("defines default selection color", () => {
			expect(SELECTION_CONSTANTS.DEFAULT_COLOR).toBe(0x0d99ff);
		});

		it("defines hover/drag color", () => {
			expect(SELECTION_CONSTANTS.ACTIVE_COLOR).toBe(0x00ffff);
		});
	});

	// ─── Edge Cases ───────────────────────────────────────────────────────────

	describe("edge cases", () => {
		it("cursor generation handles 360+ degree rotation", () => {
			const cursor = buildRotationCursor(450);

			expect(cursor).toContain("rotate(450)");
		});

		it("hit area handles zero-size element", () => {
			const hitArea = calculateHitArea({ width: 0, height: 0 }, 1);

			expect(hitArea.width).toBe(38); // just the margins
			expect(hitArea.height).toBe(38);
		});

		it("hit area handles very small UI scale", () => {
			const hitArea = calculateHitArea({ width: 100, height: 100 }, 0.1);

			// Margin = 19 / 0.1 = 190
			expect(hitArea.x).toBe(-190);
			expect(hitArea.width).toBe(480); // 100 + 190*2
		});
	});
});
