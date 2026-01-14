/**
 * TimelineStateManager Tests
 */

import { describe, it, expect, jest } from "@jest/globals";
import { TimelineStateManager } from "../src/components/timeline/core/state/timeline-state";
import { EditEvent } from "../src/core/events/edit-events";

// Mock EventEmitter with event storage for testing
function createMockEventEmitter() {
	const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
	return {
		on: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(callback);
		}),
		off: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
			if (listeners[event]) {
				const idx = listeners[event].indexOf(callback);
				if (idx >= 0) listeners[event].splice(idx, 1);
			}
		}),
		emit: (event: string, ...args: unknown[]) => {
			if (listeners[event]) {
				listeners[event].forEach(cb => cb(...args));
			}
		},
		getListenerCount: (event: string) => listeners[event]?.length ?? 0
	};
}

// Mock Edit class with minimal required functionality
function createMockEdit(tracks: unknown[][] = []) {
	const events = createMockEventEmitter();

	const mockClips = tracks.map((track, trackIdx) =>
		track.map((clip, clipIdx) => ({
			...(clip as object),
			trackIndex: trackIdx,
			clipIndex: clipIdx
		}))
	);

	return {
		events,
		playbackTime: 0,
		isPlaying: false,
		totalDuration: 10000,
		getResolvedEdit: jest.fn(() => ({
			timeline: {
				tracks: mockClips.map(clips => ({
					clips: clips.map(c => ({
						asset: (c as { asset?: unknown }).asset,
						start: (c as { start?: number }).start ?? 0,
						length: (c as { length?: number }).length ?? 5
					}))
				}))
			}
		})),
		getEdit: jest.fn(() => ({
			timeline: {
				tracks: mockClips.map(clips => ({
					clips: clips.map(c => ({
						start: (c as { start?: number }).start ?? 0,
						length: (c as { length?: number }).length ?? 5
					}))
				}))
			}
		})),
		isClipSelected: jest.fn(() => false),
		selectClip: jest.fn(),
		clearSelection: jest.fn(),
		getPlayerClip: jest.fn()
	};
}

describe("TimelineStateManager", () => {
	describe("cache invalidation", () => {
		it("subscribes to ClipUpdated event on construction", () => {
			const edit = createMockEdit();
			const stateManager = new TimelineStateManager(edit as never);

			expect(edit.events.on).toHaveBeenCalledWith(EditEvent.ClipUpdated, expect.any(Function));
			// Use stateManager to satisfy no-unused-vars
			expect(stateManager).toBeDefined();
		});

		it("invalidates cache when ClipUpdated fires", () => {
			const edit = createMockEdit([[{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 }]]);

			const stateManager = new TimelineStateManager(edit as never);

			// First call populates cache
			const tracks1 = stateManager.getTracks();
			expect(tracks1.length).toBe(1);

			// Verify cache is being used (same reference)
			const tracks2 = stateManager.getTracks();
			expect(tracks2).toBe(tracks1);

			// Fire ClipUpdated event
			edit.events.emit(EditEvent.ClipUpdated);

			// Cache should be invalidated - getTracks returns new array
			const tracks3 = stateManager.getTracks();
			expect(tracks3).not.toBe(tracks1);
		});

		it("invalidates cache when ClipAdded fires", () => {
			const edit = createMockEdit([[{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 }]]);

			const stateManager = new TimelineStateManager(edit as never);
			const tracks1 = stateManager.getTracks();

			edit.events.emit(EditEvent.ClipAdded);

			const tracks2 = stateManager.getTracks();
			expect(tracks2).not.toBe(tracks1);
		});

		it("invalidates cache when ClipDeleted fires", () => {
			const edit = createMockEdit([[{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 }]]);

			const stateManager = new TimelineStateManager(edit as never);
			const tracks1 = stateManager.getTracks();

			edit.events.emit(EditEvent.ClipDeleted);

			const tracks2 = stateManager.getTracks();
			expect(tracks2).not.toBe(tracks1);
		});

		it("unsubscribes from events on dispose", () => {
			const edit = createMockEdit();
			const stateManager = new TimelineStateManager(edit as never);

			stateManager.dispose();

			expect(edit.events.off).toHaveBeenCalledWith(EditEvent.ClipUpdated, expect.any(Function));
			expect(edit.events.off).toHaveBeenCalledWith(EditEvent.ClipAdded, expect.any(Function));
			expect(edit.events.off).toHaveBeenCalledWith(EditEvent.ClipDeleted, expect.any(Function));
		});
	});

	describe("pure luma lookup - findAttachedLuma", () => {
		it("returns null when track has no luma clip", () => {
			const edit = createMockEdit([[{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 }]]);

			const stateManager = new TimelineStateManager(edit as never);
			const result = stateManager.findAttachedLuma(0, 0);

			expect(result).toBeNull();
		});

		it("returns null when luma exists but timing does not match", () => {
			const edit = createMockEdit([
				[
					{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 },
					{ asset: { type: "luma", src: "luma.jpg" }, start: 0, length: 3 } // Different length
				]
			]);

			const stateManager = new TimelineStateManager(edit as never);
			const result = stateManager.findAttachedLuma(0, 0);

			expect(result).toBeNull();
		});

		it("finds luma with exact timing match on same track", () => {
			const edit = createMockEdit([
				[
					{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 },
					{ asset: { type: "luma", src: "luma.jpg" }, start: 0, length: 5 } // Same timing
				]
			]);

			const stateManager = new TimelineStateManager(edit as never);
			const result = stateManager.findAttachedLuma(0, 0);

			expect(result).toEqual({ trackIndex: 0, clipIndex: 1 });
		});

		it("returns null when querying a luma clip itself", () => {
			const edit = createMockEdit([
				[
					{ asset: { type: "luma", src: "luma.jpg" }, start: 0, length: 5 },
					{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 }
				]
			]);

			const stateManager = new TimelineStateManager(edit as never);
			const result = stateManager.findAttachedLuma(0, 0); // Query the luma clip

			expect(result).toBeNull();
		});

		it("returns null for invalid track index", () => {
			const edit = createMockEdit([[{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 }]]);

			const stateManager = new TimelineStateManager(edit as never);
			const result = stateManager.findAttachedLuma(99, 0); // Non-existent track

			expect(result).toBeNull();
		});
	});

	describe("pure luma lookup - findContentForLuma", () => {
		it("returns null when track has no content clip", () => {
			const edit = createMockEdit([[{ asset: { type: "luma", src: "luma.jpg" }, start: 0, length: 5 }]]);

			const stateManager = new TimelineStateManager(edit as never);
			const result = stateManager.findContentForLuma(0, 0);

			expect(result).toBeNull();
		});

		it("finds content clip with matching timing", () => {
			const edit = createMockEdit([
				[
					{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 },
					{ asset: { type: "luma", src: "luma.jpg" }, start: 0, length: 5 }
				]
			]);

			const stateManager = new TimelineStateManager(edit as never);
			const result = stateManager.findContentForLuma(0, 1); // Query the luma clip

			expect(result).toEqual({ trackIndex: 0, clipIndex: 0 });
		});

		it("returns null when querying a non-luma clip", () => {
			const edit = createMockEdit([
				[
					{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 },
					{ asset: { type: "video", src: "video.mp4" }, start: 5, length: 5 }
				]
			]);

			const stateManager = new TimelineStateManager(edit as never);
			const result = stateManager.findContentForLuma(0, 0); // Query image, not luma

			expect(result).toBeNull();
		});
	});

	describe("hasAttachedLuma", () => {
		it("returns true when content clip has attached luma", () => {
			const edit = createMockEdit([
				[
					{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 },
					{ asset: { type: "luma", src: "luma.jpg" }, start: 0, length: 5 }
				]
			]);

			const stateManager = new TimelineStateManager(edit as never);

			expect(stateManager.hasAttachedLuma(0, 0)).toBe(true);
		});

		it("returns false when content clip has no attached luma", () => {
			const edit = createMockEdit([[{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 }]]);

			const stateManager = new TimelineStateManager(edit as never);

			expect(stateManager.hasAttachedLuma(0, 0)).toBe(false);
		});
	});

	describe("viewport state", () => {
		it("initializes with default viewport values", () => {
			const edit = createMockEdit();
			const stateManager = new TimelineStateManager(edit as never);

			const viewport = stateManager.getViewport();

			expect(viewport.scrollX).toBe(0);
			expect(viewport.scrollY).toBe(0);
			expect(viewport.pixelsPerSecond).toBe(50);
		});

		it("accepts custom initial viewport", () => {
			const edit = createMockEdit();
			const stateManager = new TimelineStateManager(edit as never, { pixelsPerSecond: 100 });

			const viewport = stateManager.getViewport();

			expect(viewport.pixelsPerSecond).toBe(100);
		});

		it("clamps pixelsPerSecond to valid range", () => {
			const edit = createMockEdit();
			const stateManager = new TimelineStateManager(edit as never);

			stateManager.setPixelsPerSecond(5); // Below minimum
			expect(stateManager.getViewport().pixelsPerSecond).toBe(10);

			stateManager.setPixelsPerSecond(500); // Above maximum
			expect(stateManager.getViewport().pixelsPerSecond).toBe(200);
		});
	});

	describe("clip visual state", () => {
		it("returns normal as default visual state", () => {
			const edit = createMockEdit([[{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 }]]);

			const stateManager = new TimelineStateManager(edit as never);

			expect(stateManager.getClipVisualState(0, 0)).toBe("normal");
		});

		it("sets and gets clip visual state", () => {
			const edit = createMockEdit([[{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 }]]);

			const stateManager = new TimelineStateManager(edit as never);

			stateManager.setClipVisualState(0, 0, "dragging");
			expect(stateManager.getClipVisualState(0, 0)).toBe("dragging");

			stateManager.setClipVisualState(0, 0, "resizing");
			expect(stateManager.getClipVisualState(0, 0)).toBe("resizing");
		});

		it("invalidates cache when visual state changes", () => {
			const edit = createMockEdit([[{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 }]]);

			const stateManager = new TimelineStateManager(edit as never);
			const tracks1 = stateManager.getTracks();

			stateManager.setClipVisualState(0, 0, "selected");

			const tracks2 = stateManager.getTracks();
			expect(tracks2).not.toBe(tracks1);
		});

		it("clears all visual states", () => {
			const edit = createMockEdit([
				[
					{ asset: { type: "image", src: "test.jpg" }, start: 0, length: 5 },
					{ asset: { type: "video", src: "video.mp4" }, start: 5, length: 5 }
				]
			]);

			const stateManager = new TimelineStateManager(edit as never);

			stateManager.setClipVisualState(0, 0, "selected");
			stateManager.setClipVisualState(0, 1, "dragging");

			stateManager.clearVisualStates();

			expect(stateManager.getClipVisualState(0, 0)).toBe("normal");
			expect(stateManager.getClipVisualState(0, 1)).toBe("normal");
		});
	});
});

/**
 * Regression test: ClipUpdated cache invalidation
 *
 * This test specifically verifies the bug fix where:
 * 1. transformFromLuma fires ClipUpdated
 * 2. TimelineStateManager invalidates cache on ClipUpdated
 * 3. Next getTracks() returns fresh data with updated asset type
 *
 * Without this fix, the timeline would show stale luma type until
 * a second user action triggered a different cache invalidation.
 */
describe("ClipUpdated cache invalidation regression", () => {
	it("getTracks returns updated asset type after ClipUpdated fires", () => {
		// Initial state: image clip
		let currentAssetType = "image";

		const events = createMockEventEmitter();
		const edit = {
			events,
			playbackTime: 0,
			isPlaying: false,
			totalDuration: 10000,
			getResolvedEdit: jest.fn(() => ({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: currentAssetType, src: "test.jpg" }, start: 0, length: 5 }]
						}
					]
				}
			})),
			getEdit: jest.fn(() => ({
				timeline: {
					tracks: [{ clips: [{ start: 0, length: 5 }] }]
				}
			})),
			isClipSelected: jest.fn(() => false),
			selectClip: jest.fn(),
			clearSelection: jest.fn(),
			getPlayerClip: jest.fn()
		};

		const stateManager = new TimelineStateManager(edit as never);

		// Verify initial type
		const tracks1 = stateManager.getTracks();
		expect(tracks1[0].clips[0].config.asset?.type).toBe("image");

		// Simulate transformToLuma changing the type
		currentAssetType = "luma";

		// Without cache invalidation, we'd get stale data
		const tracks2 = stateManager.getTracks();
		expect(tracks2[0].clips[0].config.asset?.type).toBe("image"); // Cached!

		// Fire ClipUpdated (what transformFromLuma does after async load)
		events.emit(EditEvent.ClipUpdated);

		// Now we should get fresh data
		const tracks3 = stateManager.getTracks();
		expect(tracks3[0].clips[0].config.asset?.type).toBe("luma"); // Updated!
	});
});
