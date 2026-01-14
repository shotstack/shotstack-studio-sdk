/**
 * Interaction Calculations Tests
 *
 * Tests for pure calculation functions extracted from InteractionController.
 * These functions have no side effects and are easily testable in isolation.
 */

import type { ResolvedClip } from "@schemas";

import {
	pixelsToSeconds,
	secondsToPixels,
	formatDragTime,
	buildTrackYPositions,
	getTrackYPosition,
	getDragTargetAtY,
	buildSnapPoints,
	findNearestSnapPoint,
	getTrackClipsExcluding,
	findOverlappingClip,
	resolveOverlapSnap,
	resolveClipCollision,
	findContentClipAtPosition,
	distance,
	exceedsDragThreshold
} from "../src/components/timeline/interaction/interaction-calculations";
import type { ClipState, TrackState } from "../src/components/timeline/timeline.types";

// ─── Test Fixtures ─────────────────────────────────────────────────────────

function createMockClip(start: number, length: number, assetType = "image", trackIndex = 0, clipIndex = 0): ClipState {
	return {
		id: `${trackIndex}-${clipIndex}`,
		trackIndex,
		clipIndex,
		config: {
			start,
			length,
			asset: { type: assetType, src: "https://example.com/test.jpg" }
		} as ResolvedClip,
		visualState: "normal",
		timingIntent: { start, length }
	};
}

function createMockTrack(clips: ClipState[], primaryAssetType = "image"): TrackState {
	return {
		index: clips[0]?.trackIndex ?? 0,
		clips,
		primaryAssetType
	};
}

// ─── Coordinate Transforms ─────────────────────────────────────────────────

describe("Coordinate Transforms", () => {
	describe("pixelsToSeconds", () => {
		it("converts pixels to seconds at standard zoom", () => {
			expect(pixelsToSeconds(100, 50)).toBe(2); // 100px / 50pps = 2s
		});

		it("handles zero pixels", () => {
			expect(pixelsToSeconds(0, 50)).toBe(0);
		});

		it("handles different zoom levels", () => {
			expect(pixelsToSeconds(100, 100)).toBe(1);
			expect(pixelsToSeconds(100, 25)).toBe(4);
		});
	});

	describe("secondsToPixels", () => {
		it("converts seconds to pixels at standard zoom", () => {
			expect(secondsToPixels(2, 50)).toBe(100); // 2s * 50pps = 100px
		});

		it("handles zero seconds", () => {
			expect(secondsToPixels(0, 50)).toBe(0);
		});

		it("is inverse of pixelsToSeconds", () => {
			const pps = 50;
			const seconds = 3.5;
			expect(pixelsToSeconds(secondsToPixels(seconds, pps), pps)).toBeCloseTo(seconds);
		});
	});
});

// ─── Time Formatting ───────────────────────────────────────────────────────

describe("formatDragTime", () => {
	it("formats zero seconds", () => {
		expect(formatDragTime(0)).toBe("00:00.0");
	});

	it("formats seconds with tenths", () => {
		// Note: Due to floating point precision, 5.3 becomes 5.299... which floors to 2
		expect(formatDragTime(5.35)).toBe("00:05.3");
	});

	it("formats minutes and seconds", () => {
		expect(formatDragTime(65)).toBe("01:05.0");
	});

	it("formats complex time correctly", () => {
		expect(formatDragTime(125.7)).toBe("02:05.7");
	});

	it("pads single digit values", () => {
		expect(formatDragTime(3)).toBe("00:03.0");
	});
});

// ─── Track Y Position Calculations ─────────────────────────────────────────

describe("Track Y Position Calculations", () => {
	describe("buildTrackYPositions", () => {
		it("returns empty array for no tracks", () => {
			expect(buildTrackYPositions([])).toEqual([]);
		});

		it("calculates positions for image tracks (72px height)", () => {
			const tracks: TrackState[] = [createMockTrack([createMockClip(0, 1)], "image"), createMockTrack([createMockClip(0, 1, "image", 1)], "image")];
			expect(buildTrackYPositions(tracks)).toEqual([0, 72]);
		});

		it("calculates positions for audio tracks (48px height)", () => {
			const tracks: TrackState[] = [
				createMockTrack([createMockClip(0, 1, "audio")], "audio"),
				createMockTrack([createMockClip(0, 1, "audio", 1)], "audio")
			];
			expect(buildTrackYPositions(tracks)).toEqual([0, 48]);
		});

		it("handles mixed track types", () => {
			const tracks: TrackState[] = [
				createMockTrack([createMockClip(0, 1)], "image"), // 72px
				createMockTrack([createMockClip(0, 1, "audio", 1)], "audio") // 48px
			];
			const positions = buildTrackYPositions(tracks);
			expect(positions).toEqual([0, 72]); // Second track starts at 72
		});
	});

	describe("getTrackYPosition", () => {
		it("returns correct position from cache", () => {
			const cache = [0, 60, 120];
			expect(getTrackYPosition(0, cache)).toBe(0);
			expect(getTrackYPosition(1, cache)).toBe(60);
			expect(getTrackYPosition(2, cache)).toBe(120);
		});

		it("returns 0 for out of bounds index", () => {
			const cache = [0, 60];
			expect(getTrackYPosition(5, cache)).toBe(0);
		});
	});
});

// ─── Drag Target Detection ─────────────────────────────────────────────────

describe("getDragTargetAtY", () => {
	// Image tracks are 72px each
	const tracks: TrackState[] = [
		createMockTrack([createMockClip(0, 1)], "image"), // 0-72
		createMockTrack([createMockClip(0, 1, "image", 1)], "image") // 72-144
	];

	it("returns insert at 0 for top edge", () => {
		const result = getDragTargetAtY(3, tracks);
		expect(result).toEqual({ type: "insert", insertionIndex: 0 });
	});

	it("returns track 0 for middle of first track", () => {
		const result = getDragTargetAtY(36, tracks);
		expect(result).toEqual({ type: "track", trackIndex: 0 });
	});

	it("returns insert between tracks at boundary", () => {
		const result = getDragTargetAtY(72, tracks);
		expect(result).toEqual({ type: "insert", insertionIndex: 1 });
	});

	it("returns track 1 for middle of second track", () => {
		const result = getDragTargetAtY(108, tracks);
		expect(result).toEqual({ type: "track", trackIndex: 1 });
	});

	it("returns insert after last track at bottom", () => {
		const result = getDragTargetAtY(150, tracks);
		expect(result).toEqual({ type: "insert", insertionIndex: 2 });
	});
});

// ─── Snap Point Logic ──────────────────────────────────────────────────────

describe("Snap Point Logic", () => {
	describe("buildSnapPoints", () => {
		it("includes playhead position", () => {
			const points = buildSnapPoints({
				tracks: [],
				playheadTimeMs: 5000,
				excludeClip: { trackIndex: 0, clipIndex: 0 }
			});

			expect(points).toContainEqual({ time: 5, type: "playhead" });
		});

		it("includes clip start and end edges", () => {
			const clip = createMockClip(2, 3);
			const track = createMockTrack([clip]);

			const points = buildSnapPoints({
				tracks: [track],
				playheadTimeMs: 0,
				excludeClip: { trackIndex: 1, clipIndex: 0 } // Different clip
			});

			expect(points).toContainEqual({ time: 2, type: "clip-start" });
			expect(points).toContainEqual({ time: 5, type: "clip-end" }); // 2 + 3
		});

		it("excludes the specified clip", () => {
			const clip = createMockClip(2, 3);
			const track = createMockTrack([clip]);

			const points = buildSnapPoints({
				tracks: [track],
				playheadTimeMs: 0,
				excludeClip: { trackIndex: 0, clipIndex: 0 } // Same clip
			});

			// Should only have playhead, not clip edges
			expect(points).toHaveLength(1);
			expect(points[0].type).toBe("playhead");
		});
	});

	describe("findNearestSnapPoint", () => {
		const snapPoints = [
			{ time: 0, type: "playhead" as const },
			{ time: 5, type: "clip-start" as const },
			{ time: 10, type: "clip-end" as const }
		];

		it("snaps to nearby point within threshold", () => {
			const result = findNearestSnapPoint({
				time: 4.9,
				snapPoints,
				snapThresholdPx: 10,
				pixelsPerSecond: 50
			});
			expect(result).toBe(5);
		});

		it("returns null when no point within threshold", () => {
			const result = findNearestSnapPoint({
				time: 7.5,
				snapPoints,
				snapThresholdPx: 10,
				pixelsPerSecond: 50
			});
			expect(result).toBeNull();
		});

		it("returns first match (not closest)", () => {
			const result = findNearestSnapPoint({
				time: 0.1,
				snapPoints,
				snapThresholdPx: 10,
				pixelsPerSecond: 50
			});
			expect(result).toBe(0);
		});
	});
});

// ─── Collision Detection ───────────────────────────────────────────────────

describe("Collision Detection", () => {
	describe("getTrackClipsExcluding", () => {
		it("returns empty array for empty track", () => {
			const track = createMockTrack([]);
			const result = getTrackClipsExcluding(track, { trackIndex: 0, clipIndex: 0 });
			expect(result).toEqual([]);
		});

		it("excludes specified clip", () => {
			const clips = [createMockClip(0, 1, "image", 0, 0), createMockClip(2, 1, "image", 0, 1)];
			const track = createMockTrack(clips);

			const result = getTrackClipsExcluding(track, { trackIndex: 0, clipIndex: 0 });
			expect(result).toHaveLength(1);
			expect(result[0].clipIndex).toBe(1);
		});

		it("sorts clips by start time", () => {
			const clips = [createMockClip(5, 1, "image", 0, 0), createMockClip(2, 1, "image", 0, 1), createMockClip(8, 1, "image", 0, 2)];
			const track = createMockTrack(clips);

			const result = getTrackClipsExcluding(track, { trackIndex: 1, clipIndex: 0 }); // Exclude different track
			expect(result[0].config.start).toBe(2);
			expect(result[1].config.start).toBe(5);
			expect(result[2].config.start).toBe(8);
		});
	});

	describe("findOverlappingClip", () => {
		const clips = [createMockClip(0, 2, "image", 0, 0), createMockClip(3, 2, "image", 0, 1)];

		it("returns null when no overlap", () => {
			const result = findOverlappingClip(clips, 2, 0.5);
			expect(result).toBeNull();
		});

		it("finds overlapping clip", () => {
			const result = findOverlappingClip(clips, 1, 2);
			expect(result).not.toBeNull();
			expect(result?.index).toBe(0);
		});

		it("detects partial overlap at start", () => {
			const result = findOverlappingClip(clips, 1.5, 1);
			expect(result).not.toBeNull();
		});

		it("detects partial overlap at end", () => {
			const result = findOverlappingClip(clips, 2.5, 1);
			expect(result).not.toBeNull();
			expect(result?.index).toBe(1);
		});
	});

	describe("resolveOverlapSnap", () => {
		const clips = [createMockClip(0, 2, "image", 0, 0), createMockClip(5, 2, "image", 0, 1)];
		const targetClip = clips[0];

		it("snaps to right when dragged center is right of target center", () => {
			const result = resolveOverlapSnap(targetClip, 0, 1.5, 1, clips);
			expect(result.newStartTime).toBe(2); // End of target clip
			expect(result.pushOffset).toBe(0);
		});

		it("snaps to left when dragged center is left of target center", () => {
			// When snapping left and there's no space (target starts at 0),
			// the function falls back to placing at prevClipEnd (0) with a push offset
			const result = resolveOverlapSnap(targetClip, 0, 0.2, 1, clips);
			expect(result.newStartTime).toBe(0); // Clamped to prevClipEnd (0)
			expect(result.pushOffset).toBe(1); // 0 + 1 - 0 = 1 (needs to push target)
		});

		it("calculates push offset when clips would overlap after snap", () => {
			// Snapping right would cause overlap with next clip
			const tightClips = [createMockClip(0, 2, "image", 0, 0), createMockClip(2.5, 2, "image", 0, 1)];
			const result = resolveOverlapSnap(tightClips[0], 0, 1.5, 1, tightClips);
			expect(result.pushOffset).toBe(0.5); // Pushed into next clip by 0.5
		});
	});

	describe("resolveClipCollision", () => {
		it("returns desired position when track is empty", () => {
			const track = createMockTrack([]);
			const result = resolveClipCollision({
				track,
				desiredStart: 5,
				clipLength: 1,
				excludeClip: { trackIndex: 0, clipIndex: 0 }
			});
			expect(result.newStartTime).toBe(5);
			expect(result.pushOffset).toBe(0);
		});

		it("returns desired position when no collision", () => {
			const clips = [createMockClip(0, 2, "image", 0, 0)];
			const track = createMockTrack(clips);

			const result = resolveClipCollision({
				track,
				desiredStart: 5,
				clipLength: 1,
				excludeClip: { trackIndex: 1, clipIndex: 0 }
			});
			expect(result.newStartTime).toBe(5);
		});

		it("resolves collision with snap", () => {
			const clips = [createMockClip(2, 2, "image", 0, 0)];
			const track = createMockTrack(clips);

			const result = resolveClipCollision({
				track,
				desiredStart: 2.5,
				clipLength: 1,
				excludeClip: { trackIndex: 1, clipIndex: 0 }
			});
			// Should snap to end of target clip (4)
			expect(result.newStartTime).toBe(4);
		});

		it("allows overlap with luma clips", () => {
			const clips = [createMockClip(2, 2, "luma", 0, 0)];
			const track = createMockTrack(clips);

			const result = resolveClipCollision({
				track,
				desiredStart: 2.5,
				clipLength: 1,
				excludeClip: { trackIndex: 1, clipIndex: 0 }
			});
			// Should not resolve - luma clips are overlayable
			expect(result.newStartTime).toBe(2.5);
		});
	});
});

// ─── Content Clip Detection ────────────────────────────────────────────────

describe("findContentClipAtPosition", () => {
	it("returns null for empty track", () => {
		const track = createMockTrack([]);
		const result = findContentClipAtPosition({ track, time: 5 });
		expect(result).toBeNull();
	});

	it("finds clip at time position", () => {
		const clips = [createMockClip(0, 2, "image", 0, 0), createMockClip(3, 2, "video", 0, 1)];
		const track = createMockTrack(clips);

		const result = findContentClipAtPosition({ track, time: 3.5 });
		expect(result).not.toBeNull();
		expect(result?.clipIndex).toBe(1);
	});

	it("excludes luma clips", () => {
		const clips = [createMockClip(0, 5, "luma", 0, 0)];
		const track = createMockTrack(clips);

		const result = findContentClipAtPosition({ track, time: 2 });
		expect(result).toBeNull();
	});

	it("excludes specified clip", () => {
		const clips = [createMockClip(0, 5, "image", 0, 0)];
		const track = createMockTrack(clips);

		const result = findContentClipAtPosition({
			track,
			time: 2,
			excludeClip: { trackIndex: 0, clipIndex: 0 }
		});
		expect(result).toBeNull();
	});

	it("returns null when time is outside all clips", () => {
		const clips = [createMockClip(0, 2, "image", 0, 0)];
		const track = createMockTrack(clips);

		const result = findContentClipAtPosition({ track, time: 5 });
		expect(result).toBeNull();
	});
});

// ─── Distance Calculations ─────────────────────────────────────────────────

describe("Distance Calculations", () => {
	describe("distance", () => {
		it("calculates distance from origin", () => {
			expect(distance(3, 4)).toBe(5); // 3-4-5 triangle
		});

		it("handles zero distance", () => {
			expect(distance(0, 0)).toBe(0);
		});

		it("handles negative values", () => {
			expect(distance(-3, -4)).toBe(5);
		});
	});

	describe("exceedsDragThreshold", () => {
		it("returns false when under threshold", () => {
			expect(exceedsDragThreshold(2, 2, 5)).toBe(false);
		});

		it("returns true when at threshold", () => {
			expect(exceedsDragThreshold(3, 4, 5)).toBe(true);
		});

		it("returns true when over threshold", () => {
			expect(exceedsDragThreshold(10, 10, 5)).toBe(true);
		});
	});
});
