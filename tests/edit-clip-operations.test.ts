/**
 * Edit Class Clip Operations Tests
 *
 * Tests clip CRUD operations: addClip, deleteClip, updateClip, splitClip
 * These are the core editing operations that modify timeline content.
 */

import { Edit } from "@core/edit";
import { PlayerType } from "@canvas/players/player";
import type { EventEmitter } from "@core/events/event-emitter";
import type { ResolvedClip } from "@schemas/clip";

// Mock pixi-filters
jest.mock("pixi-filters", () => ({
	AdjustmentFilter: jest.fn().mockImplementation(() => ({})),
	BloomFilter: jest.fn().mockImplementation(() => ({})),
	GlowFilter: jest.fn().mockImplementation(() => ({})),
	OutlineFilter: jest.fn().mockImplementation(() => ({})),
	DropShadowFilter: jest.fn().mockImplementation(() => ({}))
}));

// Mock pixi.js
jest.mock("pixi.js", () => {
	const createMockContainer = (): Record<string, unknown> => {
		const children: unknown[] = [];
		const self = {
			children,
			sortableChildren: true,
			parent: null as unknown,
			label: null as string | null,
			zIndex: 0,
			visible: true,
			destroyed: false,
			addChild: jest.fn((child: { parent?: unknown }) => {
				children.push(child);
				if (typeof child === "object" && child !== null) {
					child.parent = self;
				}
				return child;
			}),
			removeChild: jest.fn((child: unknown) => {
				const idx = children.indexOf(child);
				if (idx !== -1) children.splice(idx, 1);
				return child;
			}),
			removeChildAt: jest.fn(),
			getChildByLabel: jest.fn(() => null),
			getChildIndex: jest.fn(() => 0),
			destroy: jest.fn(() => {
				self.destroyed = true;
			}),
			setMask: jest.fn()
		};
		return self;
	};

	const createMockGraphics = (): Record<string, unknown> => ({
		fillStyle: {},
		rect: jest.fn().mockReturnThis(),
		fill: jest.fn().mockReturnThis(),
		clear: jest.fn().mockReturnThis(),
		stroke: jest.fn().mockReturnThis(),
		strokeStyle: {},
		destroy: jest.fn()
	});

	return {
		Container: jest.fn().mockImplementation(createMockContainer),
		Graphics: jest.fn().mockImplementation(createMockGraphics),
		Sprite: jest.fn().mockImplementation(() => ({
			texture: {},
			width: 100,
			height: 100,
			parent: null,
			anchor: { set: jest.fn() },
			scale: { set: jest.fn() },
			position: { set: jest.fn() },
			destroy: jest.fn()
		})),
		Texture: { from: jest.fn() },
		Assets: { load: jest.fn().mockResolvedValue({}), unload: jest.fn() },
		ColorMatrixFilter: jest.fn(() => ({ negative: jest.fn() })),
		Rectangle: jest.fn()
	};
});

// Mock AssetLoader
jest.mock("@loaders/asset-loader", () => ({
	AssetLoader: jest.fn().mockImplementation(() => ({
		load: jest.fn().mockResolvedValue({}),
		unload: jest.fn(),
		getProgress: jest.fn().mockReturnValue(100),
		loadTracker: { on: jest.fn(), off: jest.fn() }
	}))
}));

// Mock LumaMaskController
jest.mock("@core/luma-mask-controller", () => ({
	LumaMaskController: jest.fn().mockImplementation(() => ({
		initialize: jest.fn(),
		update: jest.fn(),
		dispose: jest.fn(),
		cleanupForPlayer: jest.fn(),
		getActiveMaskCount: jest.fn().mockReturnValue(0)
	}))
}));

// Mock AlignmentGuides
jest.mock("@canvas/system/alignment-guides", () => ({
	AlignmentGuides: jest.fn().mockImplementation(() => ({
		drawCanvasGuide: jest.fn(),
		drawClipGuide: jest.fn(),
		clear: jest.fn()
	}))
}));

// Create mock container for players
const createMockPlayerContainer = () => {
	const children: unknown[] = [];
	return {
		children,
		parent: null,
		visible: true,
		zIndex: 0,
		addChild: jest.fn((child: unknown) => {
			children.push(child);
			return child;
		}),
		removeChild: jest.fn(),
		destroy: jest.fn(),
		setMask: jest.fn()
	};
};

// Mock player factory - create functional mock players
const createMockPlayer = (edit: Edit, config: ResolvedClip, type: PlayerType) => {
	const container = createMockPlayerContainer();
	const contentContainer = createMockPlayerContainer();

	const startMs = typeof config.start === "number" ? config.start * 1000 : 0;
	const lengthMs = typeof config.length === "number" ? config.length * 1000 : 3000;

	let resolvedTiming = { start: startMs, length: lengthMs };
	let timingIntent = { start: config.start, length: config.length };

	return {
		clipConfiguration: config,
		layer: 0,
		playerType: type,
		shouldDispose: false,
		getContainer: () => container,
		getContentContainer: () => contentContainer,
		getStart: () => resolvedTiming.start,
		getLength: () => resolvedTiming.length,
		getEnd: () => resolvedTiming.start + resolvedTiming.length,
		getSize: () => ({ width: 1920, height: 1080 }),
		getTimingIntent: () => ({ ...timingIntent }),
		setTimingIntent: jest.fn((intent: { start?: unknown; length?: unknown }) => {
			if (intent.start !== undefined) timingIntent.start = intent.start;
			if (intent.length !== undefined) timingIntent.length = intent.length;
		}),
		getResolvedTiming: () => ({ ...resolvedTiming }),
		setResolvedTiming: jest.fn((timing: { start: number; length: number }) => {
			resolvedTiming = { ...timing };
		}),
		load: jest.fn().mockResolvedValue(undefined),
		draw: jest.fn(),
		update: jest.fn(),
		reconfigureAfterRestore: jest.fn(),
		reloadAsset: jest.fn().mockResolvedValue(undefined),
		dispose: jest.fn(),
		isActive: () => true,
		convertToFixedTiming: jest.fn()
	};
};

// Mock all player types
jest.mock("@canvas/players/video-player", () => ({
	VideoPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Video))
}));

jest.mock("@canvas/players/image-player", () => ({
	ImagePlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Image))
}));

jest.mock("@canvas/players/text-player", () => ({
	TextPlayer: Object.assign(
		jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Text)),
		{ resetFontCache: jest.fn() }
	)
}));

jest.mock("@canvas/players/audio-player", () => ({
	AudioPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Audio))
}));

jest.mock("@canvas/players/luma-player", () => ({
	LumaPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Luma))
}));

jest.mock("@canvas/players/shape-player", () => ({
	ShapePlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Shape))
}));

jest.mock("@canvas/players/html-player", () => ({
	HtmlPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Html))
}));

jest.mock("@canvas/players/rich-text-player", () => ({
	RichTextPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.RichText))
}));

jest.mock("@canvas/players/caption-player", () => ({
	CaptionPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Caption))
}));

/**
 * Helper to access private Edit state for testing.
 */
function getEditState(edit: Edit): {
	tracks: unknown[][];
	clips: unknown[];
	originalEdit: unknown;
} {
	const anyEdit = edit as unknown as {
		tracks: unknown[][];
		clips: unknown[];
		originalEdit: unknown;
	};
	return {
		tracks: anyEdit.tracks,
		clips: anyEdit.clips,
		originalEdit: anyEdit.originalEdit
	};
}

/**
 * Create a simple video clip config for testing.
 */
function createVideoClip(start: number, length: number): ResolvedClip {
	return {
		asset: { type: "video", src: "https://example.com/video.mp4" },
		start,
		length,
		fit: "crop"
	};
}

/**
 * Create a simple image clip config for testing.
 */
function createImageClip(start: number, length: number): ResolvedClip {
	return {
		asset: { type: "image", src: "https://example.com/image.jpg" },
		start,
		length,
		fit: "crop"
	};
}

/**
 * Create a text clip config for testing.
 */
function createTextClip(start: number, length: number, text: string = "Hello"): ResolvedClip {
	return {
		asset: { type: "text", text, style: "minimal" },
		start,
		length,
		fit: "none"
	};
}

describe("Edit Clip Operations", () => {
	let edit: Edit;
	let events: EventEmitter;
	let emitSpy: jest.SpyInstance;

	beforeEach(async () => {
		edit = new Edit({ width: 1920, height: 1080 });
		await edit.load();
		events = edit.events;
		emitSpy = jest.spyOn(events, "emit");
	});

	afterEach(() => {
		edit.dispose();
		jest.clearAllMocks();
	});

	describe("addClip()", () => {
		it("adds clip to specified track", async () => {
			const clip = createVideoClip(0, 5);

			await edit.addClip(0, clip);

			const { tracks } = getEditState(edit);
			expect(tracks.length).toBeGreaterThanOrEqual(1);
			expect(tracks[0].length).toBe(1);
		});

		it("creates new track if trackIdx exceeds current tracks", async () => {
			const clip = createVideoClip(0, 5);

			await edit.addClip(2, clip); // Track index 2 when no tracks exist

			const { tracks } = getEditState(edit);
			expect(tracks.length).toBeGreaterThanOrEqual(3);
			expect(tracks[2].length).toBe(1);
		});

		it("emits timeline:updated event", async () => {
			const clip = createVideoClip(0, 5);
			emitSpy.mockClear();

			await edit.addClip(0, clip);

			expect(emitSpy).toHaveBeenCalledWith("timeline:updated", expect.anything());
		});

		it("updates totalDuration", async () => {
			expect(edit.getTotalDuration()).toBe(0);

			await edit.addClip(0, createVideoClip(0, 5));

			expect(edit.getTotalDuration()).toBe(5000); // 5 seconds in ms
		});

		it("adds multiple clips to same track", async () => {
			await edit.addClip(0, createVideoClip(0, 3));
			await edit.addClip(0, createVideoClip(3, 2));

			const { tracks } = getEditState(edit);
			expect(tracks[0].length).toBe(2);
			expect(edit.getTotalDuration()).toBe(5000);
		});

		it("is undoable - clip removed on undo", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			const { tracks: beforeUndo } = getEditState(edit);
			expect(beforeUndo[0].length).toBe(1);

			edit.undo();

			// After undo, the clip should be queued for disposal
			// The actual removal happens on next update cycle
			edit.update(0, 0);

			const { tracks: afterUndo } = getEditState(edit);
			expect(afterUndo[0]?.length ?? 0).toBe(0);
		});
	});

	describe("deleteClip()", () => {
		beforeEach(async () => {
			// Set up a track with a clip
			await edit.addClip(0, createVideoClip(0, 5));
		});

		it("removes clip from track", () => {
			const { tracks: before } = getEditState(edit);
			expect(before[0].length).toBe(1);

			edit.deleteClip(0, 0);

			const { tracks: after } = getEditState(edit);
			expect(after[0]?.length ?? 0).toBe(0);
		});

		it("emits clip:deleted event", () => {
			emitSpy.mockClear();

			edit.deleteClip(0, 0);

			expect(emitSpy).toHaveBeenCalledWith("clip:deleted", expect.anything());
		});

		it("updates totalDuration after deletion", async () => {
			await edit.addClip(0, createVideoClip(5, 3)); // Add second clip
			expect(edit.getTotalDuration()).toBe(8000);

			edit.deleteClip(0, 1); // Delete second clip

			expect(edit.getTotalDuration()).toBe(5000);
		});

		it("is undoable - clip restored on undo", async () => {
			edit.deleteClip(0, 0);

			const { tracks: afterDelete } = getEditState(edit);
			expect(afterDelete[0]?.length ?? 0).toBe(0);

			edit.undo();
			// Flush microtask queue - undo is async internally due to DeleteTrackCommand
			await Promise.resolve();

			const { tracks: afterUndo } = getEditState(edit);
			expect(afterUndo[0].length).toBe(1);
		});

		it("handles non-existent track gracefully", () => {
			expect(() => edit.deleteClip(99, 0)).not.toThrow();
		});

		it("handles non-existent clip gracefully", () => {
			expect(() => edit.deleteClip(0, 99)).not.toThrow();
		});
	});

	describe("updateClip()", () => {
		beforeEach(async () => {
			await edit.addClip(0, createTextClip(0, 5, "Original"));
		});

		it("merges partial updates with existing config", () => {
			const clipBefore = edit.getClip(0, 0);
			expect((clipBefore?.asset as { text: string }).text).toBe("Original");

			edit.updateClip(0, 0, {
				asset: { type: "text", text: "Updated", style: "minimal" }
			});

			const clipAfter = edit.getClip(0, 0);
			expect((clipAfter?.asset as { text: string }).text).toBe("Updated");
		});

		it("emits clip:updated event with previous/current", () => {
			emitSpy.mockClear();

			edit.updateClip(0, 0, {
				opacity: 0.5
			});

			expect(emitSpy).toHaveBeenCalledWith(
				"clip:updated",
				expect.objectContaining({
					previous: expect.anything(),
					current: expect.anything()
				})
			);
		});

		it("is undoable - restores original config on undo", () => {
			edit.updateClip(0, 0, {
				asset: { type: "text", text: "Changed", style: "minimal" }
			});

			const clipChanged = edit.getClip(0, 0);
			expect((clipChanged?.asset as { text: string }).text).toBe("Changed");

			edit.undo();

			const clipRestored = edit.getClip(0, 0);
			expect((clipRestored?.asset as { text: string }).text).toBe("Original");
		});

		it("handles position updates", () => {
			edit.updateClip(0, 0, {
				position: "topLeft"
			});

			const clip = edit.getClip(0, 0);
			expect(clip?.position).toBe("topLeft");
		});

		it("handles offset updates", () => {
			edit.updateClip(0, 0, {
				offset: { x: 0.1, y: -0.2 }
			});

			const clip = edit.getClip(0, 0);
			expect(clip?.offset?.x).toBe(0.1);
			expect(clip?.offset?.y).toBe(-0.2);
		});

		it("warns for non-existent clip", () => {
			const warnSpy = jest.spyOn(console, "warn").mockImplementation();

			edit.updateClip(99, 99, { opacity: 0.5 });

			expect(warnSpy).toHaveBeenCalled();
			warnSpy.mockRestore();
		});
	});

	describe("track management", () => {
		beforeEach(async () => {
			await edit.addClip(0, createVideoClip(0, 3));
			await edit.addClip(0, createImageClip(3, 2));
			await edit.addClip(1, createTextClip(0, 4, "Track 2"));
		});

		it("getClip returns correct clip configuration", () => {
			const clip = edit.getClip(0, 0);
			expect(clip?.asset?.type).toBe("video");

			const clip2 = edit.getClip(0, 1);
			expect(clip2?.asset?.type).toBe("image");

			const clip3 = edit.getClip(1, 0);
			expect(clip3?.asset?.type).toBe("text");
		});

		it("getClip returns null for invalid indices", () => {
			expect(edit.getClip(-1, 0)).toBeNull();
			expect(edit.getClip(0, -1)).toBeNull();
			expect(edit.getClip(99, 0)).toBeNull();
			expect(edit.getClip(0, 99)).toBeNull();
		});

		it("getPlayerClip returns player instance", () => {
			const player = edit.getPlayerClip(0, 0);
			expect(player).not.toBeNull();
			expect(player?.clipConfiguration.asset?.type).toBe("video");
		});

		it("getTrack returns track configuration", () => {
			const track = edit.getTrack(0);
			expect(track).not.toBeNull();
			expect(track?.clips.length).toBe(2);
		});

		it("getTrack returns null for invalid index", () => {
			expect(edit.getTrack(99)).toBeNull();
		});
	});

	describe("clip operations undo integration", () => {
		it("addClip undo removes the added clip", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			expect(edit.getClip(0, 0)).not.toBeNull();

			edit.undo();
			edit.update(0, 0); // Process disposal

			expect(edit.getClip(0, 0)).toBeNull();
		});

		it("deleteClip undo restores clip", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			edit.deleteClip(0, 0);
			expect(edit.getClip(0, 0)).toBeNull();

			edit.undo();
			// Flush microtask queue - undo is async internally due to DeleteTrackCommand
			await Promise.resolve();

			expect(edit.getClip(0, 0)).not.toBeNull();
		});

		it("updateClip undo restores original configuration", async () => {
			await edit.addClip(0, createTextClip(0, 5, "Before"));

			edit.updateClip(0, 0, {
				asset: { type: "text", text: "After", style: "minimal" }
			});
			expect((edit.getClip(0, 0)?.asset as { text: string }).text).toBe("After");

			edit.undo();

			expect((edit.getClip(0, 0)?.asset as { text: string }).text).toBe("Before");
		});

		it("multiple operations can be undone in sequence", async () => {
			await edit.addClip(0, createVideoClip(0, 3));
			await edit.addClip(0, createImageClip(3, 2));

			const { tracks: withTwo } = getEditState(edit);
			expect(withTwo[0].length).toBe(2);

			edit.undo(); // Undo second add
			edit.update(0, 0);

			const { tracks: withOne } = getEditState(edit);
			expect(withOne[0].length).toBe(1);

			edit.undo(); // Undo first add
			edit.update(0, 0);

			const { tracks: withNone } = getEditState(edit);
			expect(withNone[0]?.length ?? 0).toBe(0);
		});

		it("redo re-applies undone operations", async () => {
			await edit.addClip(0, createVideoClip(0, 5));

			edit.undo();
			edit.update(0, 0);
			expect(edit.getClip(0, 0)).toBeNull();

			edit.redo();

			expect(edit.getClip(0, 0)).not.toBeNull();
		});
	});

	describe("copy/paste operations", () => {
		beforeEach(async () => {
			await edit.addClip(0, createVideoClip(0, 5));
		});

		it("copyClip stores clip configuration", () => {
			expect(edit.hasCopiedClip()).toBe(false);

			edit.copyClip(0, 0);

			expect(edit.hasCopiedClip()).toBe(true);
		});

		it("copyClip emits clip:copied event", () => {
			emitSpy.mockClear();

			edit.copyClip(0, 0);

			expect(emitSpy).toHaveBeenCalledWith(
				"clip:copied",
				expect.objectContaining({
					trackIndex: 0,
					clipIndex: 0
				})
			);
		});

		it("pasteClip adds clip at playhead position", () => {
			edit.copyClip(0, 0);
			edit.playbackTime = 5000; // 5 seconds

			edit.pasteClip();

			const { tracks } = getEditState(edit);
			expect(tracks[0].length).toBe(2);

			// The pasted clip should start at playhead time
			const pastedClip = edit.getClip(0, 1);
			expect(pastedClip?.start).toBe(5); // 5 seconds
		});

		it("pasteClip does nothing without copied clip", () => {
			const { tracks: before } = getEditState(edit);
			const countBefore = before[0].length;

			edit.pasteClip(); // No copied clip

			const { tracks: after } = getEditState(edit);
			expect(after[0].length).toBe(countBefore);
		});
	});

	describe("selection operations", () => {
		beforeEach(async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			await edit.addClip(1, createImageClip(0, 3));
		});

		it("selectClip updates selected clip", () => {
			expect(edit.isClipSelected(0, 0)).toBe(false);

			edit.selectClip(0, 0);

			expect(edit.isClipSelected(0, 0)).toBe(true);
			expect(edit.isClipSelected(1, 0)).toBe(false);
		});

		it("selectClip deselects previous selection", () => {
			edit.selectClip(0, 0);
			expect(edit.isClipSelected(0, 0)).toBe(true);

			edit.selectClip(1, 0);

			expect(edit.isClipSelected(0, 0)).toBe(false);
			expect(edit.isClipSelected(1, 0)).toBe(true);
		});

		it("clearSelection clears selected clip", () => {
			edit.selectClip(0, 0);
			expect(edit.isClipSelected(0, 0)).toBe(true);

			edit.clearSelection();

			expect(edit.isClipSelected(0, 0)).toBe(false);
		});

		it("getSelectedClipInfo returns correct info", () => {
			expect(edit.getSelectedClipInfo()).toBeNull();

			edit.selectClip(1, 0);

			const info = edit.getSelectedClipInfo();
			expect(info).not.toBeNull();
			expect(info?.trackIndex).toBe(1);
			expect(info?.clipIndex).toBe(0);
		});
	});

	describe("duration calculations", () => {
		it("totalDuration reflects longest track", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			await edit.addClip(1, createImageClip(0, 8));

			expect(edit.getTotalDuration()).toBe(8000);
		});

		it("duration updates when clips change", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			expect(edit.getTotalDuration()).toBe(5000);

			await edit.addClip(0, createVideoClip(5, 3));
			expect(edit.getTotalDuration()).toBe(8000);

			edit.deleteClip(0, 1);
			expect(edit.getTotalDuration()).toBe(5000);
		});

		it("duration is 0 with no clips", () => {
			expect(edit.getTotalDuration()).toBe(0);
		});
	});

	describe("AddClipCommand originalEdit sync", () => {
		const baseEdit = {
			timeline: { tracks: [] },
			output: { format: "mp4" as const, fps: 25, size: { width: 1920, height: 1080 } }
		};

		it("syncs clip to originalEdit on addClip", async () => {
			// Load an initial edit so originalEdit is populated
			await edit.loadEdit(baseEdit);

			const clip = createVideoClip(0, 5);
			await edit.addClip(0, clip);

			const { originalEdit } = getEditState(edit) as {
				originalEdit: { timeline: { tracks: Array<{ clips: unknown[] }> } };
			};
			expect(originalEdit.timeline.tracks[0].clips).toHaveLength(1);
		});

		it("removes clip from originalEdit on undo", async () => {
			// Load an initial edit so originalEdit is populated
			await edit.loadEdit(baseEdit);

			const clip = createVideoClip(0, 5);
			await edit.addClip(0, clip);

			const { originalEdit: afterAdd } = getEditState(edit) as {
				originalEdit: { timeline: { tracks: Array<{ clips: unknown[] }> } };
			};
			expect(afterAdd.timeline.tracks[0].clips).toHaveLength(1);

			edit.undo();
			edit.update(0, 0); // Process disposal

			const { originalEdit: afterUndo } = getEditState(edit) as {
				originalEdit: { timeline: { tracks: Array<{ clips: unknown[] }> } };
			};
			expect(afterUndo.timeline.tracks[0].clips).toHaveLength(0);
		});

		it("syncs multiple clips to originalEdit", async () => {
			await edit.loadEdit(baseEdit);

			await edit.addClip(0, createVideoClip(0, 3));
			await edit.addClip(0, createImageClip(3, 2));

			const { originalEdit } = getEditState(edit) as {
				originalEdit: { timeline: { tracks: Array<{ clips: unknown[] }> } };
			};
			expect(originalEdit.timeline.tracks[0].clips).toHaveLength(2);
		});

		it("maintains sync with originalEdit across multiple undo operations", async () => {
			await edit.loadEdit(baseEdit);

			await edit.addClip(0, createVideoClip(0, 3));
			await edit.addClip(0, createImageClip(3, 2));

			const { originalEdit: withTwo } = getEditState(edit) as {
				originalEdit: { timeline: { tracks: Array<{ clips: unknown[] }> } };
			};
			expect(withTwo.timeline.tracks[0].clips).toHaveLength(2);

			edit.undo(); // Undo second add
			edit.update(0, 0);

			const { originalEdit: withOne } = getEditState(edit) as {
				originalEdit: { timeline: { tracks: Array<{ clips: unknown[] }> } };
			};
			expect(withOne.timeline.tracks[0].clips).toHaveLength(1);

			edit.undo(); // Undo first add
			edit.update(0, 0);

			const { originalEdit: withNone } = getEditState(edit) as {
				originalEdit: { timeline: { tracks: Array<{ clips: unknown[] }> } };
			};
			expect(withNone.timeline.tracks[0].clips).toHaveLength(0);
		});
	});

	describe("edge cases", () => {
		it("handles rapid add/delete cycles", async () => {
			for (let i = 0; i < 5; i++) {
				await edit.addClip(0, createVideoClip(i, 1));
			}

			const { tracks: withFive } = getEditState(edit);
			expect(withFive[0].length).toBe(5);

			for (let i = 4; i >= 0; i--) {
				edit.deleteClip(0, i);
			}

			const { tracks: withNone } = getEditState(edit);
			expect(withNone[0]?.length ?? 0).toBe(0);
		});

		it("handles updates to deleted clips gracefully", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			edit.deleteClip(0, 0);

			// Should not throw
			const warnSpy = jest.spyOn(console, "warn").mockImplementation();
			edit.updateClip(0, 0, { opacity: 0.5 });
			warnSpy.mockRestore();
		});

		it("maintains track integrity across operations", async () => {
			await edit.addClip(0, createVideoClip(0, 2));
			await edit.addClip(0, createImageClip(2, 2));
			await edit.addClip(0, createTextClip(4, 2, "Test"));

			// Delete middle clip
			edit.deleteClip(0, 1);

			const { tracks } = getEditState(edit);
			expect(tracks[0].length).toBe(2);

			// First clip should still be video
			expect(edit.getClip(0, 0)?.asset?.type).toBe("video");
			// Second clip should now be text (was at index 2, now at index 1)
			expect(edit.getClip(0, 1)?.asset?.type).toBe("text");
		});
	});
});
