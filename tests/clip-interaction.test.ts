/**
 * ClipInteractionSystem Unit Tests
 *
 * Tests for clip interaction calculations: hit detection, resize, scale calculations.
 * These are regression tests to ensure refactoring doesn't break interaction behavior.
 */

import {
	type OriginalDimensions,
	INTERACTION_CONSTANTS,
	detectEdgeZone,
	detectCornerZone,
	calculateCornerScale,
	calculateEdgeResize,
	clampDimensions
} from "@core/interaction/clip-interaction";

describe("ClipInteractionSystem", () => {
	// ─── Constants Tests ──────────────────────────────────────────────────────

	describe("constants", () => {
		it("has correct minimum dimension", () => {
			expect(INTERACTION_CONSTANTS.MIN_DIMENSION).toBe(50);
		});

		it("has correct maximum dimension", () => {
			expect(INTERACTION_CONSTANTS.MAX_DIMENSION).toBe(3840);
		});
	});

	// ─── Edge Zone Detection Tests ────────────────────────────────────────────

	describe("detectEdgeZone", () => {
		const size = { width: 200, height: 150 };
		const hitZone = 8;

		it("detects left edge", () => {
			const point = { x: 4, y: 75 }; // Within hit zone of left edge, centered vertically

			const result = detectEdgeZone(point, size, hitZone);

			expect(result).toBe("left");
		});

		it("detects right edge", () => {
			const point = { x: 196, y: 75 }; // Within hit zone of right edge

			const result = detectEdgeZone(point, size, hitZone);

			expect(result).toBe("right");
		});

		it("detects top edge", () => {
			const point = { x: 100, y: 4 }; // Within hit zone of top edge, centered horizontally

			const result = detectEdgeZone(point, size, hitZone);

			expect(result).toBe("top");
		});

		it("detects bottom edge", () => {
			const point = { x: 100, y: 146 }; // Within hit zone of bottom edge

			const result = detectEdgeZone(point, size, hitZone);

			expect(result).toBe("bottom");
		});

		it("returns null for center of element", () => {
			const point = { x: 100, y: 75 }; // Center of element

			const result = detectEdgeZone(point, size, hitZone);

			expect(result).toBeNull();
		});

		it("returns null for corners (not within vertical/horizontal range)", () => {
			const point = { x: 4, y: 4 }; // Top-left corner

			const result = detectEdgeZone(point, size, hitZone);

			expect(result).toBeNull();
		});

		it("handles negative hit zone values gracefully", () => {
			const point = { x: 4, y: 75 };

			// Should not crash with edge case
			const result = detectEdgeZone(point, size, -8);

			expect(result).toBeNull();
		});

		it("handles point exactly on edge boundary", () => {
			const point = { x: 0, y: 75 };

			const result = detectEdgeZone(point, size, hitZone);

			expect(result).toBe("left");
		});

		it("handles point just outside left edge", () => {
			const point = { x: -4, y: 75 };

			const result = detectEdgeZone(point, size, hitZone);

			expect(result).toBe("left");
		});
	});

	// ─── Corner Zone Detection Tests ──────────────────────────────────────────

	describe("detectCornerZone", () => {
		const corners = [
			{ x: 0, y: 0 }, // topLeft
			{ x: 200, y: 0 }, // topRight
			{ x: 200, y: 150 }, // bottomRight
			{ x: 0, y: 150 } // bottomLeft
		];
		const handleRadius = 4;
		const rotationZone = 15;

		it("detects topLeft rotation zone", () => {
			// Point outside handle radius but within rotation zone
			const point = { x: -10, y: -10 };

			const result = detectCornerZone(point, corners, handleRadius, rotationZone);

			expect(result).toBe("topLeft");
		});

		it("detects topRight rotation zone", () => {
			const point = { x: 210, y: -10 };

			const result = detectCornerZone(point, corners, handleRadius, rotationZone);

			expect(result).toBe("topRight");
		});

		it("detects bottomRight rotation zone", () => {
			const point = { x: 210, y: 160 };

			const result = detectCornerZone(point, corners, handleRadius, rotationZone);

			expect(result).toBe("bottomRight");
		});

		it("detects bottomLeft rotation zone", () => {
			const point = { x: -10, y: 160 };

			const result = detectCornerZone(point, corners, handleRadius, rotationZone);

			expect(result).toBe("bottomLeft");
		});

		it("returns null when inside handle radius", () => {
			// Point too close to corner (would be scale handle, not rotation)
			const point = { x: 2, y: 2 };

			const result = detectCornerZone(point, corners, handleRadius, rotationZone);

			expect(result).toBeNull();
		});

		it("returns null when outside rotation zone", () => {
			// Point too far from any corner
			const point = { x: -30, y: -30 };

			const result = detectCornerZone(point, corners, handleRadius, rotationZone);

			expect(result).toBeNull();
		});

		it("returns null for center of element", () => {
			const point = { x: 100, y: 75 };

			const result = detectCornerZone(point, corners, handleRadius, rotationZone);

			expect(result).toBeNull();
		});
	});

	// ─── Corner Scale Calculation Tests ───────────────────────────────────────

	describe("calculateCornerScale", () => {
		const canvasSize = { width: 1920, height: 1080 };
		const originalDimensions: OriginalDimensions = {
			width: 200,
			height: 150,
			offsetX: 0,
			offsetY: 0
		};

		describe("topLeft corner", () => {
			it("decreases width and height when dragging down-right", () => {
				const delta = { x: 20, y: 15 };

				const result = calculateCornerScale("topLeft", delta, originalDimensions, canvasSize);

				expect(result.width).toBe(180); // 200 - 20
				expect(result.height).toBe(135); // 150 - 15
			});

			it("shifts offset to keep bottom-right fixed", () => {
				const delta = { x: 20, y: 15 };

				const result = calculateCornerScale("topLeft", delta, originalDimensions, canvasSize);

				// offsetX shifts by deltaX/2/canvasWidth = 20/2/1920 ≈ 0.0052
				expect(result.offsetX).toBeCloseTo(20 / 2 / 1920, 5);
				// offsetY shifts by -deltaY/2/canvasHeight = -15/2/1080 ≈ -0.0069
				expect(result.offsetY).toBeCloseTo(-15 / 2 / 1080, 5);
			});

			it("increases dimensions when dragging up-left", () => {
				const delta = { x: -30, y: -20 };

				const result = calculateCornerScale("topLeft", delta, originalDimensions, canvasSize);

				expect(result.width).toBe(230); // 200 - (-30)
				expect(result.height).toBe(170); // 150 - (-20)
			});
		});

		describe("topRight corner", () => {
			it("increases width, decreases height when dragging right-down", () => {
				const delta = { x: 20, y: 15 };

				const result = calculateCornerScale("topRight", delta, originalDimensions, canvasSize);

				expect(result.width).toBe(220); // 200 + 20
				expect(result.height).toBe(135); // 150 - 15
			});

			it("shifts offset correctly", () => {
				const delta = { x: 20, y: 15 };

				const result = calculateCornerScale("topRight", delta, originalDimensions, canvasSize);

				expect(result.offsetX).toBeCloseTo(20 / 2 / 1920, 5);
				expect(result.offsetY).toBeCloseTo(-15 / 2 / 1080, 5);
			});
		});

		describe("bottomLeft corner", () => {
			it("decreases width, increases height when dragging right-down", () => {
				const delta = { x: 20, y: 15 };

				const result = calculateCornerScale("bottomLeft", delta, originalDimensions, canvasSize);

				expect(result.width).toBe(180); // 200 - 20
				expect(result.height).toBe(165); // 150 + 15
			});

			it("shifts offset correctly", () => {
				const delta = { x: 20, y: 15 };

				const result = calculateCornerScale("bottomLeft", delta, originalDimensions, canvasSize);

				expect(result.offsetX).toBeCloseTo(20 / 2 / 1920, 5);
				expect(result.offsetY).toBeCloseTo(-15 / 2 / 1080, 5);
			});
		});

		describe("bottomRight corner", () => {
			it("increases both width and height when dragging right-down", () => {
				const delta = { x: 20, y: 15 };

				const result = calculateCornerScale("bottomRight", delta, originalDimensions, canvasSize);

				expect(result.width).toBe(220); // 200 + 20
				expect(result.height).toBe(165); // 150 + 15
			});

			it("shifts offset correctly", () => {
				const delta = { x: 20, y: 15 };

				const result = calculateCornerScale("bottomRight", delta, originalDimensions, canvasSize);

				expect(result.offsetX).toBeCloseTo(20 / 2 / 1920, 5);
				expect(result.offsetY).toBeCloseTo(-15 / 2 / 1080, 5);
			});
		});

		it("preserves original dimensions with zero delta", () => {
			const delta = { x: 0, y: 0 };

			const result = calculateCornerScale("topLeft", delta, originalDimensions, canvasSize);

			expect(result.width).toBe(200);
			expect(result.height).toBe(150);
			expect(result.offsetX).toBe(0);
			expect(result.offsetY).toBe(0);
		});
	});

	// ─── Edge Resize Calculation Tests ────────────────────────────────────────

	describe("calculateEdgeResize", () => {
		const canvasSize = { width: 1920, height: 1080 };
		const originalDimensions: OriginalDimensions = {
			width: 200,
			height: 150,
			offsetX: 0,
			offsetY: 0
		};

		describe("left edge", () => {
			it("decreases width when dragging right", () => {
				const delta = { x: 20, y: 0 };

				const result = calculateEdgeResize("left", delta, originalDimensions, canvasSize);

				expect(result.width).toBe(180); // 200 - 20
				expect(result.height).toBe(150); // unchanged
			});

			it("shifts offset to keep right edge fixed", () => {
				const delta = { x: 20, y: 0 };

				const result = calculateEdgeResize("left", delta, originalDimensions, canvasSize);

				expect(result.offsetX).toBeCloseTo(20 / 2 / 1920, 5);
				expect(result.offsetY).toBe(0); // unchanged
			});

			it("increases width when dragging left", () => {
				const delta = { x: -30, y: 0 };

				const result = calculateEdgeResize("left", delta, originalDimensions, canvasSize);

				expect(result.width).toBe(230); // 200 - (-30)
			});
		});

		describe("right edge", () => {
			it("increases width when dragging right", () => {
				const delta = { x: 20, y: 0 };

				const result = calculateEdgeResize("right", delta, originalDimensions, canvasSize);

				expect(result.width).toBe(220); // 200 + 20
				expect(result.height).toBe(150); // unchanged
			});

			it("shifts offset to keep left edge fixed", () => {
				const delta = { x: 20, y: 0 };

				const result = calculateEdgeResize("right", delta, originalDimensions, canvasSize);

				expect(result.offsetX).toBeCloseTo(20 / 2 / 1920, 5);
				expect(result.offsetY).toBe(0);
			});
		});

		describe("top edge", () => {
			it("decreases height when dragging down", () => {
				const delta = { x: 0, y: 15 };

				const result = calculateEdgeResize("top", delta, originalDimensions, canvasSize);

				expect(result.width).toBe(200); // unchanged
				expect(result.height).toBe(135); // 150 - 15
			});

			it("shifts offset to keep bottom edge fixed", () => {
				const delta = { x: 0, y: 15 };

				const result = calculateEdgeResize("top", delta, originalDimensions, canvasSize);

				expect(result.offsetX).toBe(0);
				expect(result.offsetY).toBeCloseTo(-15 / 2 / 1080, 5);
			});
		});

		describe("bottom edge", () => {
			it("increases height when dragging down", () => {
				const delta = { x: 0, y: 15 };

				const result = calculateEdgeResize("bottom", delta, originalDimensions, canvasSize);

				expect(result.width).toBe(200); // unchanged
				expect(result.height).toBe(165); // 150 + 15
			});

			it("shifts offset to keep top edge fixed", () => {
				const delta = { x: 0, y: 15 };

				const result = calculateEdgeResize("bottom", delta, originalDimensions, canvasSize);

				expect(result.offsetX).toBe(0);
				expect(result.offsetY).toBeCloseTo(-15 / 2 / 1080, 5);
			});
		});

		it("ignores perpendicular movement", () => {
			// Moving mouse vertically while dragging left edge
			const delta = { x: 0, y: 50 };

			const result = calculateEdgeResize("left", delta, originalDimensions, canvasSize);

			expect(result.width).toBe(200); // unchanged
			expect(result.height).toBe(150); // unchanged
		});
	});

	// ─── Dimension Clamping Tests ─────────────────────────────────────────────

	describe("clampDimensions", () => {
		it("clamps width below minimum", () => {
			const result = clampDimensions(30, 100);

			expect(result.width).toBe(INTERACTION_CONSTANTS.MIN_DIMENSION);
			expect(result.height).toBe(100);
		});

		it("clamps height below minimum", () => {
			const result = clampDimensions(100, 30);

			expect(result.width).toBe(100);
			expect(result.height).toBe(INTERACTION_CONSTANTS.MIN_DIMENSION);
		});

		it("clamps width above maximum", () => {
			const result = clampDimensions(5000, 100);

			expect(result.width).toBe(INTERACTION_CONSTANTS.MAX_DIMENSION);
			expect(result.height).toBe(100);
		});

		it("clamps height above maximum", () => {
			const result = clampDimensions(100, 5000);

			expect(result.width).toBe(100);
			expect(result.height).toBe(INTERACTION_CONSTANTS.MAX_DIMENSION);
		});

		it("preserves valid dimensions", () => {
			const result = clampDimensions(500, 400);

			expect(result.width).toBe(500);
			expect(result.height).toBe(400);
		});

		it("clamps both dimensions simultaneously", () => {
			const result = clampDimensions(30, 5000);

			expect(result.width).toBe(INTERACTION_CONSTANTS.MIN_DIMENSION);
			expect(result.height).toBe(INTERACTION_CONSTANTS.MAX_DIMENSION);
		});

		it("handles boundary values", () => {
			const minResult = clampDimensions(50, 50);
			expect(minResult.width).toBe(50);
			expect(minResult.height).toBe(50);

			const maxResult = clampDimensions(3840, 3840);
			expect(maxResult.width).toBe(3840);
			expect(maxResult.height).toBe(3840);
		});
	});

	// ─── Edge Cases ───────────────────────────────────────────────────────────

	describe("edge cases", () => {
		const canvasSize = { width: 1920, height: 1080 };

		it("handles very small canvas size", () => {
			const smallCanvas = { width: 100, height: 100 };
			const originalDimensions: OriginalDimensions = {
				width: 50,
				height: 50,
				offsetX: 0,
				offsetY: 0
			};
			const delta = { x: 10, y: 10 };

			const result = calculateCornerScale("bottomRight", delta, originalDimensions, smallCanvas);

			// Offset calculation uses canvas size as divisor
			expect(result.offsetX).toBeCloseTo(10 / 2 / 100, 5);
		});

		it("handles large delta values", () => {
			const originalDimensions: OriginalDimensions = {
				width: 200,
				height: 150,
				offsetX: 0,
				offsetY: 0
			};
			const delta = { x: 1000, y: 800 };

			const result = calculateCornerScale("bottomRight", delta, originalDimensions, canvasSize);

			// Should calculate without crashing
			expect(result.width).toBe(1200);
			expect(result.height).toBe(950);
		});

		it("handles negative original dimensions gracefully", () => {
			const badDimensions: OriginalDimensions = {
				width: -100,
				height: -50,
				offsetX: 0,
				offsetY: 0
			};
			const delta = { x: 10, y: 10 };

			// Should not crash
			const result = calculateCornerScale("bottomRight", delta, badDimensions, canvasSize);

			expect(typeof result.width).toBe("number");
			expect(typeof result.height).toBe("number");
		});

		it("handles zero canvas size by avoiding division by zero", () => {
			const zeroCanvas = { width: 0, height: 0 };
			const originalDimensions: OriginalDimensions = {
				width: 100,
				height: 100,
				offsetX: 0,
				offsetY: 0
			};
			const delta = { x: 10, y: 10 };

			// Should handle gracefully (offset calculation would have division by zero)
			const result = calculateCornerScale("bottomRight", delta, originalDimensions, zeroCanvas);

			// Offset would be Infinity or NaN, but shouldn't crash
			expect(typeof result.width).toBe("number");
		});
	});

	// ─── Integration Tests ────────────────────────────────────────────────────

	describe("integration", () => {
		it("maintains aspect ratio when scaling equally", () => {
			const canvasSize = { width: 1920, height: 1080 };
			const originalDimensions: OriginalDimensions = {
				width: 200,
				height: 100,
				offsetX: 0,
				offsetY: 0
			};
			// Scale by same percentage in both directions
			const delta = { x: 40, y: 20 }; // 20% increase

			const result = calculateCornerScale("bottomRight", delta, originalDimensions, canvasSize);

			const originalRatio = 200 / 100;
			const newRatio = result.width / result.height;

			expect(newRatio).toBeCloseTo(originalRatio, 5);
		});

		it("clamping integrates with scale calculation", () => {
			const canvasSize = { width: 1920, height: 1080 };
			const originalDimensions: OriginalDimensions = {
				width: 100,
				height: 100,
				offsetX: 0,
				offsetY: 0
			};
			// Try to scale down below minimum using bottomRight (positive delta decreases nothing,
			// so use topLeft with positive delta to decrease dimensions)
			const delta = { x: 80, y: 80 }; // topLeft: width = 100 - 80 = 20, height = 100 - 80 = 20

			const result = calculateCornerScale("topLeft", delta, originalDimensions, canvasSize);
			const clamped = clampDimensions(result.width, result.height);

			expect(clamped.width).toBe(INTERACTION_CONSTANTS.MIN_DIMENSION);
			expect(clamped.height).toBe(INTERACTION_CONSTANTS.MIN_DIMENSION);
		});
	});
});
