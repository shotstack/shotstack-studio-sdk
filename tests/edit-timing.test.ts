/**
 * Edit Class Timing Resolution Tests
 *
 * Tests the timing system that resolves "auto" and "end" values to numeric milliseconds.
 * Covers pure resolver functions and Edit class integration for propagation.
 */

import { Edit } from "@core/edit";
import { PlayerType } from "@canvas/players/player";
import type { EventEmitter } from "@core/events/event-emitter";
import type { ResolvedClip } from "@schemas/clip";
import { resolveAutoStart, resolveAutoLength, resolveEndLength, calculateTimelineEnd } from "@core/timing/resolver";
import { ms } from "@core/timing/types";

// Mock probeMediaDuration since document.createElement doesn't work in Node
jest.mock("@core/timing/resolver", () => ({
	...jest.requireActual("@core/timing/resolver"),
	probeMediaDuration: jest.fn().mockResolvedValue(5.0) // 5 seconds
}));

// Mock pixi-filters (must be before pixi.js since it extends pixi classes)
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

// Mock player factory with timing intent support
const createMockPlayer = (edit: Edit, config: ResolvedClip, type: PlayerType) => {
	const container = createMockPlayerContainer();
	const contentContainer = createMockPlayerContainer();

	// Parse timing intent from config
	const startIntent = config.start;
	const lengthIntent = config.length;

	// Calculate initial resolved values
	const startMs = typeof startIntent === "number" ? startIntent * 1000 : 0;
	const lengthMs = typeof lengthIntent === "number" ? lengthIntent * 1000 : 3000;

	let resolvedTiming = { start: startMs, length: lengthMs };
	const timingIntent: { start: number | string; length: number | string } = { start: startIntent, length: lengthIntent };

	// Merge field bindings support
	const mergeFieldBindings = new Map<string, { placeholder: string; resolvedValue: string }>();

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
		setTimingIntent: jest.fn((intent: { start?: number | string; length?: number | string }) => {
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
		convertToFixedTiming: jest.fn(),
		// Merge field binding methods
		getMergeFieldBindings: () => mergeFieldBindings,
		getMergeFieldBinding: (path: string) => mergeFieldBindings.get(path),
		setMergeFieldBinding: (path: string, binding: { placeholder: string; resolvedValue: string }) => {
			mergeFieldBindings.set(path, binding);
		},
		removeMergeFieldBinding: (path: string) => {
			mergeFieldBindings.delete(path);
		},
		setInitialBindings: (bindings: Map<string, { placeholder: string; resolvedValue: string }>) => {
			mergeFieldBindings.clear();
			bindings.forEach((v, k) => {
				mergeFieldBindings.set(k, v);
			});
		},
		getExportableClip: () => {
			const exported = structuredClone(config);
			// Apply timing intent (cast needed as timingIntent can be string for "auto")
			if (timingIntent.start !== undefined) exported.start = timingIntent.start as number;
			if (timingIntent.length !== undefined) exported.length = timingIntent.length as number;
			return exported;
		}
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

jest.mock("@canvas/players/html-player", () => ({
	HtmlPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Html))
}));

jest.mock("@canvas/players/luma-player", () => ({
	LumaPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Luma))
}));

jest.mock("@canvas/players/shape-player", () => ({
	ShapePlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Shape))
}));

jest.mock("@canvas/players/caption-player", () => ({
	CaptionPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Caption))
}));

/**
 * Create a mock player-like object for unit testing resolver functions.
 */
function createMockPlayerForResolver(startMs: number, lengthMs: number, lengthIntent: number | "auto" | "end" = lengthMs / 1000) {
	return {
		getStart: () => startMs,
		getLength: () => lengthMs,
		getEnd: () => startMs + lengthMs,
		getTimingIntent: () => ({ start: startMs / 1000, length: lengthIntent })
	};
}

/**
 * Helper to access private Edit state.
 */
function getEditState(edit: Edit): {
	tracks: unknown[][];
	clips: unknown[];
	endLengthClips: Set<unknown>;
	cachedTimelineEnd: number;
} {
	const anyEdit = edit as unknown as {
		tracks: unknown[][];
		clips: unknown[];
		endLengthClips: Set<unknown>;
		cachedTimelineEnd: number;
	};
	return {
		tracks: anyEdit.tracks,
		clips: anyEdit.clips,
		endLengthClips: anyEdit.endLengthClips,
		cachedTimelineEnd: anyEdit.cachedTimelineEnd
	};
}

/**
 * Create a video clip config.
 */
function createVideoClip(start: number | "auto", length: number | "auto" | "end"): ResolvedClip {
	return {
		asset: { type: "video", src: "https://example.com/video.mp4" },
		start,
		length,
		fit: "crop"
	} as ResolvedClip;
}

/**
 * Create a text clip config.
 */
function createTextClip(start: number | "auto", length: number | "auto" | "end", text: string = "Hello"): ResolvedClip {
	return {
		asset: { type: "text", text, style: "minimal" },
		start,
		length,
		fit: "none"
	} as ResolvedClip;
}

// ============================================================================
// UNIT TESTS: Pure Resolver Functions
// ============================================================================

describe("Timing Resolver Functions", () => {
	describe("resolveAutoStart()", () => {
		it("returns 0 for first clip on track", () => {
			const tracks = [[createMockPlayerForResolver(0, 5000)]];

			const result = resolveAutoStart(0, 0, tracks as never);

			expect(result).toBe(0);
		});

		it("returns previous clip end for subsequent clips", () => {
			const tracks = [[createMockPlayerForResolver(0, 5000), createMockPlayerForResolver(5000, 3000)]];

			const result = resolveAutoStart(0, 1, tracks as never);

			expect(result).toBe(5000); // Previous clip ends at 5000ms
		});

		it("handles non-contiguous clips (with gaps)", () => {
			const tracks = [
				[
					createMockPlayerForResolver(0, 2000),
					createMockPlayerForResolver(5000, 3000) // Gap from 2000 to 5000
				]
			];

			const result = resolveAutoStart(0, 1, tracks as never);

			// Returns previous clip's END, not its actual position
			expect(result).toBe(2000);
		});

		it("works independently across tracks", () => {
			const tracks = [[createMockPlayerForResolver(0, 10000)], [createMockPlayerForResolver(0, 3000)]];

			const resultTrack0 = resolveAutoStart(0, 0, tracks as never);
			const resultTrack1 = resolveAutoStart(1, 0, tracks as never);

			expect(resultTrack0).toBe(0);
			expect(resultTrack1).toBe(0);
		});
	});

	describe("resolveAutoLength()", () => {
		it("falls back to 3000ms for non-media assets", async () => {
			const asset = { type: "text" as const, text: "Hello" };

			const result = await resolveAutoLength(asset);

			expect(result).toBe(3000);
		});

		it("falls back to 3000ms for assets without src", async () => {
			// Use video asset without src - cast needed as schema expects src
			const asset = { type: "video" as const } as { type: "video"; src: string };

			const result = await resolveAutoLength(asset);

			expect(result).toBe(3000);
		});
	});

	describe("resolveEndLength()", () => {
		it("returns timeline end minus clip start", () => {
			const result = resolveEndLength(ms(2000), ms(10000));

			expect(result).toBe(8000);
		});

		it("never returns negative value", () => {
			const result = resolveEndLength(ms(15000), ms(10000));

			expect(result).toBe(0);
		});

		it("returns 0 when clip starts at timeline end", () => {
			const result = resolveEndLength(ms(10000), ms(10000));

			expect(result).toBe(0);
		});

		it("handles clip starting at 0", () => {
			const result = resolveEndLength(ms(0), ms(5000));

			expect(result).toBe(5000);
		});
	});

	describe("calculateTimelineEnd()", () => {
		it("returns max end time of all clips", () => {
			const tracks = [[createMockPlayerForResolver(0, 5000)], [createMockPlayerForResolver(0, 8000)], [createMockPlayerForResolver(2000, 3000)]];

			const result = calculateTimelineEnd(tracks as never);

			expect(result).toBe(8000);
		});

		it("excludes clips with length: 'end' to prevent circular dependency", () => {
			const tracks = [
				[createMockPlayerForResolver(0, 5000)],
				[createMockPlayerForResolver(0, 15000, "end")] // Should be excluded
			];

			const result = calculateTimelineEnd(tracks as never);

			expect(result).toBe(5000); // Only the first clip counts
		});

		it("returns 0 for empty tracks", () => {
			const tracks: unknown[][] = [];

			const result = calculateTimelineEnd(tracks as never);

			expect(result).toBe(0);
		});

		it("returns 0 when all clips have length: 'end'", () => {
			const tracks = [[createMockPlayerForResolver(0, 10000, "end")]];

			const result = calculateTimelineEnd(tracks as never);

			expect(result).toBe(0);
		});
	});
});

// ============================================================================
// INTEGRATION TESTS: Edit Class Timing
// ============================================================================

describe("Edit Timing Integration", () => {
	let edit: Edit;
	let events: EventEmitter;
	let emitSpy: jest.SpyInstance;

	beforeEach(async () => {
		edit = new Edit({
			timeline: { tracks: [] },
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
		events = edit.events;
		emitSpy = jest.spyOn(events, "emit");
	});

	afterEach(() => {
		edit.dispose();
		jest.clearAllMocks();
	});

	describe("start: 'auto' resolution", () => {
		it("first clip with auto start resolves to 0ms", async () => {
			// When adding a clip with start: "auto", it defaults to 0 for first clip
			await edit.addClip(0, createVideoClip("auto", 5));

			const clip = edit.getPlayerClip(0, 0);
			expect(clip?.getStart()).toBe(0);
		});

		it("preserves timing intent for auto start clips", async () => {
			await edit.addClip(0, createVideoClip("auto", 5));

			const clip = edit.getPlayerClip(0, 0);
			expect(clip?.getTimingIntent().start).toBe("auto");
		});

		it("each track has independent first clip at 0", async () => {
			await edit.addClip(0, createVideoClip(0, 10)); // Track 0
			await edit.addClip(1, createVideoClip("auto", 5)); // Track 1 - first clip

			const clipTrack1 = edit.getPlayerClip(1, 0);
			expect(clipTrack1?.getStart()).toBe(0); // First on its track
		});
	});

	describe("length: 'auto' resolution", () => {
		it("defaults to 3000ms for text assets without duration", async () => {
			await edit.addClip(0, createTextClip(0, "auto"));

			const clip = edit.getPlayerClip(0, 0);
			expect(clip?.getLength()).toBe(3000);
		});

		it("preserves timing intent for auto length clips", async () => {
			await edit.addClip(0, createTextClip(0, "auto"));

			const clip = edit.getPlayerClip(0, 0);
			expect(clip?.getTimingIntent().length).toBe("auto");
		});
	});

	describe("length: 'end' intent", () => {
		it("preserves 'end' in timing intent", async () => {
			await edit.addClip(0, createVideoClip(0, 5)); // Establish timeline
			await edit.addClip(1, createTextClip(0, "end"));

			const endClip = edit.getPlayerClip(1, 0);
			expect(endClip?.getTimingIntent().length).toBe("end");
		});

		it("tracks clip in endLengthClips set", async () => {
			await edit.addClip(0, createTextClip(0, "end"));

			const { endLengthClips } = getEditState(edit);
			expect(endLengthClips.size).toBe(1);
		});
	});

	describe("endLengthClips tracking", () => {
		it("adds clip to set when length is 'end'", async () => {
			await edit.addClip(0, createTextClip(0, "end"));

			const { endLengthClips } = getEditState(edit);
			expect(endLengthClips.size).toBe(1);
		});

		it("removes clip from set when deleted", async () => {
			await edit.addClip(0, createTextClip(0, "end"));
			const { endLengthClips: before } = getEditState(edit);
			expect(before.size).toBe(1);

			edit.deleteClip(0, 0);

			const { endLengthClips: after } = getEditState(edit);
			expect(after.size).toBe(0);
		});

		it("does not add fixed-length clips to set", async () => {
			await edit.addClip(0, createVideoClip(0, 5));

			const { endLengthClips } = getEditState(edit);
			expect(endLengthClips.size).toBe(0);
		});
	});

	describe("clip updates", () => {
		it("updateClip emits clip:updated event", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			emitSpy.mockClear();

			edit.updateClip(0, 0, { start: 1 });

			expect(emitSpy).toHaveBeenCalledWith("clip:updated", expect.anything());
		});

		it("updateClip preserves timing intent type", async () => {
			await edit.addClip(0, createVideoClip("auto", 5));

			// Updating other properties shouldn't change timing intent
			edit.updateClip(0, 0, { opacity: 0.5 });

			const clip = edit.getPlayerClip(0, 0);
			expect(clip?.getTimingIntent().start).toBe("auto");
		});
	});

	describe("duration calculations with timing", () => {
		it("totalDuration reflects max clip end", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			await edit.addClip(1, createVideoClip(0, 8));

			expect(edit.getTotalDuration()).toBe(8000);
		});

		it("duration is 0 with no clips", () => {
			expect(edit.getTotalDuration()).toBe(0);
		});

		it("duration updates when clip is deleted", async () => {
			await edit.addClip(0, createVideoClip(0, 5));
			await edit.addClip(1, createVideoClip(0, 8));
			expect(edit.getTotalDuration()).toBe(8000);

			edit.deleteClip(1, 0);

			expect(edit.getTotalDuration()).toBe(5000);
		});
	});
});
