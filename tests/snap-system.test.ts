/**
 * SnapSystem Unit Tests
 *
 * These tests verify the pure snap functions used for clip positioning.
 * They serve as regression tests to ensure refactoring doesn't break snap behavior.
 */

import {
	type ClipBounds,
	type SnapGuide,
	type SnapResult,
	DEFAULT_SNAP_THRESHOLD,
	DEFAULT_SNAP_CONFIG,
	DEFAULT_ROTATION_SNAP_ANGLES,
	DEFAULT_ROTATION_SNAP_THRESHOLD,
	getClipSnapPoints,
	getCanvasSnapPoints,
	boundsToSnapPoints,
	snapToCanvas,
	snapToClips,
	snap,
	snapRotation,
	createClipBounds,
	createSnapContext
} from "@core/interaction/snap-system";

describe("SnapSystem", () => {
	// ─── Helper Function Tests ────────────────────────────────────────────────

	describe("getClipSnapPoints", () => {
		it("returns left, center, and right x positions", () => {
			const position = { x: 100, y: 200 };
			const size = { width: 50, height: 30 };

			const points = getClipSnapPoints(position, size);

			expect(points.x).toEqual([100, 125, 150]); // left, center, right
		});

		it("returns top, center, and bottom y positions", () => {
			const position = { x: 100, y: 200 };
			const size = { width: 50, height: 30 };

			const points = getClipSnapPoints(position, size);

			expect(points.y).toEqual([200, 215, 230]); // top, center, bottom
		});

		it("handles position at origin", () => {
			const points = getClipSnapPoints({ x: 0, y: 0 }, { width: 100, height: 100 });

			expect(points.x).toEqual([0, 50, 100]);
			expect(points.y).toEqual([0, 50, 100]);
		});

		it("handles negative positions", () => {
			const points = getClipSnapPoints({ x: -50, y: -25 }, { width: 100, height: 50 });

			expect(points.x).toEqual([-50, 0, 50]);
			expect(points.y).toEqual([-25, 0, 25]);
		});
	});

	describe("getCanvasSnapPoints", () => {
		it("returns edge and center positions for standard canvas", () => {
			const canvasSize = { width: 1920, height: 1080 };

			const points = getCanvasSnapPoints(canvasSize);

			expect(points.x).toEqual([0, 960, 1920]); // left, center, right
			expect(points.y).toEqual([0, 540, 1080]); // top, center, bottom
		});

		it("handles square canvas", () => {
			const points = getCanvasSnapPoints({ width: 1000, height: 1000 });

			expect(points.x).toEqual([0, 500, 1000]);
			expect(points.y).toEqual([0, 500, 1000]);
		});
	});

	describe("boundsToSnapPoints", () => {
		it("converts ClipBounds to snap points", () => {
			const bounds: ClipBounds = {
				left: 100,
				right: 300,
				top: 50,
				bottom: 150,
				centerX: 200,
				centerY: 100
			};

			const points = boundsToSnapPoints(bounds);

			expect(points.x).toEqual([100, 200, 300]);
			expect(points.y).toEqual([50, 100, 150]);
		});
	});

	describe("createClipBounds", () => {
		it("creates bounds from position and size", () => {
			const bounds = createClipBounds({ x: 100, y: 200 }, { width: 50, height: 30 });

			expect(bounds).toEqual({
				left: 100,
				right: 150,
				top: 200,
				bottom: 230,
				centerX: 125,
				centerY: 215
			});
		});
	});

	describe("createSnapContext", () => {
		it("creates context with default config", () => {
			const context = createSnapContext({ width: 100, height: 100 }, { width: 1920, height: 1080 });

			expect(context.clipSize).toEqual({ width: 100, height: 100 });
			expect(context.canvasSize).toEqual({ width: 1920, height: 1080 });
			expect(context.otherClips).toEqual([]);
			expect(context.config).toEqual(DEFAULT_SNAP_CONFIG);
		});

		it("allows config overrides", () => {
			const context = createSnapContext({ width: 100, height: 100 }, { width: 1920, height: 1080 }, [], { threshold: 10, snapToCanvas: false });

			expect(context.config.threshold).toBe(10);
			expect(context.config.snapToCanvas).toBe(false);
			expect(context.config.snapToClips).toBe(true); // default preserved
		});
	});

	// ─── Canvas Snapping Tests ────────────────────────────────────────────────

	describe("snapToCanvas", () => {
		const canvasSize = { width: 1920, height: 1080 };
		const clipSize = { width: 100, height: 100 };
		const threshold = 20;

		it("snaps clip left edge to canvas left edge", () => {
			const position = { x: 15, y: 500 }; // 15px from left edge

			const result = snapToCanvas(position, clipSize, canvasSize, threshold);

			expect(result.position.x).toBe(0);
			expect(result.guides).toContainEqual(expect.objectContaining({ axis: "x", position: 0, type: "canvas" }));
		});

		it("snaps clip right edge to canvas right edge", () => {
			// Clip right edge at 1920 - 15 = 1905, so x = 1905 - 100 = 1805
			const position = { x: 1805, y: 500 };

			const result = snapToCanvas(position, clipSize, canvasSize, threshold);

			expect(result.position.x).toBe(1820); // 1920 - 100
			expect(result.guides).toContainEqual(expect.objectContaining({ axis: "x", position: 1920, type: "canvas" }));
		});

		it("snaps clip center to canvas center horizontally", () => {
			// Clip center at 960 + 10 = 970, so x = 970 - 50 = 920
			const position = { x: 920, y: 500 };

			const result = snapToCanvas(position, clipSize, canvasSize, threshold);

			expect(result.position.x).toBe(910); // 960 - 50
			expect(result.guides).toContainEqual(expect.objectContaining({ axis: "x", position: 960, type: "canvas" }));
		});

		it("snaps clip top edge to canvas top edge", () => {
			const position = { x: 500, y: 15 };

			const result = snapToCanvas(position, clipSize, canvasSize, threshold);

			expect(result.position.y).toBe(0);
			expect(result.guides).toContainEqual(expect.objectContaining({ axis: "y", position: 0, type: "canvas" }));
		});

		it("snaps clip bottom edge to canvas bottom edge", () => {
			// Clip bottom at 1080 - 15 = 1065, so y = 1065 - 100 = 965
			const position = { x: 500, y: 965 };

			const result = snapToCanvas(position, clipSize, canvasSize, threshold);

			expect(result.position.y).toBe(980); // 1080 - 100
			expect(result.guides).toContainEqual(expect.objectContaining({ axis: "y", position: 1080, type: "canvas" }));
		});

		it("snaps clip center to canvas center vertically", () => {
			// Clip center at 540 + 10 = 550, so y = 550 - 50 = 500
			const position = { x: 500, y: 500 };

			const result = snapToCanvas(position, clipSize, canvasSize, threshold);

			expect(result.position.y).toBe(490); // 540 - 50
			expect(result.guides).toContainEqual(expect.objectContaining({ axis: "y", position: 540, type: "canvas" }));
		});

		it("snaps to both X and Y simultaneously", () => {
			const position = { x: 15, y: 15 }; // Near top-left corner

			const result = snapToCanvas(position, clipSize, canvasSize, threshold);

			expect(result.position).toEqual({ x: 0, y: 0 });
			expect(result.guides).toHaveLength(2);
		});

		it("does not snap when outside threshold", () => {
			const position = { x: 100, y: 200 }; // Far from any snap point

			const result = snapToCanvas(position, clipSize, canvasSize, threshold);

			expect(result.position).toEqual({ x: 100, y: 200 });
			expect(result.guides).toHaveLength(0);
		});

		it("snaps to closest snap point when multiple are in range", () => {
			// Position clip so left edge is 5px from canvas left (closer)
			// and right edge is 15px from canvas center (further)
			const position = { x: 5, y: 500 };

			const result = snapToCanvas(position, clipSize, canvasSize, threshold);

			expect(result.position.x).toBe(0); // Snaps to left edge (closest)
		});

		it("prefers closer snap when multiple snap points are in range", () => {
			// Left edge at 958 is 2px from canvas center (960) - within threshold
			// This is closer than center (1008) to any canvas snap point
			const position = { x: 958, y: 500 };

			const result = snapToCanvas(position, clipSize, canvasSize, threshold);

			// Left edge (958) snaps to canvas center (960), so x moves by +2
			expect(result.position.x).toBe(960);
			expect(result.guides).toContainEqual(expect.objectContaining({ axis: "x", position: 960, type: "canvas" }));
		});
	});

	// ─── Clip-to-Clip Snapping Tests ──────────────────────────────────────────

	describe("snapToClips", () => {
		const clipSize = { width: 100, height: 100 };
		const threshold = 20;

		it("returns unchanged position when no other clips exist", () => {
			const position = { x: 500, y: 500 };

			const result = snapToClips(position, clipSize, [], threshold);

			expect(result.position).toEqual(position);
			expect(result.guides).toHaveLength(0);
		});

		it("snaps clip left edge to another clip's right edge", () => {
			const otherClip: ClipBounds = {
				left: 200,
				right: 300,
				top: 500,
				bottom: 600,
				centerX: 250,
				centerY: 550
			};
			// My left edge at 310, should snap to other's right edge at 300
			const position = { x: 310, y: 500 };

			const result = snapToClips(position, clipSize, [otherClip], threshold);

			expect(result.position.x).toBe(300);
			expect(result.guides).toContainEqual(
				expect.objectContaining({
					axis: "x",
					position: 300,
					type: "clip"
				})
			);
		});

		it("snaps clip center to another clip's center horizontally", () => {
			const otherClip: ClipBounds = {
				left: 200,
				right: 300,
				top: 500,
				bottom: 600,
				centerX: 250,
				centerY: 550
			};
			// My center at 260 (x=210), should snap to other's center at 250 (x=200)
			const position = { x: 210, y: 100 };

			const result = snapToClips(position, clipSize, [otherClip], threshold);

			expect(result.position.x).toBe(200); // center aligned at 250
		});

		it("snaps clip top edge to another clip's bottom edge", () => {
			const otherClip: ClipBounds = {
				left: 500,
				right: 600,
				top: 200,
				bottom: 300,
				centerX: 550,
				centerY: 250
			};
			// My top at 310, should snap to other's bottom at 300
			const position = { x: 500, y: 310 };

			const result = snapToClips(position, clipSize, [otherClip], threshold);

			expect(result.position.y).toBe(300);
			expect(result.guides).toContainEqual(
				expect.objectContaining({
					axis: "y",
					position: 300,
					type: "clip"
				})
			);
		});

		it("includes correct bounds for clip guide spanning both clips", () => {
			const otherClip: ClipBounds = {
				left: 200,
				right: 300,
				top: 100,
				bottom: 200,
				centerX: 250,
				centerY: 150
			};
			// Snap my left to other's right, my clip is below other clip
			const position = { x: 310, y: 300 };

			const result = snapToClips(position, clipSize, [otherClip], threshold);

			const xGuide = result.guides.find(g => g.axis === "x");
			expect(xGuide?.bounds).toEqual({
				start: 100, // other clip's top
				end: 400 // my clip's bottom (300 + 100)
			});
		});

		it("snaps to the closest clip when multiple clips are nearby", () => {
			const clip1: ClipBounds = {
				left: 200,
				right: 300,
				top: 500,
				bottom: 600,
				centerX: 250,
				centerY: 550
			};
			const clip2: ClipBounds = {
				left: 305,
				right: 405,
				top: 500,
				bottom: 600,
				centerX: 355,
				centerY: 550
			};
			// My left at 315, closer to clip2's left (305) than clip1's right (300)
			const position = { x: 315, y: 500 };

			const result = snapToClips(position, clipSize, [clip1, clip2], threshold);

			expect(result.position.x).toBe(305); // Snaps to clip2's left (closer)
		});

		it("snaps to both X and Y from different clips", () => {
			// Position clips so there's no ambiguity about which is closest
			const clipOnRight: ClipBounds = {
				left: 615, // My right edge (610) is 5px away
				right: 715,
				top: 200,
				bottom: 300,
				centerX: 665,
				centerY: 250
			};
			const clipBelow: ClipBounds = {
				left: 200,
				right: 300,
				top: 615, // My bottom edge (610) is 5px away
				bottom: 715,
				centerX: 250,
				centerY: 665
			};
			// My clip: left=510, right=610, top=510, bottom=610
			const position = { x: 510, y: 510 };

			const result = snapToClips(position, clipSize, [clipOnRight, clipBelow], threshold);

			// Right edge (610) snaps to clipOnRight's left (615), so x = 510 + 5 = 515
			expect(result.position.x).toBe(515);
			// Bottom edge (610) snaps to clipBelow's top (615), so y = 510 + 5 = 515
			expect(result.position.y).toBe(515);
			expect(result.guides).toHaveLength(2);
		});
	});

	// ─── Combined Snap Function Tests ─────────────────────────────────────────

	describe("snap (combined function)", () => {
		const clipSize = { width: 100, height: 100 };
		const canvasSize = { width: 1920, height: 1080 };

		it("respects snapToCanvas=false config", () => {
			const context = createSnapContext(clipSize, canvasSize, [], {
				snapToCanvas: false,
				snapToClips: true
			});
			const position = { x: 15, y: 15 }; // Would snap to canvas corner

			const result = snap(position, context);

			expect(result.position).toEqual({ x: 15, y: 15 });
			expect(result.guides).toHaveLength(0);
		});

		it("respects snapToClips=false config", () => {
			const otherClip: ClipBounds = {
				left: 100,
				right: 200,
				top: 100,
				bottom: 200,
				centerX: 150,
				centerY: 150
			};
			const context = createSnapContext(clipSize, canvasSize, [otherClip], {
				snapToCanvas: false,
				snapToClips: false
			});
			const position = { x: 205, y: 100 }; // Would snap to clip

			const result = snap(position, context);

			expect(result.position).toEqual({ x: 205, y: 100 });
		});

		it("clip snapping takes priority over canvas snapping when both match", () => {
			// Position a clip right at the canvas center
			const otherClip: ClipBounds = {
				left: 935,
				right: 985,
				top: 515,
				bottom: 565,
				centerX: 960, // Same as canvas center!
				centerY: 540
			};
			const context = createSnapContext(clipSize, canvasSize, [otherClip], {
				threshold: 20
			});
			// My center at 970 (x=920), within threshold of both canvas center (960) and clip center (960)
			const position = { x: 920, y: 500 };

			const result = snap(position, context);

			// Should have clip guide, not canvas guide (clip takes priority)
			const xGuide = result.guides.find(g => g.axis === "x");
			expect(xGuide?.type).toBe("clip");
			expect(result.position.x).toBe(910); // Center aligned at 960
		});

		it("uses canvas snap when clip snap is further away", () => {
			// Clip that's slightly offset from canvas center
			const otherClip: ClipBounds = {
				left: 800,
				right: 850,
				top: 400,
				bottom: 450,
				centerX: 825,
				centerY: 425
			};
			const context = createSnapContext(clipSize, canvasSize, [otherClip], {
				threshold: 20
			});
			// Position where center is near canvas center (960), but far from clip center (825)
			const position = { x: 920, y: 500 };

			const result = snap(position, context);

			// Canvas center snap should win (closer)
			expect(result.position.x).toBe(910);
			const xGuide = result.guides.find(g => g.axis === "x");
			// Both are at same position, but when clip snap doesn't find anything closer
			// canvas snap remains. Actually, my center is at 970, otherClip center is 825
			// Distance to canvas center (960) is 10, distance to clip center (825) is 145
			// So canvas wins
			expect(xGuide?.type).toBe("canvas");
		});

		it("handles mixed snap - canvas X, clip Y", () => {
			const otherClip: ClipBounds = {
				left: 400,
				right: 500,
				top: 505,
				bottom: 605,
				centerX: 450,
				centerY: 555
			};
			const context = createSnapContext(clipSize, canvasSize, [otherClip]);

			// Position where left edge near canvas left (0), top edge near clip bottom (605)
			const position = { x: 10, y: 610 };

			const result = snap(position, context);

			expect(result.position.x).toBe(0); // Canvas left snap
			expect(result.position.y).toBe(605); // Clip bottom snap

			const xGuide = result.guides.find(g => g.axis === "x");
			const yGuide = result.guides.find(g => g.axis === "y");
			expect(xGuide?.type).toBe("canvas");
			expect(yGuide?.type).toBe("clip");
		});
	});

	// ─── Rotation Snapping Tests ──────────────────────────────────────────────

	describe("snapRotation", () => {
		it("snaps to 0 degrees", () => {
			const result = snapRotation(3);

			expect(result.angle).toBe(0);
			expect(result.snapped).toBe(true);
		});

		it("snaps to 45 degrees", () => {
			const result = snapRotation(47);

			expect(result.angle).toBe(45);
			expect(result.snapped).toBe(true);
		});

		it("snaps to 90 degrees", () => {
			const result = snapRotation(88);

			expect(result.angle).toBe(90);
			expect(result.snapped).toBe(true);
		});

		it("snaps to 180 degrees", () => {
			// Use 178 (not 182) to avoid Math.round edge case at halfway point
			const result = snapRotation(178);

			expect(result.angle).toBe(180);
			expect(result.snapped).toBe(true);
		});

		it("snaps to 270 degrees", () => {
			// Use negative angle to avoid Math.round edge case
			// -92 normalizes to 268, Math.round(-92/360) = 0, result = 0 + 270 = 270
			const result = snapRotation(-92);

			expect(result.angle).toBe(270);
			expect(result.snapped).toBe(true);
		});

		it("snaps to 315 degrees", () => {
			// Use negative angle to avoid Math.round edge case
			// -47 normalizes to 313, Math.round(-47/360) = 0, result = 0 + 315 = 315
			const result = snapRotation(-47);

			expect(result.angle).toBe(315);
			expect(result.snapped).toBe(true);
		});

		it("handles Math.round edge case past halfway rotation", () => {
			// Note: This is current Player behavior - angles just past 180 round up
			// 182/360 = 0.505..., Math.round() = 1, so result = 360 + 180 = 540
			// This is arguably a bug but we preserve it for backward compatibility
			const result = snapRotation(182);

			expect(result.angle).toBe(540); // 360 + 180
			expect(result.snapped).toBe(true);
		});

		it("does not snap when outside threshold", () => {
			const result = snapRotation(30); // 30 is between 0 and 45, far from both

			expect(result.angle).toBe(30);
			expect(result.snapped).toBe(false);
		});

		it("handles negative angles", () => {
			const result = snapRotation(-3); // Should normalize and snap to 0 (or 360)

			// -3 normalized is 357, which is within 5 degrees of 0 (wrapping)
			expect(result.snapped).toBe(true);
			expect(result.angle).toBe(0);
		});

		it("preserves full rotations when snapping", () => {
			// 723 degrees = 2 full rotations + 3 degrees
			// Should snap to 720 degrees (2 full rotations + 0)
			const result = snapRotation(723);

			expect(result.angle).toBe(720);
			expect(result.snapped).toBe(true);
		});

		it("handles very large angles", () => {
			// 1443 degrees = 4 full rotations + 3 degrees
			const result = snapRotation(1443);

			expect(result.angle).toBe(1440); // 4 full rotations
			expect(result.snapped).toBe(true);
		});

		it("allows custom snap angles", () => {
			const customAngles = [0, 30, 60, 90, 120, 150, 180];

			const result = snapRotation(32, customAngles);

			expect(result.angle).toBe(30);
			expect(result.snapped).toBe(true);
		});

		it("allows custom threshold", () => {
			// With default threshold of 5, 8 degrees wouldn't snap to 0
			const defaultResult = snapRotation(8);
			expect(defaultResult.snapped).toBe(false);

			// With threshold of 10, it should snap
			const customResult = snapRotation(8, DEFAULT_ROTATION_SNAP_ANGLES, 10);
			expect(customResult.snapped).toBe(true);
			expect(customResult.angle).toBe(0);
		});

		it("handles wrap-around at 360/0 boundary", () => {
			// 358 degrees should snap to 0 (or 360), not stay at 358
			const result = snapRotation(358);

			expect(result.snapped).toBe(true);
			expect(result.angle).toBe(360); // Snaps to 0 but preserves the rotation count
		});
	});

	// ─── Constants Tests ──────────────────────────────────────────────────────

	describe("constants", () => {
		it("has correct default snap threshold", () => {
			expect(DEFAULT_SNAP_THRESHOLD).toBe(20);
		});

		it("has correct default rotation snap angles", () => {
			expect(DEFAULT_ROTATION_SNAP_ANGLES).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
		});

		it("has correct default rotation snap threshold", () => {
			expect(DEFAULT_ROTATION_SNAP_THRESHOLD).toBe(5);
		});

		it("has correct default snap config", () => {
			expect(DEFAULT_SNAP_CONFIG).toEqual({
				threshold: 20,
				snapToCanvas: true,
				snapToClips: true
			});
		});
	});

	// ─── Edge Cases ───────────────────────────────────────────────────────────

	describe("edge cases", () => {
		it("handles zero-size clip", () => {
			const points = getClipSnapPoints({ x: 100, y: 100 }, { width: 0, height: 0 });

			expect(points.x).toEqual([100, 100, 100]);
			expect(points.y).toEqual([100, 100, 100]);
		});

		it("handles very large coordinates", () => {
			const position = { x: 100000, y: 100000 };
			const clipSize = { width: 100, height: 100 };
			const canvasSize = { width: 1920, height: 1080 };

			const result = snapToCanvas(position, clipSize, canvasSize, 20);

			// Should not snap (far from canvas)
			expect(result.position).toEqual(position);
			expect(result.guides).toHaveLength(0);
		});

		it("handles floating point positions", () => {
			const position = { x: 0.001, y: 0.001 };
			const clipSize = { width: 100, height: 100 };
			const canvasSize = { width: 1920, height: 1080 };

			const result = snapToCanvas(position, clipSize, canvasSize, 20);

			// Should snap to 0
			expect(result.position.x).toBe(0);
			expect(result.position.y).toBe(0);
		});

		it("handles threshold of 0 (no snapping)", () => {
			const position = { x: 1, y: 1 };
			const clipSize = { width: 100, height: 100 };
			const canvasSize = { width: 1920, height: 1080 };

			const result = snapToCanvas(position, clipSize, canvasSize, 0);

			// With threshold 0, nothing should snap
			expect(result.position).toEqual({ x: 1, y: 1 });
			expect(result.guides).toHaveLength(0);
		});

		it("handles very large threshold (always snaps)", () => {
			const position = { x: 500, y: 300 };
			const clipSize = { width: 100, height: 100 };
			const canvasSize = { width: 1920, height: 1080 };

			const result = snapToCanvas(position, clipSize, canvasSize, 10000);

			// With huge threshold, should snap to closest point
			expect(result.guides.length).toBeGreaterThan(0);
		});
	});

	// ─── Type Safety Tests ────────────────────────────────────────────────────

	describe("type safety", () => {
		it("SnapGuide has correct structure for canvas guide", () => {
			const guide: SnapGuide = {
				axis: "x",
				position: 960,
				type: "canvas"
			};

			expect(guide.bounds).toBeUndefined();
		});

		it("SnapGuide has correct structure for clip guide", () => {
			const guide: SnapGuide = {
				axis: "y",
				position: 540,
				type: "clip",
				bounds: { start: 100, end: 600 }
			};

			expect(guide.bounds).toBeDefined();
			expect(guide.bounds?.start).toBe(100);
			expect(guide.bounds?.end).toBe(600);
		});

		it("SnapResult contains position and guides", () => {
			const result: SnapResult = {
				position: { x: 100, y: 200 },
				guides: []
			};

			expect(result.position).toBeDefined();
			expect(result.guides).toBeDefined();
		});
	});
});
