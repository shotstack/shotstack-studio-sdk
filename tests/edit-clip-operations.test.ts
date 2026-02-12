/**
 * Edit Class Clip Operations Tests
 *
 * Tests clip CRUD operations: addClip, deleteClip, updateClip, splitClip
 * These are the core editing operations that modify timeline content.
 */

import { Edit } from "@core/edit-session";
import { PlayerType } from "@canvas/players/player";
import type { EventEmitter } from "@core/events/event-emitter";
import type { ResolvedClip } from "@schemas";
import { ms, sec } from "@core/timing/types";

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
					// eslint-disable-next-line no-param-reassign -- Intentional mock of Pixi.js Container behavior
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
		Assets: { load: jest.fn().mockResolvedValue({}), unload: jest.fn(), cache: { has: jest.fn().mockReturnValue(false) } },
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
		incrementRef: jest.fn(),
		decrementRef: jest.fn().mockReturnValue(true),
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

	// Calculate initial resolved values in SECONDS (not milliseconds)
	// The timing system now operates in seconds internally
	const startSec = typeof config.start === "number" ? config.start : 0;
	const lengthSec = typeof config.length === "number" ? config.length : 3;

	let resolvedTiming = { start: startSec, length: lengthSec };

	// Mock player object - clipId will be set by reconciler after creation
	const mockPlayer: Record<string, unknown> = {
		clipConfiguration: config,
		clipId: null as string | null,
		layer: 0,
		playerType: type,
		shouldDispose: false,
		getContainer: () => container,
		getContentContainer: () => contentContainer,
		getStart: () => resolvedTiming.start,
		getLength: () => resolvedTiming.length,
		getEnd: () => resolvedTiming.start + resolvedTiming.length,
		getSize: () => ({ width: 1920, height: 1080 }),
		// Read timing intent from document (matches real Player behavior)
		getTimingIntent: () => {
			const clipId = mockPlayer["clipId"] as string | null;
			if (clipId) {
				const docClip = edit.getDocumentClipById(clipId);
				if (docClip) {
					return {
						start: docClip.start,
						length: docClip.length
					};
				}
			}
			// Fallback: use resolved values from clipConfiguration
			return {
				start: config.start,
				length: config.length
			};
		},
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
		getExportableClip: () => {
			const exported = structuredClone(config);
			// Apply timing intent from document (matches real Player behavior)
			const intent = (mockPlayer["getTimingIntent"] as () => { start: unknown; length: unknown })();
			(exported as { start: unknown }).start = intent.start;
			(exported as { length: unknown }).length = intent.length;
			return exported;
		}
	};

	return mockPlayer;
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
		id: crypto.randomUUID(),
		asset: { type: "video", src: "https://example.com/video.mp4", transcode: false },
		start: sec(start),
		length: sec(length),
		fit: "crop"
	};
}

/**
 * Create a simple image clip config for testing.
 */
function createImageClip(start: number, length: number): ResolvedClip {
	return {
		id: crypto.randomUUID(),
		asset: { type: "image", src: "https://example.com/image.jpg" },
		start: sec(start),
		length: sec(length),
		fit: "crop"
	};
}

/**
 * Create a text clip config for testing.
 */
function createTextClip(start: number, length: number, text: string = "Hello"): ResolvedClip {
	return {
		id: crypto.randomUUID(),
		asset: { type: "text", text },
		start: sec(start),
		length: sec(length),
		fit: "none"
	};
}

describe("Edit Clip Operations", () => {
	let edit: Edit;
	let events: EventEmitter;
	let emitSpy: jest.SpyInstance;

	beforeEach(async () => {
		edit = new Edit({
			timeline: {
				tracks: [{ clips: [{ asset: { type: "image", src: "https://example.com/image.jpg" }, start: 0, length: 1 }] }]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();

		// Delete the initial minimal clip so tests start with a clean slate
		// Schema validation happens at load time; runtime state can be empty
		edit.deleteClip(0, 0);

		events = edit.getInternalEvents();
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

		it("emits clip:added event", async () => {
			const clip = createVideoClip(0, 5);
			emitSpy.mockClear();

			await edit.addClip(0, clip);

			expect(emitSpy).toHaveBeenCalledWith("clip:added", expect.anything());
		});

		it("updates totalDuration", async () => {
			expect(edit.totalDuration).toBe(0);

			await edit.addClip(0, createVideoClip(0, 5));

			expect(edit.totalDuration).toBe(5); // 5 seconds
		});

		it("adds multiple clips to same track", async () => {
			await edit.addClip(0, createVideoClip(0, 3));
			await edit.addClip(0, createVideoClip(3, 2));

			const { tracks } = getEditState(edit);
			expect(tracks[0].length).toBe(2);
			expect(edit.totalDuration).toBe(5);
		});

		it("is undoable - clip removed on undo", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			const { tracks: beforeUndo } = getEditState(edit);
			expect(beforeUndo[0].length).toBe(1);

			await edit.undo();

			// After undo, the clip should be queued for disposal
			// The actual removal happens on next update cycle
			edit.update(0, ms(0));

			const { tracks: afterUndo } = getEditState(edit);
			expect(afterUndo[0]?.length ?? 0).toBe(0);
		});
	});

	describe("deleteClip()", () => {
		beforeEach(async () => {
			// Set up a track with a clip
			await edit.addClip(0, createVideoClip(0, 5));
		});

		it("removes clip from track", async () => {
			const { tracks: before } = getEditState(edit);
			expect(before[0].length).toBe(1);

			edit.deleteClip(0, 0);

			const { tracks: after } = getEditState(edit);
			expect(after[0]?.length ?? 0).toBe(0);
		});

		it("emits clip:deleted event", async () => {
			emitSpy.mockClear();

			edit.deleteClip(0, 0);

			expect(emitSpy).toHaveBeenCalledWith("clip:deleted", expect.anything());
		});

		it("updates totalDuration after deletion", async () => {
			await edit.addClip(0, createVideoClip(5, 3)); // Add second clip
			expect(edit.totalDuration).toBe(8);

			edit.deleteClip(0, 1); // Delete second clip

			expect(edit.totalDuration).toBe(5);
		});

		it("is undoable - clip restored on undo", async () => {
			edit.deleteClip(0, 0);

			const { tracks: afterDelete } = getEditState(edit);
			expect(afterDelete[0]?.length ?? 0).toBe(0);

			await edit.undo();
			// Flush microtask queue - undo is async internally due to DeleteTrackCommand
			await Promise.resolve();

			const { tracks: afterUndo } = getEditState(edit);
			expect(afterUndo[0].length).toBe(1);
		});

		it("handles non-existent track gracefully", async () => {
			expect(() => edit.deleteClip(99, 0)).not.toThrow();
		});

		it("handles non-existent clip gracefully", async () => {
			expect(() => edit.deleteClip(0, 99)).not.toThrow();
		});
	});

	describe("updateClip()", () => {
		beforeEach(async () => {
			await edit.addClip(0, createTextClip(0, 5, "Original"));
		});

		it("merges partial updates with existing config", async () => {
			const clipBefore = edit.getClip(0, 0);
			expect((clipBefore?.asset as { text: string }).text).toBe("Original");

			edit.updateClip(0, 0, {
				asset: { type: "text", text: "Updated" }
			});

			const clipAfter = edit.getClip(0, 0);
			expect((clipAfter?.asset as { text: string }).text).toBe("Updated");
		});

		it("emits clip:updated event with previous/current", async () => {
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

		it("is undoable - restores original config on undo", async () => {
			edit.updateClip(0, 0, {
				asset: { type: "text", text: "Changed" }
			});

			const clipChanged = edit.getClip(0, 0);
			expect((clipChanged?.asset as { text: string }).text).toBe("Changed");

			await edit.undo();

			const clipRestored = edit.getClip(0, 0);
			expect((clipRestored?.asset as { text: string }).text).toBe("Original");
		});

		it("handles position updates", async () => {
			edit.updateClip(0, 0, {
				position: "topLeft"
			});

			const clip = edit.getClip(0, 0);
			expect(clip?.position).toBe("topLeft");
		});

		it("handles offset updates", async () => {
			edit.updateClip(0, 0, {
				offset: { x: 0.1, y: -0.2 }
			});

			const clip = edit.getClip(0, 0);
			expect(clip?.offset?.x).toBe(0.1);
			expect(clip?.offset?.y).toBe(-0.2);
		});

		it("warns for non-existent clip", async () => {
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

		it("getClip returns correct clip configuration", async () => {
			const clip = edit.getClip(0, 0);
			expect(clip?.asset?.type).toBe("video");

			const clip2 = edit.getClip(0, 1);
			expect(clip2?.asset?.type).toBe("image");

			const clip3 = edit.getClip(1, 0);
			expect(clip3?.asset?.type).toBe("text");
		});

		it("getClip returns null for invalid indices", async () => {
			expect(edit.getClip(-1, 0)).toBeNull();
			expect(edit.getClip(0, -1)).toBeNull();
			expect(edit.getClip(99, 0)).toBeNull();
			expect(edit.getClip(0, 99)).toBeNull();
		});

		it("getPlayerClip returns player instance", async () => {
			const player = edit.getPlayerClip(0, 0);
			expect(player).not.toBeNull();
			expect(player?.clipConfiguration.asset?.type).toBe("video");
		});

		it("getTrack returns track configuration", async () => {
			const track = edit.getTrack(0);
			expect(track).not.toBeNull();
			expect(track?.clips.length).toBe(2);
		});

		it("getTrack returns null for invalid index", async () => {
			expect(edit.getTrack(99)).toBeNull();
		});
	});

	describe("clip operations undo integration", () => {
		it("addClip undo removes the added clip", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			expect(edit.getClip(0, 0)).not.toBeNull();

			await edit.undo();
			edit.update(0, ms(0)); // Process disposal

			expect(edit.getClip(0, 0)).toBeNull();
		});

		it("deleteClip undo restores clip", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			edit.deleteClip(0, 0);
			expect(edit.getClip(0, 0)).toBeNull();

			await edit.undo();
			// Flush microtask queue - undo is async internally due to DeleteTrackCommand
			await Promise.resolve();

			expect(edit.getClip(0, 0)).not.toBeNull();
		});

		it("updateClip undo restores original configuration", async () => {
			await edit.addClip(0, createTextClip(0, 5, "Before"));

			edit.updateClip(0, 0, {
				asset: { type: "text", text: "After" }
			});
			expect((edit.getClip(0, 0)?.asset as { text: string }).text).toBe("After");

			await edit.undo();

			expect((edit.getClip(0, 0)?.asset as { text: string }).text).toBe("Before");
		});

		it("multiple operations can be undone in sequence", async () => {
			await edit.addClip(0, createVideoClip(0, 3));
			await edit.addClip(0, createImageClip(3, 2));

			const { tracks: withTwo } = getEditState(edit);
			expect(withTwo[0].length).toBe(2);

			await edit.undo(); // Undo second add
			edit.update(0, ms(0));

			const { tracks: withOne } = getEditState(edit);
			expect(withOne[0].length).toBe(1);

			await edit.undo(); // Undo first add
			edit.update(0, ms(0));

			const { tracks: withNone } = getEditState(edit);
			expect(withNone[0]?.length ?? 0).toBe(0);
		});

		it("redo re-applies undone operations", async () => {
			await edit.addClip(0, createVideoClip(0, 5));

			await edit.undo();
			edit.update(0, ms(0));
			expect(edit.getClip(0, 0)).toBeNull();

			await edit.redo();

			expect(edit.getClip(0, 0)).not.toBeNull();
		});
	});

	describe("copy/paste operations", () => {
		beforeEach(async () => {
			await edit.addClip(0, createVideoClip(0, 5));
		});

		it("copyClip stores clip configuration", async () => {
			expect(edit.hasCopiedClip()).toBe(false);

			edit.copyClip(0, 0);

			expect(edit.hasCopiedClip()).toBe(true);
		});

		it("copyClip emits clip:copied event", async () => {
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

		it("pasteClip adds clip at playhead position", async () => {
			edit.copyClip(0, 0);
			edit.playbackTime = sec(5); // 5 seconds

			await edit.pasteClip();

			const { tracks } = getEditState(edit);
			expect(tracks[0].length).toBe(2);

			// The pasted clip should start at playhead time
			const pastedClip = edit.getClip(0, 1);
			expect(pastedClip?.start).toBe(5); // 5 seconds
		});

		it("pasteClip does nothing without copied clip", async () => {
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

		it("selectClip updates selected clip", async () => {
			expect(edit.isClipSelected(0, 0)).toBe(false);

			edit.selectClip(0, 0);

			expect(edit.isClipSelected(0, 0)).toBe(true);
			expect(edit.isClipSelected(1, 0)).toBe(false);
		});

		it("selectClip deselects previous selection", async () => {
			edit.selectClip(0, 0);
			expect(edit.isClipSelected(0, 0)).toBe(true);

			edit.selectClip(1, 0);

			expect(edit.isClipSelected(0, 0)).toBe(false);
			expect(edit.isClipSelected(1, 0)).toBe(true);
		});

		it("clearSelection clears selected clip", async () => {
			edit.selectClip(0, 0);
			expect(edit.isClipSelected(0, 0)).toBe(true);

			edit.clearSelection();

			expect(edit.isClipSelected(0, 0)).toBe(false);
		});

		it("getSelectedClipInfo returns correct info", async () => {
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

			expect(edit.totalDuration).toBe(8);
		});

		it("duration updates when clips change", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			expect(edit.totalDuration).toBe(5);

			await edit.addClip(0, createVideoClip(5, 3));
			expect(edit.totalDuration).toBe(8);

			edit.deleteClip(0, 1);
			expect(edit.totalDuration).toBe(5);
		});

		it("duration is 0 with no clips", async () => {
			expect(edit.totalDuration).toBe(0);
		});
	});

	describe("AddClipCommand export state sync", () => {
		// Note: The tests below call loadEdit which starts with this clip,
		// then add more clips on top. Test assertions account for this.
		const baseEdit = {
			timeline: {
				tracks: [{ clips: [{ asset: { type: "image", src: "https://example.com/base.jpg" }, start: 0, length: 1 }] }] as { clips: ResolvedClip[] }[]
			},
			output: { format: "mp4" as const, fps: 25 as const, size: { width: 1920, height: 1080 } }
		};

		it("tracks clip state after addClip", async () => {
			// Load an initial edit (has 1 base image clip)
			await edit.loadEdit(baseEdit);

			const clip = createVideoClip(1, 5); // Start after base clip
			await edit.addClip(0, clip);

			// Verify added clip is tracked (appended at index 1)
			const player = edit.getPlayerClip(0, 1);
			expect(player).not.toBeNull();
			expect(player?.clipConfiguration.asset?.type).toBe("video");
		});

		it("removes clip state on undo", async () => {
			// Load an initial edit (has 1 base image clip)
			await edit.loadEdit(baseEdit);

			const clip = createVideoClip(1, 5);
			await edit.addClip(0, clip);

			// Verify added clip exists (appended at index 1)
			expect(edit.getPlayerClip(0, 1)).not.toBeNull();

			await edit.undo();
			edit.update(0, ms(0)); // Process disposal

			// Verify added clip is removed (base clip still at index 0)
			expect(edit.getPlayerClip(0, 1)).toBeNull();
			// Base clip should still exist
			expect(edit.getPlayerClip(0, 0)).not.toBeNull();
		});

		it("tracks multiple clips after addClip", async () => {
			await edit.loadEdit(baseEdit); // 1 base clip

			await edit.addClip(0, createVideoClip(1, 3));
			await edit.addClip(0, createImageClip(4, 2));

			// Verify all 3 clips are tracked (1 base + 2 added)
			const { tracks } = getEditState(edit);
			expect(tracks[0]).toHaveLength(3);
		});

		it("maintains state across multiple undo operations", async () => {
			await edit.loadEdit(baseEdit); // 1 base clip

			await edit.addClip(0, createVideoClip(1, 3));
			await edit.addClip(0, createImageClip(4, 2));

			const { tracks: withThree } = getEditState(edit);
			expect(withThree[0]).toHaveLength(3); // 1 base + 2 added

			await edit.undo(); // Undo second add
			edit.update(0, ms(0));

			const { tracks: withTwo } = getEditState(edit);
			expect(withTwo[0]).toHaveLength(2); // 1 base + 1 added

			await edit.undo(); // Undo first add
			edit.update(0, ms(0));

			const { tracks: withOne } = getEditState(edit);
			expect(withOne[0]).toHaveLength(1); // Just base clip
		});
	});

	describe("edge cases", () => {
		it("handles rapid add/delete cycles", async () => {
			for (let i = 0; i < 5; i += 1) {
				await edit.addClip(0, createVideoClip(i, 1)); // eslint-disable-line no-await-in-loop -- Sequential adds are intentional for this test
			}

			const { tracks: withFive } = getEditState(edit);
			expect(withFive[0].length).toBe(5);

			for (let i = 4; i >= 0; i -= 1) {
				await edit.deleteClip(0, i); // eslint-disable-line no-await-in-loop -- Sequential deletes are intentional for this test
			}

			const { tracks: withNone } = getEditState(edit);
			expect(withNone[0]?.length ?? 0).toBe(0);
		});

		it("handles updates to deleted clips gracefully", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			await edit.deleteClip(0, 0);

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
