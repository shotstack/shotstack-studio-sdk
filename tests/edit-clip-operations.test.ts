/**
 * Edit Class Clip Operations Tests
 *
 * Tests clip CRUD operations: addClip, deleteClip, updateClip, addSvgClip
 * These are the core editing operations that modify timeline content.
 */

import { Edit } from "@core/edit-session";
import { PlayerType } from "@canvas/players/player";
import type { EventEmitter } from "@core/events/event-emitter";
import type { Clip, ResolvedClip } from "@schemas";
import { ms, sec } from "@core/timing/types";

// Stub the DOM-dependent svg-clipboard helpers — sanitisation is unit-tested
// in svg-clipboard.test.ts. Here we verify addSvgClip's orchestration: clip
// shape, fit default, dispatch through insertClipWithOverlapPolicy.
// (jest.mock is hoisted by ts-jest, so placement after imports is fine.)
jest.mock("@core/clipboard/svg-clipboard", () => ({
	sanitiseSvg: jest.fn((markup: string) => markup.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "")),
	parseSvgIntrinsicSize: jest.fn((markup: string) => {
		const w = markup.match(/\bwidth="(\d+)/i);
		const h = markup.match(/\bheight="(\d+)/i);
		return { width: w ? Number(w[1]) : undefined, height: h ? Number(h[1]) : undefined };
	}),
	readSvgFromClipboard: jest.fn().mockResolvedValue(null)
}));

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

jest.mock("@canvas/players/svg-player", () => ({
	SvgPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Svg))
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
function createVideoClip(start: number, length: number): Clip {
	return {
		asset: { type: "video", src: "https://example.com/video.mp4", transcode: false },
		start,
		length,
		fit: "crop"
	};
}

/**
 * Create a simple image clip config for testing.
 */
function createImageClip(start: number, length: number): Clip {
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
function createTextClip(start: number, length: number, text: string = "Hello"): Clip {
	return {
		asset: { type: "text", text },
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
		edit = new Edit({
			timeline: {
				tracks: [{ clips: [{ asset: { type: "image", src: "https://example.com/image.jpg" }, start: 0, length: 1 }] }]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();

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
			expect(tracks[0].length).toBe(2);
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
			expect(edit.totalDuration).toBe(1);

			await edit.addClip(0, createVideoClip(0, 5));

			expect(edit.totalDuration).toBe(5); // 5 seconds
		});

		it("adds multiple clips to same track", async () => {
			await edit.addClip(0, createVideoClip(0, 3));
			await edit.addClip(0, createVideoClip(3, 2));

			const { tracks } = getEditState(edit);
			expect(tracks[0].length).toBe(3);
			expect(edit.totalDuration).toBe(5);
		});

		it("is undoable - clip removed on undo", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			const { tracks: beforeUndo } = getEditState(edit);
			expect(beforeUndo[0].length).toBe(2);

			await edit.undo();

			// After undo, the clip should be queued for disposal
			// The actual removal happens on next update cycle
			edit.update(0, ms(0));

			const { tracks: afterUndo } = getEditState(edit);
			expect(afterUndo[0]?.length ?? 0).toBe(1);
		});
	});

	describe("deleteClip()", () => {
		beforeEach(async () => {
			// Set up a track with a clip
			await edit.addClip(0, createVideoClip(0, 5));
		});

		it("removes clip from track", async () => {
			const { tracks: before } = getEditState(edit);
			expect(before[0].length).toBe(2);

			edit.deleteClip(0, 0);

			const { tracks: after } = getEditState(edit);
			expect(after[0].length).toBe(1);
		});

		it("emits clip:deleted event", async () => {
			emitSpy.mockClear();

			edit.deleteClip(0, 0);

			expect(emitSpy).toHaveBeenCalledWith("clip:deleted", expect.anything());
		});

		it("updates totalDuration after deletion", async () => {
			await edit.addClip(0, createVideoClip(5, 3)); // Add third clip
			expect(edit.totalDuration).toBe(8);

			edit.deleteClip(0, 2); // Delete third clip (video 5-8s)

			expect(edit.totalDuration).toBe(5);
		});

		it("is undoable - clip restored on undo", async () => {
			edit.deleteClip(0, 0);

			const { tracks: afterDelete } = getEditState(edit);
			expect(afterDelete[0].length).toBe(1);

			await edit.undo();
			// Flush microtask queue - undo is async internally due to DeleteTrackCommand
			await Promise.resolve();

			const { tracks: afterUndo } = getEditState(edit);
			expect(afterUndo[0].length).toBe(2);
		});

		it("prevents deletion of the last clip in the document", async () => {
			// Inner beforeEach added a video clip, so we have 2 clips.
			// Delete the video to leave only the initial image clip.
			edit.deleteClip(0, 1);

			const { tracks: before } = getEditState(edit);
			expect(before[0].length).toBe(1);

			// Attempt to delete the last remaining clip — should be prevented
			edit.deleteClip(0, 0);

			const { tracks: after } = getEditState(edit);
			expect(after[0].length).toBe(1);
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
			const clipBefore = edit.getClip(0, 1);
			expect((clipBefore?.asset as { text: string }).text).toBe("Original");

			edit.updateClip(0, 1, {
				asset: { type: "text", text: "Updated" }
			});

			const clipAfter = edit.getClip(0, 1);
			expect((clipAfter?.asset as { text: string }).text).toBe("Updated");
		});

		it("emits clip:updated event with previous/current", async () => {
			emitSpy.mockClear();

			edit.updateClip(0, 1, {
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
			edit.updateClip(0, 1, {
				asset: { type: "text", text: "Changed" }
			});

			const clipChanged = edit.getClip(0, 1);
			expect((clipChanged?.asset as { text: string }).text).toBe("Changed");

			await edit.undo();

			const clipRestored = edit.getClip(0, 1);
			expect((clipRestored?.asset as { text: string }).text).toBe("Original");
		});

		it("handles position updates", async () => {
			edit.updateClip(0, 1, {
				position: "topLeft"
			});

			const clip = edit.getClip(0, 1);
			expect(clip?.position).toBe("topLeft");
		});

		it("handles offset updates", async () => {
			edit.updateClip(0, 1, {
				offset: { x: 0.1, y: -0.2 }
			});

			const clip = edit.getClip(0, 1);
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
			const clip = edit.getClip(0, 1);
			expect(clip?.asset?.type).toBe("video");

			const clip2 = edit.getClip(0, 2);
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
			const player = edit.getPlayerClip(0, 1);
			expect(player).not.toBeNull();
			expect(player?.clipConfiguration.asset?.type).toBe("video");
		});

		it("getTrack returns track configuration", async () => {
			const track = edit.getTrack(0);
			expect(track).not.toBeNull();
			expect(track?.clips.length).toBe(3);
		});

		it("getTrack returns null for invalid index", async () => {
			expect(edit.getTrack(99)).toBeNull();
		});
	});

	describe("clip operations undo integration", () => {
		it("addClip undo removes the added clip", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			expect(edit.getClip(0, 1)).not.toBeNull();

			await edit.undo();
			edit.update(0, ms(0)); // Process disposal

			expect(edit.getClip(0, 1)).toBeNull();
		});

		it("deleteClip undo restores clip", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			edit.deleteClip(0, 1);
			expect(edit.getClip(0, 1)).toBeNull();

			await edit.undo();
			// Flush microtask queue - undo is async internally due to DeleteTrackCommand
			await Promise.resolve();

			expect(edit.getClip(0, 1)).not.toBeNull();
		});

		it("updateClip undo restores original configuration", async () => {
			await edit.addClip(0, createTextClip(0, 5, "Before"));

			edit.updateClip(0, 1, {
				asset: { type: "text", text: "After" }
			});
			expect((edit.getClip(0, 1)?.asset as { text: string }).text).toBe("After");

			await edit.undo();

			expect((edit.getClip(0, 1)?.asset as { text: string }).text).toBe("Before");
		});

		it("multiple operations can be undone in sequence", async () => {
			await edit.addClip(0, createVideoClip(0, 3));
			await edit.addClip(0, createImageClip(3, 2));

			const { tracks: withThree } = getEditState(edit);
			expect(withThree[0].length).toBe(3);

			await edit.undo(); // Undo second add
			edit.update(0, ms(0));

			const { tracks: withTwo } = getEditState(edit);
			expect(withTwo[0].length).toBe(2);

			await edit.undo(); // Undo first add
			edit.update(0, ms(0));

			const { tracks: withOne } = getEditState(edit);
			expect(withOne[0].length).toBe(1);
		});

		it("redo re-applies undone operations", async () => {
			await edit.addClip(0, createVideoClip(0, 5));

			await edit.undo();
			edit.update(0, ms(0));
			expect(edit.getClip(0, 1)).toBeNull();

			await edit.redo();

			expect(edit.getClip(0, 1)).not.toBeNull();
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
			expect(tracks[0].length).toBe(3);

			// The pasted clip should start at playhead time
			const pastedClip = edit.getClip(0, 2);
			expect(pastedClip?.start).toBe(5); // 5 seconds
		});

		it("pasteClip does nothing without copied clip", async () => {
			const { tracks: before } = getEditState(edit);
			const countBefore = before[0].length;

			edit.pasteClip(); // No copied clip

			const { tracks: after } = getEditState(edit);
			expect(after[0].length).toBe(countBefore);
		});

		it("pasteClip lands on a new top track when paste would overlap on the source track", async () => {
			edit.copyClip(0, 0);
			edit.playbackTime = sec(2); // overlaps with the video clip at 0-5

			const { tracks: before } = getEditState(edit);
			const trackCountBefore = before.length;
			const sourceCountBefore = before[0].length;

			await edit.pasteClip();

			const { tracks: after } = getEditState(edit);
			// New track inserted at the top (index 0); original tracks shift down.
			expect(after.length).toBe(trackCountBefore + 1);
			// New top track holds only the pasted clip.
			expect(after[0].length).toBe(1);
			// Original track is now at index 1, untouched.
			expect(after[1].length).toBe(sourceCountBefore);
		});

		it("undoing a paste that created a new track reverses both as one atomic step", async () => {
			edit.copyClip(0, 0);
			edit.playbackTime = sec(2); // forces overlap → insert-track path

			const { tracks: beforePaste } = getEditState(edit);
			const trackCountBeforePaste = beforePaste.length;

			await edit.pasteClip();
			expect(getEditState(edit).tracks.length).toBe(trackCountBeforePaste + 1);

			// Single undo should reverse both the track creation and the clip add.
			await edit.undo();

			const { tracks: afterUndo } = getEditState(edit);
			expect(afterUndo.length).toBe(trackCountBeforePaste);
			expect(afterUndo[0].length).toBe(beforePaste[0].length);
		});

		it("undoing a paste clears the selection if the pasted clip was selected", async () => {
			edit.copyClip(0, 0);
			edit.playbackTime = sec(5); // non-overlap path; pastes onto same track
			await edit.pasteClip();

			const pastedIdx = getEditState(edit).tracks[0].length - 1;
			edit.selectClip(0, pastedIdx);
			expect(edit.isClipSelected(0, pastedIdx)).toBe(true);

			await edit.undo();

			// Without the fix, selection would still reference the disposed player
			// and the canvas selection handles would linger over the gone clip.
			expect(edit.getSelectedClipInfo()).toBeNull();
		});

		it("pasteClip stays on the source track when there is no overlap", async () => {
			edit.copyClip(0, 0);
			edit.playbackTime = sec(5); // touches end of original; non-overlapping

			const { tracks: before } = getEditState(edit);
			const trackCountBefore = before.length;
			const sourceCountBefore = before[0].length;

			await edit.pasteClip();

			const { tracks: after } = getEditState(edit);
			expect(after.length).toBe(trackCountBefore);
			expect(after[0].length).toBe(sourceCountBefore + 1);
		});
	});

	describe("addSvgClip()", () => {
		const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 16 16"><path d="M0 0L16 16"/></svg>';

		it("inserts an svg-typed clip at the playhead with fit:contain by default", async () => {
			edit.playbackTime = sec(3);
			await edit.addSvgClip(ICON_SVG);

			const clip = edit.getClip(0, edit.getTracks()[0].length - 1);
			expect(clip?.asset?.type).toBe("svg");
			expect(clip?.fit).toBe("contain");
			expect(clip?.start).toBe(3);
			expect(clip?.length).toBe(5);
		});

		it("populates clip width/height from the SVG's intrinsic dimensions", async () => {
			await edit.addSvgClip(ICON_SVG);

			const clip = edit.getClip(0, edit.getTracks()[0].length - 1);
			expect(clip?.width).toBe(100);
			expect(clip?.height).toBe(100);
		});

		it("strips <script> elements from the SVG before insertion", async () => {
			const dirty = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect/></svg>';
			await edit.addSvgClip(dirty);

			const clip = edit.getClip(0, edit.getTracks()[0].length - 1);
			const src = (clip?.asset as { src?: string } | undefined)?.src ?? "";
			expect(src).not.toMatch(/<script/i);
			expect(src).toMatch(/<rect/);
		});

		it("strips on* event-handler attributes from the SVG before insertion", async () => {
			const dirty = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><rect onclick="evil()"/></svg>';
			await edit.addSvgClip(dirty);

			const clip = edit.getClip(0, edit.getTracks()[0].length - 1);
			const src = (clip?.asset as { src?: string } | undefined)?.src ?? "";
			expect(src).not.toMatch(/onload=/i);
			expect(src).not.toMatch(/onclick=/i);
		});

		it("honours opts.trackIndex, opts.start, and opts.length overrides", async () => {
			await edit.addSvgClip(ICON_SVG, {
				trackIndex: 1,
				start: sec(7),
				length: sec(2)
			});

			const tracks = edit.getTracks();
			expect(tracks.length).toBeGreaterThanOrEqual(2);
			const clip = edit.getClip(1, tracks[1].length - 1);
			expect(clip?.start).toBe(7);
			expect(clip?.length).toBe(2);
		});

		it("falls back to a new top track when the playhead-time range overlaps an existing clip", async () => {
			await edit.addClip(0, createVideoClip(0, 10));

			const trackCountBefore = edit.getTracks().length;
			edit.playbackTime = sec(2); // overlaps with [0, 10]

			await edit.addSvgClip(ICON_SVG);

			const after = edit.getTracks();
			expect(after.length).toBe(trackCountBefore + 1);
			// New top track holds the SVG; original track shifted down.
			expect(after[0].length).toBe(1);
		});

		it("undoing an SVG paste that created a new track reverses both as one atomic step", async () => {
			await edit.addClip(0, createVideoClip(0, 10));
			edit.playbackTime = sec(2); // forces overlap → insert-track path

			const trackCountBefore = edit.getTracks().length;
			await edit.addSvgClip(ICON_SVG);
			expect(edit.getTracks().length).toBe(trackCountBefore + 1);

			await edit.undo();

			expect(edit.getTracks().length).toBe(trackCountBefore);
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

			edit.deleteClip(0, 2); // Delete longest clip (video 5-8s)
			expect(edit.totalDuration).toBe(5);
		});

		it("duration reflects initial clip", async () => {
			expect(edit.totalDuration).toBe(1);
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

			const { tracks: withSix } = getEditState(edit);
			expect(withSix[0].length).toBe(6);

			for (let i = 4; i >= 0; i -= 1) {
				await edit.deleteClip(0, i); // eslint-disable-line no-await-in-loop -- Sequential deletes are intentional for this test
			}

			// One clip remains (guard prevents deleting last clip)
			const { tracks: withOne } = getEditState(edit);
			expect(withOne[0].length).toBe(1);
		});

		it("handles updates to deleted clips gracefully", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			edit.deleteClip(0, 1);

			// Should not throw when updating a non-existent clip index
			const warnSpy = jest.spyOn(console, "warn").mockImplementation();
			edit.updateClip(0, 1, { opacity: 0.5 });
			warnSpy.mockRestore();
		});

		it("maintains track integrity across operations", async () => {
			await edit.addClip(0, createVideoClip(0, 2));
			await edit.addClip(0, createImageClip(2, 2));
			await edit.addClip(0, createTextClip(4, 2, "Test"));

			// Delete middle added clip (image at index 2)
			edit.deleteClip(0, 2);

			const { tracks } = getEditState(edit);
			expect(tracks[0].length).toBe(3);

			// Initial image clip at index 0
			expect(edit.getClip(0, 0)?.asset?.type).toBe("image");
			// Added video clip at index 1
			expect(edit.getClip(0, 1)?.asset?.type).toBe("video");
			// Text clip shifted from index 3 to index 2
			expect(edit.getClip(0, 2)?.asset?.type).toBe("text");
		});
	});
});
