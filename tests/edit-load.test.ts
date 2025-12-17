/**
 * Edit Class Load Tests
 *
 * Tests the loadEdit() method - the entry point for loading edit configurations.
 * This includes player creation, track management, timing resolution, merge field handling,
 * font loading, and state initialization.
 *
 * loadEdit() workflow:
 * 1. Show loading overlay
 * 2. Clear existing clips
 * 3. Clone edit → originalEdit (for merge field templates)
 * 4. Load merge fields from edit.merge array
 * 5. Apply merge field substitutions
 * 6. Parse & validate via EditSchema
 * 7. Resolve alias references
 * 8. Update canvas size if output.size differs
 * 9. Set background color
 * 10. Load fonts (parallel via Promise.all)
 * 11. Create players per asset type (createPlayerFromAssetType)
 * 12. Initialize luma mask controller
 * 13. Resolve timing (two-pass)
 * 14. Calculate total duration
 * 15. Load soundtrack if present
 * 16. Emit timeline:updated event
 * 17. Hide loading overlay (in finally block)
 */

import { Edit } from "@core/edit";
import { PlayerType } from "@canvas/players/player";
import type { EventEmitter } from "@core/events/event-emitter";
import type { ResolvedClip, ResolvedEdit } from "@schemas/clip";

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

// Mock AssetLoader with font loading support
const mockAssetLoader = {
	load: jest.fn().mockResolvedValue({}),
	unload: jest.fn(),
	getProgress: jest.fn().mockReturnValue(100),
	loadTracker: { on: jest.fn(), off: jest.fn() }
};

jest.mock("@loaders/asset-loader", () => ({
	AssetLoader: jest.fn().mockImplementation(() => mockAssetLoader)
}));

// Mock LumaMaskController
const mockLumaMaskController = {
	initialize: jest.fn(),
	update: jest.fn(),
	dispose: jest.fn(),
	cleanupForPlayer: jest.fn(),
	getActiveMaskCount: jest.fn().mockReturnValue(0)
};

jest.mock("@core/luma-mask-controller", () => ({
	LumaMaskController: jest.fn().mockImplementation(() => mockLumaMaskController)
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

// Track player instances by type for assertions
const createdPlayers: Map<PlayerType, number> = new Map();

// Mock player factory - create functional mock players
const createMockPlayer = (edit: Edit, config: ResolvedClip, type: PlayerType) => {
	// Track player creation
	createdPlayers.set(type, (createdPlayers.get(type) || 0) + 1);

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

// Import mocked player constructors for assertions
import { VideoPlayer } from "@canvas/players/video-player";
import { ImagePlayer } from "@canvas/players/image-player";
import { TextPlayer } from "@canvas/players/text-player";
import { AudioPlayer } from "@canvas/players/audio-player";
import { LumaPlayer } from "@canvas/players/luma-player";
import { ShapePlayer } from "@canvas/players/shape-player";
import { HtmlPlayer } from "@canvas/players/html-player";
import { RichTextPlayer } from "@canvas/players/rich-text-player";
import { CaptionPlayer } from "@canvas/players/caption-player";

/**
 * Helper to access private Edit state for testing.
 */
function getEditState(edit: Edit): {
	tracks: unknown[][];
	originalEdit: { timeline: { tracks: { clips: ResolvedClip[] }[] } } | null;
	backgroundColor: string;
	size: { width: number; height: number };
} {
	const anyEdit = edit as unknown as {
		tracks: unknown[][];
		originalEdit: { timeline: { tracks: { clips: ResolvedClip[] }[] } } | null;
		backgroundColor: string;
		size: { width: number; height: number };
	};
	return {
		tracks: anyEdit.tracks,
		originalEdit: anyEdit.originalEdit,
		backgroundColor: anyEdit.backgroundColor,
		size: anyEdit.size
	};
}

/**
 * Create a minimal valid edit configuration.
 */
function createMinimalEdit(tracks: { clips: ResolvedClip[] }[] = []): ResolvedEdit {
	return {
		timeline: {
			tracks
		},
		output: {
			size: { width: 1920, height: 1080 },
			format: "mp4"
		}
	};
}

describe("Edit loadEdit()", () => {
	let edit: Edit;
	let events: EventEmitter;
	let emitSpy: jest.SpyInstance;

	beforeEach(async () => {
		// Reset player creation tracking
		createdPlayers.clear();

		// Reset all mocks
		jest.clearAllMocks();

		edit = new Edit({ width: 1920, height: 1080 });
		await edit.load();

		events = edit.events;
		emitSpy = jest.spyOn(events, "emit");
	});

	afterEach(() => {
		edit.dispose();
		jest.clearAllMocks();
	});

	describe("player creation", () => {
		it("creates VideoPlayer for video assets", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "video", src: "https://example.com/video.mp4" }, start: 0, length: 5, fit: "crop" }]
				}
			]);

			await edit.loadEdit(editConfig);

			expect(VideoPlayer).toHaveBeenCalledTimes(1);
			expect(VideoPlayer).toHaveBeenCalledWith(edit, expect.objectContaining({ asset: { type: "video", src: "https://example.com/video.mp4" } }));
		});

		it("creates ImagePlayer for image assets", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "image", src: "https://example.com/image.jpg" }, start: 0, length: 3, fit: "crop" }]
				}
			]);

			await edit.loadEdit(editConfig);

			expect(ImagePlayer).toHaveBeenCalledTimes(1);
		});

		it("creates TextPlayer for text assets", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "text", text: "Hello World" }, start: 0, length: 3, fit: "none" }]
				}
			]);

			await edit.loadEdit(editConfig);

			expect(TextPlayer).toHaveBeenCalledTimes(1);
		});

		it("creates AudioPlayer for audio assets", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "audio", src: "https://example.com/audio.mp3" }, start: 0, length: 10, fit: "crop" }]
				}
			]);

			await edit.loadEdit(editConfig);

			expect(AudioPlayer).toHaveBeenCalledTimes(1);
		});

		it("creates LumaPlayer for luma assets", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "luma", src: "https://example.com/luma.mp4" }, start: 0, length: 3, fit: "crop" }]
				}
			]);

			await edit.loadEdit(editConfig);

			expect(LumaPlayer).toHaveBeenCalledTimes(1);
		});

		it("creates ShapePlayer for shape assets", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "shape", shape: "rectangle", rectangle: { width: 100, height: 100 } }, start: 0, length: 3, fit: "none" }]
				}
			]);

			await edit.loadEdit(editConfig);

			expect(ShapePlayer).toHaveBeenCalledTimes(1);
		});

		it("creates HtmlPlayer for html assets", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "html", html: "<p>Test</p>", css: "p { color: red; }" }, start: 0, length: 3, fit: "none" }]
				}
			]);

			await edit.loadEdit(editConfig);

			expect(HtmlPlayer).toHaveBeenCalledTimes(1);
		});

		it("creates RichTextPlayer for rich-text assets", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "rich-text", text: "Hello World" }, start: 0, length: 3, fit: "none" }]
				}
			]);

			await edit.loadEdit(editConfig);

			expect(RichTextPlayer).toHaveBeenCalledTimes(1);
		});

		it("creates CaptionPlayer for caption assets", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "caption", src: "https://example.com/captions.srt" }, start: 0, length: 10, fit: "none" }]
				}
			]);

			await edit.loadEdit(editConfig);

			expect(CaptionPlayer).toHaveBeenCalledTimes(1);
		});

		it("creates multiple players for multi-clip edit", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [
						{ asset: { type: "video", src: "https://example.com/video.mp4" }, start: 0, length: 5, fit: "crop" },
						{ asset: { type: "image", src: "https://example.com/image.jpg" }, start: 5, length: 3, fit: "crop" }
					]
				}
			]);

			await edit.loadEdit(editConfig);

			expect(VideoPlayer).toHaveBeenCalledTimes(1);
			expect(ImagePlayer).toHaveBeenCalledTimes(1);
		});
	});

	describe("track management", () => {
		it("creates tracks array matching input track count", async () => {
			const editConfig = createMinimalEdit([
				{ clips: [{ asset: { type: "image", src: "https://example.com/img1.jpg" }, start: 0, length: 3, fit: "crop" }] },
				{ clips: [{ asset: { type: "image", src: "https://example.com/img2.jpg" }, start: 0, length: 3, fit: "crop" }] },
				{ clips: [{ asset: { type: "image", src: "https://example.com/img3.jpg" }, start: 0, length: 3, fit: "crop" }] }
			]);

			await edit.loadEdit(editConfig);

			const { tracks } = getEditState(edit);
			expect(tracks.length).toBe(3);
		});

		it("assigns correct layer index per track (trackIdx + 1)", async () => {
			const editConfig = createMinimalEdit([
				{ clips: [{ asset: { type: "image", src: "https://example.com/img1.jpg" }, start: 0, length: 3, fit: "crop" }] },
				{ clips: [{ asset: { type: "image", src: "https://example.com/img2.jpg" }, start: 0, length: 3, fit: "crop" }] }
			]);

			await edit.loadEdit(editConfig);

			// Players are created with layer = trackIdx + 1
			// Track 0 → layer 1, Track 1 → layer 2
			const player0 = edit.getPlayerClip(0, 0);
			const player1 = edit.getPlayerClip(1, 0);

			expect(player0?.layer).toBe(1);
			expect(player1?.layer).toBe(2);
		});

		it("handles multiple clips per track", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [
						{ asset: { type: "image", src: "https://example.com/img1.jpg" }, start: 0, length: 3, fit: "crop" },
						{ asset: { type: "image", src: "https://example.com/img2.jpg" }, start: 3, length: 3, fit: "crop" },
						{ asset: { type: "image", src: "https://example.com/img3.jpg" }, start: 6, length: 3, fit: "crop" }
					]
				}
			]);

			await edit.loadEdit(editConfig);

			const { tracks } = getEditState(edit);
			expect(tracks[0].length).toBe(3);
		});

		it("preserves original clip data in originalEdit", async () => {
			const editConfig = createMinimalEdit([
				{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
			]);

			await edit.loadEdit(editConfig);

			const { originalEdit } = getEditState(edit);
			// Verify originalEdit contains the clip data (note: loadEdit clones edit + addPlayer syncs)
			expect(originalEdit?.timeline.tracks[0].clips.length).toBeGreaterThanOrEqual(1);
			expect(originalEdit?.timeline.tracks[0].clips[0].asset).toHaveProperty("src", "https://example.com/img.jpg");
		});
	});

	describe("timing resolution", () => {
		it("resolves start: 'auto' for first clip to 0", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: "auto", length: 3, fit: "crop" }]
				}
			]);

			await edit.loadEdit(editConfig);

			const player = edit.getPlayerClip(0, 0);
			expect(player?.getStart()).toBe(0);
		});

		it("resolves start: 'auto' to previous clip end", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [
						{ asset: { type: "image", src: "https://example.com/img1.jpg" }, start: 0, length: 3, fit: "crop" },
						{ asset: { type: "image", src: "https://example.com/img2.jpg" }, start: "auto", length: 2, fit: "crop" }
					]
				}
			]);

			await edit.loadEdit(editConfig);

			// Second clip should start at 3000ms (end of first clip)
			const player2 = edit.getPlayerClip(0, 1);
			expect(player2?.getStart()).toBe(3000);
		});

		it("resolves length: 'auto' with default value", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: "auto", fit: "crop" }]
				}
			]);

			await edit.loadEdit(editConfig);

			const player = edit.getPlayerClip(0, 0);
			// Default auto length for non-media assets is 3000ms
			expect(player?.getLength()).toBe(3000);
		});

		it("sets totalDuration to max clip end time", async () => {
			const editConfig = createMinimalEdit([
				{
					clips: [
						{ asset: { type: "image", src: "https://example.com/img1.jpg" }, start: 0, length: 5, fit: "crop" },
						{ asset: { type: "image", src: "https://example.com/img2.jpg" }, start: 3, length: 4, fit: "crop" }
					]
				}
			]);

			await edit.loadEdit(editConfig);

			// Second clip ends at 3 + 4 = 7 seconds = 7000ms
			expect(edit.totalDuration).toBe(7000);
		});

		it("initializes luma mask controller after clips loaded", async () => {
			const editConfig = createMinimalEdit([
				{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
			]);

			await edit.loadEdit(editConfig);

			expect(mockLumaMaskController.initialize).toHaveBeenCalled();
		});

		it("handles multiple tracks with different timing", async () => {
			const editConfig = createMinimalEdit([
				{ clips: [{ asset: { type: "image", src: "https://example.com/img1.jpg" }, start: 0, length: 5, fit: "crop" }] },
				{ clips: [{ asset: { type: "image", src: "https://example.com/img2.jpg" }, start: 2, length: 10, fit: "crop" }] }
			]);

			await edit.loadEdit(editConfig);

			// Track 1 clip ends at 2 + 10 = 12 seconds = 12000ms
			expect(edit.totalDuration).toBe(12000);
		});
	});

	describe("merge field handling", () => {
		it("stores original edit with {{ FIELD }} templates in originalEdit", async () => {
			const editConfig: ResolvedEdit = {
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "{{ MEDIA_URL }}" }, start: 0, length: 3, fit: "crop" }]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [{ find: "MEDIA_URL", replace: "https://resolved.example.com/img.jpg" }]
			};

			await edit.loadEdit(editConfig);

			const { originalEdit } = getEditState(edit);
			// Original should preserve the template
			expect(originalEdit?.timeline.tracks[0].clips[0].asset).toHaveProperty("src", "{{ MEDIA_URL }}");
		});

		it("loads merge fields into service from edit.merge array", async () => {
			const editConfig: ResolvedEdit = {
				timeline: { tracks: [] },
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [
					{ find: "FIELD_A", replace: "value_a" },
					{ find: "FIELD_B", replace: "value_b" }
				]
			};

			await edit.loadEdit(editConfig);

			expect(edit.mergeFields.get("FIELD_A")).toBeDefined();
			expect(edit.mergeFields.get("FIELD_B")).toBeDefined();
		});

		it("substitutes merge field values in resolved edit", async () => {
			const editConfig: ResolvedEdit = {
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "{{ MEDIA_URL }}" }, start: 0, length: 3, fit: "crop" }]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [{ find: "MEDIA_URL", replace: "https://resolved.example.com/img.jpg" }]
			};

			await edit.loadEdit(editConfig);

			// Player should have resolved value
			const player = edit.getPlayerClip(0, 0);
			expect(player?.clipConfiguration.asset).toHaveProperty("src", "https://resolved.example.com/img.jpg");
		});

		it("handles edit without merge fields", async () => {
			const editConfig = createMinimalEdit([
				{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
			]);

			await edit.loadEdit(editConfig);

			// Should load without errors
			const player = edit.getPlayerClip(0, 0);
			expect(player?.clipConfiguration.asset).toHaveProperty("src", "https://example.com/img.jpg");
		});
	});

	describe("fonts", () => {
		it("loads all fonts from timeline.fonts array", async () => {
			const editConfig: ResolvedEdit = {
				timeline: {
					tracks: [],
					fonts: [{ src: "https://example.com/font1.ttf" }, { src: "https://example.com/font2.woff2" }]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" }
			};

			await edit.loadEdit(editConfig);

			// AssetLoader.load should be called for each font
			expect(mockAssetLoader.load).toHaveBeenCalledWith("https://example.com/font1.ttf", expect.any(Object));
			expect(mockAssetLoader.load).toHaveBeenCalledWith("https://example.com/font2.woff2", expect.any(Object));
		});

		it("handles empty fonts array", async () => {
			const editConfig: ResolvedEdit = {
				timeline: {
					tracks: [],
					fonts: []
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" }
			};

			await edit.loadEdit(editConfig);

			// Should not call load for fonts
			expect(mockAssetLoader.load).not.toHaveBeenCalled();
		});

		it("handles edit without fonts property", async () => {
			const editConfig = createMinimalEdit([]);

			await edit.loadEdit(editConfig);

			// Should load without errors
			expect(mockAssetLoader.load).not.toHaveBeenCalled();
		});
	});

	describe("events and state", () => {
		it("emits timeline:updated event on completion", async () => {
			const editConfig = createMinimalEdit([
				{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
			]);

			await edit.loadEdit(editConfig);

			expect(emitSpy).toHaveBeenCalledWith("timeline:updated", expect.objectContaining({ current: expect.any(Object) }));
		});

		it("sets background color from timeline.background", async () => {
			const editConfig: ResolvedEdit = {
				timeline: {
					tracks: [],
					background: "#FF5500"
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" }
			};

			await edit.loadEdit(editConfig);

			const { backgroundColor } = getEditState(edit);
			expect(backgroundColor).toBe("#FF5500");
		});

		it("updates canvas size from output.size", async () => {
			// Start with default size
			expect(getEditState(edit).size).toEqual({ width: 1920, height: 1080 });

			const editConfig: ResolvedEdit = {
				timeline: { tracks: [] },
				output: { size: { width: 1280, height: 720 }, format: "mp4" }
			};

			await edit.loadEdit(editConfig);

			const { size } = getEditState(edit);
			expect(size).toEqual({ width: 1280, height: 720 });
		});
	});

	describe("edge cases", () => {
		it("handles empty edit (no tracks)", async () => {
			const editConfig = createMinimalEdit([]);

			await edit.loadEdit(editConfig);

			const { tracks } = getEditState(edit);
			expect(tracks.length).toBe(0);
			expect(edit.totalDuration).toBe(0);
		});

		it("handles edit with empty tracks", async () => {
			const editConfig = createMinimalEdit([{ clips: [] }, { clips: [] }]);

			await edit.loadEdit(editConfig);

			const { tracks } = getEditState(edit);
			// Empty tracks are not created (no players added)
			expect(tracks.length).toBe(0);
		});

		it("clears existing clips before loading new edit", async () => {
			// Load first edit
			const editConfig1 = createMinimalEdit([
				{ clips: [{ asset: { type: "image", src: "https://example.com/img1.jpg" }, start: 0, length: 3, fit: "crop" }] }
			]);
			await edit.loadEdit(editConfig1);

			expect(getEditState(edit).tracks[0].length).toBe(1);

			// Load second edit
			const editConfig2 = createMinimalEdit([
				{
					clips: [
						{ asset: { type: "image", src: "https://example.com/img2.jpg" }, start: 0, length: 3, fit: "crop" },
						{ asset: { type: "image", src: "https://example.com/img3.jpg" }, start: 3, length: 3, fit: "crop" }
					]
				}
			]);
			await edit.loadEdit(editConfig2);

			// Should only have clips from second edit
			expect(getEditState(edit).tracks[0].length).toBe(2);
		});

	});

	describe("soundtrack", () => {
		it("loads soundtrack as AudioPlayer on last track", async () => {
			const editConfig: ResolvedEdit = {
				timeline: {
					tracks: [{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 5, fit: "crop" }] }],
					soundtrack: { src: "https://example.com/music.mp3", effect: "fadeIn" }
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" }
			};

			await edit.loadEdit(editConfig);

			// Soundtrack creates one AudioPlayer (main track is image, not audio)
			expect(AudioPlayer).toHaveBeenCalledTimes(1);
			expect(AudioPlayer).toHaveBeenCalledWith(
				edit,
				expect.objectContaining({
					asset: expect.objectContaining({
						type: "audio",
						src: "https://example.com/music.mp3",
						effect: "fadeIn"
					})
				})
			);
		});

		it("handles edit without soundtrack", async () => {
			const editConfig = createMinimalEdit([
				{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
			]);

			await edit.loadEdit(editConfig);

			// Only ImagePlayer should be created, no AudioPlayer
			expect(ImagePlayer).toHaveBeenCalledTimes(1);
			expect(AudioPlayer).not.toHaveBeenCalled();
		});
	});

	describe("smart loadEdit diffing", () => {
		describe("structural change detection", () => {
			it("detects different track count as structural change", async () => {
				// Load 1-track edit
				const edit1 = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
				]);
				await edit.loadEdit(edit1);
				const initialCallCount = (ImagePlayer as jest.Mock).mock.calls.length;

				// Load 2-track edit - should trigger full reload
				const edit2 = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] },
					{ clips: [{ asset: { type: "image", src: "https://example.com/img2.jpg" }, start: 0, length: 3, fit: "crop" }] }
				]);
				await edit.loadEdit(edit2);

				// Should have created new players (full reload)
				expect((ImagePlayer as jest.Mock).mock.calls.length).toBeGreaterThan(initialCallCount);
			});

			it("detects different clip count as structural change", async () => {
				// Load edit with 1 clip
				const edit1 = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
				]);
				await edit.loadEdit(edit1);
				const initialCallCount = (ImagePlayer as jest.Mock).mock.calls.length;

				// Load edit with 2 clips - should trigger full reload
				const edit2 = createMinimalEdit([
					{
						clips: [
							{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" },
							{ asset: { type: "image", src: "https://example.com/img2.jpg" }, start: 3, length: 3, fit: "crop" }
						]
					}
				]);
				await edit.loadEdit(edit2);

				// Should have created new players (full reload)
				expect((ImagePlayer as jest.Mock).mock.calls.length).toBeGreaterThan(initialCallCount);
			});

			it("detects asset type change as structural change", async () => {
				// Load edit with image clip
				const edit1 = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
				]);
				await edit.loadEdit(edit1);
				const imageCallCount = (ImagePlayer as jest.Mock).mock.calls.length;

				// Load edit with video clip - should trigger full reload
				const edit2 = createMinimalEdit([
					{ clips: [{ asset: { type: "video", src: "https://example.com/video.mp4" }, start: 0, length: 3, fit: "crop" }] }
				]);
				await edit.loadEdit(edit2);

				// Video player should be created (not just updating image player)
				expect(VideoPlayer).toHaveBeenCalled();
			});

			it("uses granular path for property-only changes", async () => {
				// Load initial edit
				const edit1 = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
				]);
				await edit.loadEdit(edit1);
				const initialCallCount = (ImagePlayer as jest.Mock).mock.calls.length;

				// Load edit with only length changed - should use granular path
				const edit2 = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 10, fit: "crop" }] }
				]);
				await edit.loadEdit(edit2);

				// Should NOT create new players (granular path)
				expect((ImagePlayer as jest.Mock).mock.calls.length).toBe(initialCallCount);
			});
		});

		describe("granular updates", () => {
			it("updates clip properties without rebuilding players", async () => {
				// Load initial edit
				const edit1 = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
				]);
				await edit.loadEdit(edit1);

				// Get player reference
				const playerBefore = edit.getPlayerClip(0, 0);

				// Load edit with changed property
				const edit2 = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 10, fit: "crop" }] }
				]);
				await edit.loadEdit(edit2);

				// Same player instance should be used
				const playerAfter = edit.getPlayerClip(0, 0);
				expect(playerAfter).toBe(playerBefore);
			});

			it("updates output settings via granular path", async () => {
				// Load initial edit
				const edit1: ResolvedEdit = {
					timeline: {
						tracks: [{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }]
					},
					output: { size: { width: 1920, height: 1080 }, format: "mp4", fps: 25 }
				};
				await edit.loadEdit(edit1);
				const initialCallCount = (ImagePlayer as jest.Mock).mock.calls.length;

				// Change fps only
				const edit2: ResolvedEdit = {
					timeline: {
						tracks: [{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }]
					},
					output: { size: { width: 1920, height: 1080 }, format: "mp4", fps: 30 }
				};
				await edit.loadEdit(edit2);

				// Should NOT rebuild players
				expect((ImagePlayer as jest.Mock).mock.calls.length).toBe(initialCallCount);
				// FPS should be updated
				expect(edit.getOutputFps()).toBe(30);
			});

			it("updates background color via granular path", async () => {
				// Load initial edit
				const edit1: ResolvedEdit = {
					timeline: {
						tracks: [{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }],
						background: "#000000"
					},
					output: { size: { width: 1920, height: 1080 }, format: "mp4" }
				};
				await edit.loadEdit(edit1);
				const initialCallCount = (ImagePlayer as jest.Mock).mock.calls.length;

				// Change background only
				const edit2: ResolvedEdit = {
					timeline: {
						tracks: [{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }],
						background: "#ff0000"
					},
					output: { size: { width: 1920, height: 1080 }, format: "mp4" }
				};
				await edit.loadEdit(edit2);

				// Should NOT rebuild players
				expect((ImagePlayer as jest.Mock).mock.calls.length).toBe(initialCallCount);
				// Background should be updated
				expect(getEditState(edit).backgroundColor).toBe("#ff0000");
			});
		});

		describe("event emission", () => {
			it("emits edit:changed event for full reload", async () => {
				const editChangedHandler = jest.fn();
				events.on("edit:changed", editChangedHandler);

				const editConfig = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
				]);
				await edit.loadEdit(editConfig);

				expect(editChangedHandler).toHaveBeenCalledWith(expect.objectContaining({ source: "loadEdit" }));
			});

			it("emits single edit:changed event for granular updates", async () => {
				// Load initial edit
				const edit1 = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 3, fit: "crop" }] }
				]);
				await edit.loadEdit(edit1);

				// Reset and track events
				const editChangedHandler = jest.fn();
				events.on("edit:changed", editChangedHandler);

				// Load edit with property change (granular path)
				const edit2 = createMinimalEdit([
					{ clips: [{ asset: { type: "image", src: "https://example.com/img.jpg" }, start: 0, length: 10, fit: "crop" }] }
				]);
				await edit.loadEdit(edit2);

				// Should emit exactly 1 event with granular source
				const granularEvents = editChangedHandler.mock.calls.filter(
					(call: [{ source: string }]) => call[0].source === "loadEdit:granular"
				);
				expect(granularEvents.length).toBe(1);
			});
		});
	});
});
