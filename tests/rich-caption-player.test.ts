/**
 * @jest-environment jsdom
 */

import type { Edit } from "@core/edit-session";
import { sec } from "@core/timing/types";
import type { RichCaptionAsset, ResolvedClip } from "@schemas";

let mockRegisterFromBytes: jest.Mock;
let mockLayoutCaption: jest.Mock;
let mockGetVisibleWordsAtTime: jest.Mock;
let mockGetActiveWordAtTime: jest.Mock;
let mockGenerateRichCaptionFrame: jest.Mock;
let mockCreateWebPainter: jest.Mock;
let mockPainterRender: jest.Mock;
let mockParseSubtitleToWords: jest.Mock;
let mockGetSharedInstance: jest.Mock;
let mockRelease: jest.Mock;
const mockFetch = jest.fn();

jest.mock("pixi.js", () => {
	const createMockContainer = (): Record<string, unknown> => {
		const children: unknown[] = [];
		return {
			children,
			sortableChildren: true,
			cursor: "default",
			eventMode: "none",
			visible: true,
			label: null as string | null,
			parent: null as unknown,
			scale: { set: jest.fn() },
			pivot: { set: jest.fn() },
			position: { set: jest.fn() },
			zIndex: 0,
			angle: 0,
			alpha: 1,
			skew: { set: jest.fn() },
			addChild: jest.fn((child: { parent?: unknown }) => {
				children.push(child);
				return child;
			}),
			removeChild: jest.fn((child: unknown) => {
				const idx = children.indexOf(child);
				if (idx >= 0) children.splice(idx, 1);
				return child;
			}),
			destroy: jest.fn(),
			on: jest.fn(),
			setMask: jest.fn(),
			getBounds: jest.fn(() => ({ x: 0, y: 0, width: 1920, height: 1080 }))
		};
	};

	return {
		Container: jest.fn().mockImplementation(createMockContainer),
		Texture: {
			from: jest.fn().mockImplementation(() => ({
				destroy: jest.fn(),
				update: jest.fn()
			})),
			WHITE: {}
		},
		Sprite: jest.fn().mockImplementation((texture: unknown) => ({
			texture,
			anchor: { set: jest.fn() },
			position: { set: jest.fn() },
			destroy: jest.fn()
		})),
		Graphics: jest.fn().mockImplementation(() => ({
			fillStyle: {},
			rect: jest.fn().mockReturnThis(),
			fill: jest.fn().mockReturnThis(),
			clear: jest.fn().mockReturnThis(),
			destroy: jest.fn()
		})),
		Text: jest.fn().mockImplementation(() => ({
			anchor: { set: jest.fn(), x: 0 },
			position: { set: jest.fn() },
			filters: [],
			text: "",
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			destroy: jest.fn()
		})),
		TextStyle: jest.fn().mockImplementation(() => ({})),
		Rectangle: jest.fn().mockImplementation((x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h })),
		Assets: {
			load: jest.fn(),
			unload: jest.fn(),
			cache: { has: jest.fn().mockReturnValue(false) }
		}
	};
});

jest.mock("pixi-filters", () => ({
	AdjustmentFilter: jest.fn().mockImplementation(() => ({})),
	BloomFilter: jest.fn().mockImplementation(() => ({})),
	GlowFilter: jest.fn().mockImplementation(() => ({})),
	OutlineFilter: jest.fn().mockImplementation(() => ({})),
	DropShadowFilter: jest.fn().mockImplementation(() => ({}))
}));

jest.mock("@core/fonts/font-config", () => ({
	parseFontFamily: jest.fn().mockImplementation((family: string) => ({
		baseFontFamily: family,
		fontWeight: 400
	})),
	resolveFontPath: jest.fn().mockReturnValue(null),
	getFontDisplayName: jest.fn().mockImplementation((family: string) => family)
}));

jest.mock("@schemas", () => ({
	RichCaptionAssetSchema: {
		safeParse: jest.fn().mockImplementation((asset: unknown) => ({
			success: true,
			data: asset
		}))
	}
}));

jest.mock("@shotstack/shotstack-canvas", () => {
	mockPainterRender = jest.fn().mockResolvedValue(undefined);
	mockRelease = jest.fn();
	mockRegisterFromBytes = jest.fn().mockResolvedValue(undefined);
	mockLayoutCaption = jest.fn().mockResolvedValue({
		store: {
			length: 3,
			words: ["Hello", "World", "Test"],
			startTimes: [0, 500, 1000],
			endTimes: [400, 900, 1400],
			xPositions: [100, 300, 500],
			yPositions: [540, 540, 540],
			widths: [120, 130, 100]
		},
		groups: [
			{
				wordIndices: [0, 1, 2],
				startTime: 0,
				endTime: 1400,
				lines: [{ wordIndices: [0, 1, 2], x: 100, y: 540, width: 400, height: 48 }]
			}
		],
		shapedWords: [
			{ text: "Hello", width: 120, glyphs: [], isRTL: false },
			{ text: "World", width: 130, glyphs: [], isRTL: false },
			{ text: "Test", width: 100, glyphs: [], isRTL: false }
		]
	});
	mockGetVisibleWordsAtTime = jest.fn().mockReturnValue([
		{ wordIndex: 0, text: "Hello", x: 100, y: 540, width: 120, startTime: 0, endTime: 400, isRTL: false },
		{ wordIndex: 1, text: "World", x: 300, y: 540, width: 130, startTime: 500, endTime: 900, isRTL: false }
	]);
	mockGetActiveWordAtTime = jest
		.fn()
		.mockReturnValue({ wordIndex: 0, text: "Hello", x: 100, y: 540, width: 120, startTime: 0, endTime: 400, isRTL: false });
	mockGenerateRichCaptionFrame = jest.fn().mockReturnValue({
		ops: [{ op: "DrawCaptionWord", text: "Hello" }],
		visibleWordCount: 1,
		activeWordIndex: 0
	});
	mockCreateWebPainter = jest.fn().mockReturnValue({ render: mockPainterRender });
	mockParseSubtitleToWords = jest.fn().mockReturnValue([
		{ text: "Hello", start: 0, end: 400 },
		{ text: "World", start: 500, end: 900 }
	]);
	mockGetSharedInstance = jest.fn().mockResolvedValue({
		registerFromBytes: mockRegisterFromBytes,
		release: mockRelease,
		getFace: jest.fn().mockResolvedValue(undefined)
	});

	return {
		FontRegistry: {
			getSharedInstance: mockGetSharedInstance
		},
		CaptionLayoutEngine: jest.fn().mockImplementation(() => ({
			layoutCaption: mockLayoutCaption,
			getVisibleWordsAtTime: mockGetVisibleWordsAtTime,
			getActiveWordAtTime: mockGetActiveWordAtTime,
			clearCache: jest.fn()
		})),
		generateRichCaptionFrame: (...args: unknown[]) => mockGenerateRichCaptionFrame(...args),
		createDefaultGeneratorConfig: jest.fn().mockReturnValue({
			frameWidth: 1920,
			frameHeight: 1080,
			pixelRatio: 1
		}),
		createWebPainter: (...args: unknown[]) => mockCreateWebPainter(...args),
		parseSubtitleToWords: (...args: unknown[]) => mockParseSubtitleToWords(...args),
		CanvasRichCaptionAssetSchema: {
			safeParse: jest.fn().mockImplementation((asset: unknown) => ({
				success: true,
				data: asset
			}))
		}
	};
});

// eslint-disable-next-line import/first
import { RichCaptionPlayer } from "@canvas/players/rich-caption-player";

function createMockEdit(overrides: Partial<Record<string, unknown>> = {}): Edit {
	const events = { emit: jest.fn(), on: jest.fn(), off: jest.fn() };
	return {
		size: { width: 1920, height: 1080 },
		playbackTime: 0,
		isPlaying: false,
		events,
		getInternalEvents: jest.fn(() => events),
		getTimelineFonts: jest.fn().mockReturnValue([]),
		getFontMetadata: jest.fn().mockReturnValue(new Map()),
		getFontUrlByFamilyAndWeight: jest.fn().mockReturnValue(null),
		getEdit: jest.fn().mockReturnValue({
			output: { size: { width: 1920, height: 1080 } },
			timeline: { fonts: [] }
		}),
		...overrides
	} as unknown as Edit;
}

function createClip(asset: RichCaptionAsset, overrides: Partial<ResolvedClip> = {}): ResolvedClip {
	return {
		id: "clip-1",
		start: 0,
		length: 6,
		width: 1920,
		height: 1080,
		asset,
		...overrides
	} as unknown as ResolvedClip;
}

function createAsset(overrides: Partial<RichCaptionAsset> = {}): RichCaptionAsset {
	return {
		type: "rich-caption",
		words: [
			{ text: "Hello", start: 0, end: 400 },
			{ text: "World", start: 500, end: 900 },
			{ text: "Test", start: 1000, end: 1400 }
		],
		font: { family: "Roboto", size: 48, color: "#ffffff" },
		position: "bottom",
		maxWidth: 0.9,
		maxLines: 2,
		...overrides
	} as unknown as RichCaptionAsset;
}

describe("RichCaptionPlayer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFetch.mockReset();
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			text: jest.fn().mockResolvedValue("1\n00:00:00,000 --> 00:00:00,400\nHello\n\n2\n00:00:00,500 --> 00:00:00,900\nWorld"),
			arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(64))
		});
		global.fetch = mockFetch as unknown as typeof fetch;

		// Mock FontFace
		(global as Record<string, unknown>)["FontFace"] = jest.fn().mockImplementation(() => ({
			load: jest.fn().mockResolvedValue(undefined)
		}));
		(document as unknown as Record<string, unknown>)["fonts"] = {
			add: jest.fn()
		};
	});

	describe("Construction & Validation", () => {
		it("strips fit property from clip config", () => {
			const edit = createMockEdit();
			const clip = createClip(createAsset(), { fit: "cover" } as Partial<ResolvedClip>);
			const player = new RichCaptionPlayer(edit, clip);
			expect((player as unknown as Record<string, unknown>)["clipConfiguration"]).toBeDefined();
			expect((player as unknown as { clipConfiguration: Record<string, unknown> }).clipConfiguration["fit"]).toBeUndefined();
		});

		it("loads successfully with valid inline words", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(true);
			expect(mockLayoutCaption).toHaveBeenCalledTimes(1);
			expect(mockGenerateRichCaptionFrame).toHaveBeenCalledTimes(1);
		});

		it("falls back to placeholder on invalid asset", async () => {
			const { RichCaptionAssetSchema } = jest.requireMock("@schemas") as {
				RichCaptionAssetSchema: { safeParse: jest.Mock };
			};
			RichCaptionAssetSchema.safeParse.mockReturnValueOnce({ success: false, error: new Error("invalid") });

			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(false);
			expect(mockLayoutCaption).not.toHaveBeenCalled();
		});

		it("rejects assets with word count exceeding hard limit", async () => {
			const manyWords = Array.from({ length: 5001 }, (_, i) => ({
				text: `word${i}`,
				start: i * 100,
				end: i * 100 + 80
			}));
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset({ words: manyWords } as Partial<RichCaptionAsset>)));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(false);
			expect(mockLayoutCaption).not.toHaveBeenCalled();
		});

		it("warns but proceeds for word count exceeding soft limit", async () => {
			const warnSpy = jest.spyOn(console, "warn").mockImplementation();
			const manyWords = Array.from({ length: 1501 }, (_, i) => ({
				text: `word${i}`,
				start: i * 100,
				end: i * 100 + 80
			}));
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset({ words: manyWords } as Partial<RichCaptionAsset>)));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(true);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("soft limit"));
			warnSpy.mockRestore();
		});
	});

	describe("Font Resolution", () => {
		it("resolves font via metadata URL", async () => {
			const edit = createMockEdit({
				getFontUrlByFamilyAndWeight: jest.fn().mockReturnValue("https://cdn.test/roboto.ttf")
			});
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			expect(mockFetch).toHaveBeenCalledWith("https://cdn.test/roboto.ttf");
		});

		it("resolves font from timeline fonts by filename", async () => {
			const edit = createMockEdit({
				getTimelineFonts: jest.fn().mockReturnValue([{ src: "https://cdn.test/Roboto-Regular.ttf" }]),
				getEdit: jest.fn().mockReturnValue({
					output: { size: { width: 1920, height: 1080 } },
					timeline: { fonts: [{ src: "https://cdn.test/Roboto-Regular.ttf" }] }
				})
			});
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("Roboto"));
		});

		it("registers font with FontRegistry via registerFromBytes", async () => {
			const edit = createMockEdit({
				getFontUrlByFamilyAndWeight: jest.fn().mockReturnValue("https://cdn.test/roboto.ttf")
			});
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			expect(mockRegisterFromBytes).toHaveBeenCalledTimes(1);
			expect(mockRegisterFromBytes).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.objectContaining({ family: "Roboto" }));
		});

		it("handles font registration failure gracefully", async () => {
			mockRegisterFromBytes.mockRejectedValueOnce(new Error("registration failed"));
			const edit = createMockEdit({
				getFontUrlByFamilyAndWeight: jest.fn().mockReturnValue("https://cdn.test/roboto.ttf")
			});
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));

			// Should not throw - fallback path
			await player.load();
		});
	});

	describe("Subtitle Loading", () => {
		it("fetches and parses subtitle from src URL", async () => {
			const asset = createAsset({ src: "https://cdn.test/captions.srt", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			expect(mockFetch).toHaveBeenCalledWith("https://cdn.test/captions.srt", expect.objectContaining({ signal: expect.any(AbortSignal) }));
			expect(mockParseSubtitleToWords).toHaveBeenCalled();
		});

		it("handles fetch error gracefully with fallback", async () => {
			const errorSpy = jest.spyOn(console, "error").mockImplementation();
			mockFetch.mockRejectedValueOnce(new Error("network error"));

			const asset = createAsset({ src: "https://cdn.test/captions.srt", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(false);
			errorSpy.mockRestore();
		});

		it("handles 404 response gracefully", async () => {
			const errorSpy = jest.spyOn(console, "error").mockImplementation();
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				text: jest.fn().mockResolvedValue("Not Found")
			});

			const asset = createAsset({ src: "https://cdn.test/missing.srt", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(false);
			errorSpy.mockRestore();
		});

		it("sets pauseThreshold to 5 when loading from SRT src", async () => {
			const asset = createAsset({ src: "https://cdn.test/captions.srt", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const clip = createClip(asset);
			const player = new RichCaptionPlayer(edit, clip);
			await player.load();

			// @ts-expect-error accessing private property for test verification
			expect(player.resolvedPauseThreshold).toBe(5);
		});
	});

	describe("Rendering", () => {
		it("renders first frame during load", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			expect(mockGenerateRichCaptionFrame).toHaveBeenCalledTimes(1);
			expect(mockPainterRender).toHaveBeenCalledTimes(1);
		});

		it("renders on every update call", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			mockGenerateRichCaptionFrame.mockClear();
			mockPainterRender.mockClear();

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 0.2;
			player.update(0.016, 0.2);

			expect(mockGenerateRichCaptionFrame).toHaveBeenCalledTimes(1);
		});

		it("renders on consecutive updates with different times", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			mockGenerateRichCaptionFrame.mockClear();

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 0.2;
			player.update(0.016, 0.2);

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 0.6;
			player.update(0.016, 0.6);

			expect(mockGenerateRichCaptionFrame).toHaveBeenCalledTimes(2);
		});

		it("renders karaoke animation on every update", async () => {
			const asset = createAsset({
				wordAnimation: { style: "karaoke", speed: 1, direction: "up" }
			} as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			mockGenerateRichCaptionFrame.mockClear();

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 0.1;
			player.update(0.016, 0.1);
			player.update(0.016, 0.116);

			expect(mockGenerateRichCaptionFrame).toHaveBeenCalledTimes(2);
		});

		it("renders synchronously without race conditions", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			mockGenerateRichCaptionFrame.mockClear();
			mockPainterRender.mockClear();

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 0.5;
			player.update(0.016, 0.5);

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 1.0;
			player.update(0.016, 1.0);

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 1.5;
			player.update(0.016, 1.5);

			expect(mockGenerateRichCaptionFrame).toHaveBeenCalledTimes(3);
			expect(mockPainterRender).toHaveBeenCalledTimes(3);
		});

		it("renders correctly after seek", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			mockGenerateRichCaptionFrame.mockClear();

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 1.0;
			player.update(0.016, 1.0);

			expect(mockGenerateRichCaptionFrame).toHaveBeenCalledTimes(1);
		});
	});

	describe("Lifecycle", () => {
		it("releases FontRegistry reference on dispose", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			player.dispose();

			expect(mockRelease).toHaveBeenCalledTimes(1);
		});

		it("destroys texture, sprite, and canvas on dispose", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			player.dispose();

			// @ts-expect-error accessing private property
			expect(player.texture).toBeNull();
			// @ts-expect-error accessing private property
			expect(player.sprite).toBeNull();
			// @ts-expect-error accessing private property
			expect(player.canvas).toBeNull();
		});

		it("sets loadComplete to false on dispose", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(true);

			player.dispose();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(false);
		});

		it("returns clip or edit dimensions from getSize()", () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset(), { width: 1280, height: 720 }));
			const size = player.getSize();
			expect(size).toEqual({ width: 1280, height: 720 });
		});

		it("falls back to edit size when clip has no dimensions", () => {
			const edit = createMockEdit();
			const clip = createClip(createAsset());
			delete (clip as Record<string, unknown>)["width"];
			delete (clip as Record<string, unknown>)["height"];

			const player = new RichCaptionPlayer(edit, clip);
			const size = player.getSize();
			expect(size).toEqual({ width: 1920, height: 1080 });
		});

		it("supports edge resize", () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			expect(player.supportsEdgeResize()).toBe(true);
		});

		it("getContainerScale returns user-defined scale only", () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));

			// @ts-expect-error accessing protected method
			const scale = player.getContainerScale();
			expect(scale.x).toBe(scale.y);
		});
	});

	describe("Edge Cases", () => {
		it("handles empty words array without error", async () => {
			const asset = createAsset({ words: [] } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));

			// Should handle empty words gracefully
			await player.load();
		});

		it("handles single word correctly", async () => {
			const asset = createAsset({
				words: [{ text: "Solo", start: 0, end: 1000 }]
			} as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(true);
			expect(mockLayoutCaption).toHaveBeenCalledTimes(1);
		});

		it("handles word count at exact soft boundary (1500)", async () => {
			const warnSpy = jest.spyOn(console, "warn").mockImplementation();
			const words = Array.from({ length: 1500 }, (_, i) => ({
				text: `word${i}`,
				start: i * 100,
				end: i * 100 + 80
			}));
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset({ words } as Partial<RichCaptionAsset>)));
			await player.load();

			// Exactly 1500 should NOT warn (only > 1500)
			expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("soft limit"));
			warnSpy.mockRestore();
		});

		it("handles word count at exact hard boundary (5000)", async () => {
			const words = Array.from({ length: 5000 }, (_, i) => ({
				text: `word${i}`,
				start: i * 100,
				end: i * 100 + 80
			}));
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset({ words } as Partial<RichCaptionAsset>)));
			await player.load();

			// Exactly 5000 should NOT fail (only > 5000)
			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(true);
		});

		it("handles canvas validation failure", async () => {
			const { CanvasRichCaptionAssetSchema } = jest.requireMock("@shotstack/shotstack-canvas") as {
				CanvasRichCaptionAssetSchema: { safeParse: jest.Mock };
			};
			CanvasRichCaptionAssetSchema.safeParse.mockReturnValueOnce({
				success: false,
				error: new Error("canvas validation failed")
			});

			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(false);
		});

		it("does not render when not active", async () => {
			const edit = createMockEdit();
			(edit as unknown as Record<string, unknown>)["playbackTime"] = -1;

			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();
			mockGenerateRichCaptionFrame.mockClear();

			player.update(0.016, -1);

			expect(mockGenerateRichCaptionFrame).not.toHaveBeenCalled();
		});

		it("does not render before load completes", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));

			// Don't call load - update should be a no-op
			(edit as unknown as Record<string, unknown>)["playbackTime"] = 0.5;
			player.update(0.016, 0.5);

			expect(mockGenerateRichCaptionFrame).not.toHaveBeenCalled();
		});

		it("shows fallback for empty words array", async () => {
			const asset = createAsset({ words: [] } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(false);
			expect(mockLayoutCaption).not.toHaveBeenCalled();
		});

		it("shows fallback when SRT returns empty words", async () => {
			mockParseSubtitleToWords.mockReturnValueOnce([]);
			const asset = createAsset({ src: "https://cdn.test/empty.srt", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(false);
			expect(mockLayoutCaption).not.toHaveBeenCalled();
		});
	});

	describe("Texture Reuse", () => {
		it("reuses single texture across frames via source.update()", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			const pixi = jest.requireMock("pixi.js") as { Texture: { from: jest.Mock } };
			const fromCallCount = pixi.Texture.from.mock.calls.length;

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 0.2;
			player.update(0.016, 0.2);

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 0.4;
			player.update(0.016, 0.4);

			expect(pixi.Texture.from.mock.calls.length).toBe(fromCallCount);
		});

		it("hides sprite when ops are empty", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			mockGenerateRichCaptionFrame.mockReturnValueOnce({
				ops: [],
				visibleWordCount: 0,
				activeWordIndex: -1
			});

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 5.0;
			player.update(0.016, 5.0);

			// @ts-expect-error accessing private property
			if (player.sprite) {
				// @ts-expect-error accessing private property
				expect(player.sprite.visible).toBe(false);
			}
		});
	});

	describe("Dimensions Changed", () => {
		it("supports edge resize", () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			expect(player.supportsEdgeResize()).toBe(true);
		});

		it("re-layouts on dimensions changed", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			const layoutCallsBefore = mockLayoutCaption.mock.calls.length;

			// Trigger dimension change
			// @ts-expect-error accessing protected method
			player.onDimensionsChanged();

			// Wait for async layout
			await new Promise(resolve => {
				setTimeout(resolve, 10);
			});

			expect(mockLayoutCaption.mock.calls.length).toBe(layoutCallsBefore + 1);
		});

		it("fully rebuilds caption on dimensions changed", async () => {
			const { CanvasRichCaptionAssetSchema } = jest.requireMock("@shotstack/shotstack-canvas") as {
				CanvasRichCaptionAssetSchema: { safeParse: jest.Mock };
			};

			const edit = createMockEdit();
			const clip = createClip(createAsset(), { width: 800, height: 200 });
			const player = new RichCaptionPlayer(edit, clip);
			await player.load();

			// Change clip dimensions to simulate resize
			(player as unknown as { clipConfiguration: ResolvedClip }).clipConfiguration.width = 400;
			(player as unknown as { clipConfiguration: ResolvedClip }).clipConfiguration.height = 100;

			CanvasRichCaptionAssetSchema.safeParse.mockClear();
			mockLayoutCaption.mockClear();
			mockCreateWebPainter.mockClear();

			// @ts-expect-error accessing protected method
			player.onDimensionsChanged();

			// Wait for async rebuild
			await new Promise(resolve => {
				setTimeout(resolve, 10);
			});

			// Should have rebuilt validatedAsset with new dimensions
			expect(CanvasRichCaptionAssetSchema.safeParse).toHaveBeenCalledTimes(1);
			const payload = CanvasRichCaptionAssetSchema.safeParse.mock.calls[0]?.[0];
			expect(payload.width).toBe(400);
			expect(payload.height).toBe(100);

			// Should have created a new canvas/painter and re-laid-out
			expect(mockCreateWebPainter).toHaveBeenCalledTimes(1);
			expect(mockLayoutCaption).toHaveBeenCalledTimes(1);
		});

		it("applyFixedDimensions is a no-op for caption player", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			// @ts-expect-error accessing private property
			const spriteBefore = player.sprite;

			// @ts-expect-error accessing protected method
			player.applyFixedDimensions();

			// @ts-expect-error accessing private property
			const spriteAfter = player.sprite;

			// Sprite should remain untouched — no anchor/scale/position changes
			expect(spriteAfter).toBe(spriteBefore);
			if (spriteAfter) {
				expect(spriteAfter.anchor.set).not.toHaveBeenCalled();
			}
		});
	});

	describe("Google Font Resolution", () => {
		it("resolves Google Font hash via getFontDisplayName", async () => {
			const { parseFontFamily: mockParseFontFamily } = jest.requireMock("@core/fonts/font-config") as {
				parseFontFamily: jest.Mock;
			};

			const asset = createAsset({
				font: { family: "mem8YaGs126MiZpBA-U1UpcaXcl0Aw", size: 48, color: "#ffffff" }
			} as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// parseFontFamily should be called (it's used in font resolution)
			expect(mockParseFontFamily).toHaveBeenCalled();
		});
	});

	describe("Font Undefined Path", () => {
		it("loads successfully when asset has no font property", async () => {
			const asset = createAsset({ font: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(true);
			expect(mockLayoutCaption).toHaveBeenCalledTimes(1);
		});

		it("uses Roboto as default when font is undefined", async () => {
			const asset = createAsset({ font: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit({
				getFontUrlByFamilyAndWeight: jest.fn().mockReturnValue("https://cdn.test/roboto.ttf")
			});
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			expect(edit.getFontUrlByFamilyAndWeight).toHaveBeenCalledWith("Roboto", 400);
		});
	});

	describe("FontFace ArrayBuffer", () => {
		it("passes ArrayBuffer bytes to FontFace constructor instead of URL", async () => {
			const MockFontFace = jest.fn().mockImplementation(() => ({
				load: jest.fn().mockResolvedValue(undefined)
			}));
			(global as Record<string, unknown>)["FontFace"] = MockFontFace;

			const edit = createMockEdit({
				getFontUrlByFamilyAndWeight: jest.fn().mockReturnValue("https://cdn.test/roboto.ttf")
			});
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			expect(MockFontFace).toHaveBeenCalledWith("Roboto", expect.any(ArrayBuffer), expect.objectContaining({ weight: "400" }));
		});
	});

	describe("buildCanvasPayload Field Stripping", () => {
		it("always includes font with resolved family even when asset.font is undefined", async () => {
			const { CanvasRichCaptionAssetSchema } = jest.requireMock("@shotstack/shotstack-canvas") as {
				CanvasRichCaptionAssetSchema: { safeParse: jest.Mock };
			};

			const asset = createAsset({ font: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			const parsedPayload = CanvasRichCaptionAssetSchema.safeParse.mock.calls[0]?.[0];
			expect(parsedPayload).toBeDefined();
			expect(parsedPayload.font).toBeDefined();
			expect(parsedPayload.font.family).toBe("Roboto");
		});

		it("includes only allowlisted fields in canvas payload", async () => {
			const { CanvasRichCaptionAssetSchema } = jest.requireMock("@shotstack/shotstack-canvas") as {
				CanvasRichCaptionAssetSchema: { safeParse: jest.Mock };
			};

			const asset = createAsset({
				font: { family: "Roboto", size: 48, color: "#ffffff" },
				stroke: { width: 2, color: "#000000" },
				shadow: { offsetX: 2, offsetY: 2, blur: 4, color: "#000000" },
				background: { color: "#333333" }
			} as Partial<RichCaptionAsset>);

			// Add non-allowlisted fields that should be stripped
			(asset as Record<string, unknown>)["unknownField"] = "should-be-stripped";
			(asset as Record<string, unknown>)["src"] = "https://cdn.test/captions.srt";

			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			const parsedPayload = CanvasRichCaptionAssetSchema.safeParse.mock.calls[0]?.[0];
			expect(parsedPayload).toBeDefined();
			expect(parsedPayload.type).toBe("rich-caption");
			expect(parsedPayload.font).toBeDefined();
			expect(parsedPayload.stroke).toBeDefined();
			expect(parsedPayload.shadow).toBeDefined();
			expect(parsedPayload.background).toBeDefined();
			expect(parsedPayload.words).toBeDefined();
			expect(parsedPayload.width).toBeDefined();
			expect(parsedPayload.height).toBeDefined();
			expect(parsedPayload.unknownField).toBeUndefined();
			expect(parsedPayload.src).toBeUndefined();
		});

		it("excludes undefined optional fields from canvas payload", async () => {
			const { CanvasRichCaptionAssetSchema } = jest.requireMock("@shotstack/shotstack-canvas") as {
				CanvasRichCaptionAssetSchema: { safeParse: jest.Mock };
			};

			const asset = createAsset();
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			const parsedPayload = CanvasRichCaptionAssetSchema.safeParse.mock.calls[0]?.[0];
			expect(parsedPayload).toBeDefined();
			expect(parsedPayload).not.toHaveProperty("stroke");
			expect(parsedPayload).not.toHaveProperty("shadow");
			expect(parsedPayload).not.toHaveProperty("background");
			expect(parsedPayload).not.toHaveProperty("border");
		});
	});

	describe("PERF-2: Font Registration Caching", () => {
		it("skips font registration in reconfigure when family+weight unchanged", async () => {
			const edit = createMockEdit({
				getFontUrlByFamilyAndWeight: jest.fn().mockReturnValue("https://cdn.test/roboto.ttf")
			});
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			const registerCallsBefore = mockRegisterFromBytes.mock.calls.length;

			// Trigger reconfigure with same font
			// @ts-expect-error accessing private method
			await player.reconfigure();

			expect(mockRegisterFromBytes.mock.calls.length).toBe(registerCallsBefore);
		});
	});

	describe("PERF-3: Pending Layout Guard", () => {
		it("cancels stale layout when dimensions change rapidly", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			// @ts-expect-error accessing private property
			const initialLayoutId = player.pendingLayoutId;

			// Trigger two rapid dimension changes
			// @ts-expect-error accessing protected method
			player.onDimensionsChanged();
			// @ts-expect-error accessing protected method
			player.onDimensionsChanged();

			// @ts-expect-error accessing private property
			expect(player.pendingLayoutId).toBe(initialLayoutId + 2);
		});
	});

	describe("Alias Placeholder", () => {
		it("detects alias reference and sets placeholder flags", async () => {
			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.isPlaceholder).toBe(true);
			expect(player.needsResolution).toBe(true);
			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(true);
		});

		it("does NOT call fetch for alias:// URLs", async () => {
			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// fetch should only be called for font registration, not for the alias URL
			const fetchCalls = mockFetch.mock.calls.map((c: unknown[]) => c[0]);
			expect(fetchCalls).not.toContain("alias://VIDEO");
		});

		it("renders placeholder through full canvas pipeline", async () => {
			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			expect(mockLayoutCaption).toHaveBeenCalledTimes(1);
			expect(mockGenerateRichCaptionFrame).toHaveBeenCalledTimes(1);
		});

		it("placeholder respects caption styling", async () => {
			const { CanvasRichCaptionAssetSchema } = jest.requireMock("@shotstack/shotstack-canvas") as {
				CanvasRichCaptionAssetSchema: { safeParse: jest.Mock };
			};

			const asset = createAsset({
				src: "alias://VIDEO",
				words: undefined,
				font: { family: "Inter", size: 36, color: "#ff0000" },
				active: { color: "#00ff00" },
				stroke: { width: 2, color: "#000000" }
			} as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			const payload = CanvasRichCaptionAssetSchema.safeParse.mock.calls[0]?.[0];
			expect(payload.font.family).toBe("Inter");
			expect(payload.active).toBeDefined();
			expect(payload.stroke).toBeDefined();
			expect(payload.words).toHaveLength(5); // placeholder words
		});

		it("distributes placeholder words across the full clip length", async () => {
			const { CanvasRichCaptionAssetSchema } = jest.requireMock("@shotstack/shotstack-canvas") as {
				CanvasRichCaptionAssetSchema: { safeParse: jest.Mock };
			};

			const clipLength = 10; // 10 seconds
			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset, { length: sec(clipLength) }));
			await player.load();

			const payload = CanvasRichCaptionAssetSchema.safeParse.mock.calls[0]?.[0];
			const words = payload.words as Array<{ start: number; end: number }>;
			expect(words[0].start).toBe(0);
			expect(words[words.length - 1].end).toBe(clipLength * 1000); // spans full clip in ms
		});

		it("reconfigure works on placeholder state", async () => {
			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			mockLayoutCaption.mockClear();

			// @ts-expect-error accessing private method
			await player.reconfigure();

			expect(mockLayoutCaption).toHaveBeenCalledTimes(1);
		});

		it("regenerates placeholder words when clip length changes (e.g. 'end' re-resolved)", async () => {
			const { CanvasRichCaptionAssetSchema } = jest.requireMock("@shotstack/shotstack-canvas") as {
				CanvasRichCaptionAssetSchema: { safeParse: jest.Mock };
			};

			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const clip = createClip(asset, { length: sec(3) }); // initial "end" resolved to 3s
			const player = new RichCaptionPlayer(edit, clip);
			await player.load();

			// Verify initial placeholder spans 3s
			let payload = CanvasRichCaptionAssetSchema.safeParse.mock.calls[0]?.[0];
			const initialWords = payload.words as Array<{ end: number }>;
			expect(initialWords[initialWords.length - 1].end).toBe(3000);

			// Simulate resolveAllTiming updating the length after video probing
			player.setResolvedTiming({ start: sec(0), length: sec(20) });
			CanvasRichCaptionAssetSchema.safeParse.mockClear();

			player.reconfigureAfterRestore();
			await new Promise(resolve => { setTimeout(resolve, 10); });

			// After reconfigure, placeholder should span the new 20s length
			payload = CanvasRichCaptionAssetSchema.safeParse.mock.calls[0]?.[0];
			const updatedWords = payload.words as Array<{ end: number }>;
			expect(updatedWords[updatedWords.length - 1].end).toBe(20000);
		});
	});

	describe("reloadAsset", () => {
		it("transitions from placeholder to real subtitles when src changes", async () => {
			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const clip = createClip(asset);
			const player = new RichCaptionPlayer(edit, clip);
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.isPlaceholder).toBe(true);
			expect(player.needsResolution).toBe(true);

			// Simulate reconciler updating src to a real URL
			(player as unknown as { clipConfiguration: ResolvedClip }).clipConfiguration.asset = {
				...asset,
				src: "https://cdn.test/real-captions.srt"
			};

			mockLayoutCaption.mockClear();
			mockGenerateRichCaptionFrame.mockClear();

			await player.reloadAsset();

			// @ts-expect-error accessing private property
			expect(player.isPlaceholder).toBe(false);
			expect(player.needsResolution).toBe(false);
			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(true);
			expect(mockParseSubtitleToWords).toHaveBeenCalled();
			expect(mockLayoutCaption).toHaveBeenCalledTimes(1);
		});

		it("stays in current state if src is still an alias", async () => {
			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			mockLayoutCaption.mockClear();

			await player.reloadAsset();

			// Should not attempt to rebuild — preserves existing placeholder state
			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(true); // untouched — early return before destruction
			expect(mockLayoutCaption).not.toHaveBeenCalled();
		});

		it("clears rendering state before reload", async () => {
			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// Verify rendering state exists
			// @ts-expect-error accessing private property
			expect(player.canvas).not.toBeNull();

			// Simulate src change to real URL
			(player as unknown as { clipConfiguration: ResolvedClip }).clipConfiguration.asset = {
				...asset,
				src: "https://cdn.test/captions.srt"
			};

			await player.reloadAsset();

			// After reload, pipeline is rebuilt
			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(true);
		});
		it("preserves canvas and sprite when src stays alias", async () => {
			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// @ts-expect-error accessing private property
			expect(player.canvas).not.toBeNull();
			// @ts-expect-error accessing private property
			expect(player.sprite).not.toBeNull();

			await player.reloadAsset();

			// Early return should NOT destroy canvas/sprite
			// @ts-expect-error accessing private property
			expect(player.canvas).not.toBeNull();
			// @ts-expect-error accessing private property
			expect(player.sprite).not.toBeNull();
		});

		it("handles fetch failure during reload without unhandled rejection", async () => {
			const errorSpy = jest.spyOn(console, "error").mockImplementation();

			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// Transition src from alias to real URL
			(player as unknown as { clipConfiguration: ResolvedClip }).clipConfiguration.asset = {
				...asset,
				src: "https://cdn.test/captions.srt"
			};

			// Make fetch reject during reload
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			// Should not throw an unhandled rejection
			await expect(player.reloadAsset()).rejects.toThrow("Network error");

			// loadComplete should stay false since pipeline was torn down before the fetch
			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(false);
			errorSpy.mockRestore();
		});

		it("creates fallback graphic when reload yields zero words", async () => {
			const asset = createAsset({ src: "alias://VIDEO", words: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset));
			await player.load();

			// Transition src to real URL
			(player as unknown as { clipConfiguration: ResolvedClip }).clipConfiguration.asset = {
				...asset,
				src: "https://cdn.test/empty.srt"
			};

			// Return empty words from parser
			mockParseSubtitleToWords.mockReturnValueOnce([]);

			await player.reloadAsset();

			// @ts-expect-error accessing private property
			expect(player.loadComplete).toBe(false);
			// Fallback text should have been added to contentContainer
			const pixi = jest.requireMock("pixi.js") as { Text: jest.Mock };
			expect(pixi.Text).toHaveBeenCalledWith("No caption words found", expect.anything());
		});
	});

	describe("buildLayoutConfig padding branches", () => {
		it("computes availableWidth from object padding {top, right, bottom, left}", async () => {
			const asset = createAsset({
				padding: { top: 25, right: 10, bottom: 15, left: 10 }
			} as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset, { width: 1920, height: 1080 }));
			await player.load();

			const layoutConfig = mockLayoutCaption.mock.calls[0]?.[1];
			expect(layoutConfig.availableWidth).toBe(1920 - 20); // left + right
			expect(layoutConfig.padding).toEqual({ top: 25, right: 10, bottom: 15, left: 10 });
		});

		it("defaults to 90% width when padding is undefined", async () => {
			const asset = createAsset({ padding: undefined } as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset, { width: 1920, height: 1080 }));
			await player.load();

			const layoutConfig = mockLayoutCaption.mock.calls[0]?.[1];
			expect(layoutConfig.availableWidth).toBe(1920 * 0.9);
			expect(layoutConfig.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
		});

		it("defaults missing sides to 0 in partial padding object", async () => {
			const asset = createAsset({
				padding: { left: 20 }
			} as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset, { width: 1920, height: 1080 }));
			await player.load();

			const layoutConfig = mockLayoutCaption.mock.calls[0]?.[1];
			// right defaults to 0, so availableWidth = 1920 - (20 + 0) = 1900
			expect(layoutConfig.availableWidth).toBe(1920 - 20);
			expect(layoutConfig.padding.left).toBe(20);
			expect(layoutConfig.padding.right).toBe(0);
			expect(layoutConfig.padding.top).toBe(0);
			expect(layoutConfig.padding.bottom).toBe(0);
		});

		it("computes maxLines from available height minus vertical padding", async () => {
			const asset = createAsset({
				padding: { top: 100, right: 0, bottom: 100, left: 0 },
				font: { family: "Roboto", size: 48, color: "#ffffff" }
			} as Partial<RichCaptionAsset>);
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(asset, { width: 1920, height: 1080 }));
			await player.load();

			const layoutConfig = mockLayoutCaption.mock.calls[0]?.[1];
			// availableHeight = 1080 - 100 - 100 = 880, fontSize = 48, lineHeight = 1.2
			// maxLines = floor(880 / (48 * 1.2)) = floor(880 / 57.6) = 15, clamped to 10
			expect(layoutConfig.maxLines).toBe(10);
		});
	});

	describe("rebuildForCurrentSize edge cases", () => {
		it("discards stale layout when dimensions change rapidly (pendingLayoutId race)", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			// Track layout calls and frame renders separately
			mockLayoutCaption.mockClear();
			mockGenerateRichCaptionFrame.mockClear();

			// Make layoutCaption resolve asynchronously so we can race two calls
			let resolveFirst!: (value: unknown) => void;
			let resolveSecond!: (value: unknown) => void;
			const firstLayout = new Promise(r => { resolveFirst = r; });
			const secondLayout = new Promise(r => { resolveSecond = r; });

			const layoutResult = {
				store: {
					length: 3,
					words: ["Hello", "World", "Test"],
					startTimes: [0, 500, 1000],
					endTimes: [400, 900, 1400],
					xPositions: [100, 300, 500],
					yPositions: [540, 540, 540],
					widths: [120, 130, 100]
				},
				groups: [{
					wordIndices: [0, 1, 2],
					startTime: 0,
					endTime: 1400,
					lines: [{ wordIndices: [0, 1, 2], x: 100, y: 540, width: 400, height: 48 }]
				}],
				shapedWords: [
					{ text: "Hello", width: 120, glyphs: [], isRTL: false },
					{ text: "World", width: 130, glyphs: [], isRTL: false },
					{ text: "Test", width: 100, glyphs: [], isRTL: false }
				]
			};

			mockLayoutCaption
				.mockReturnValueOnce(firstLayout)
				.mockReturnValueOnce(secondLayout);

			// Trigger two rapid dimension changes without awaiting
			// @ts-expect-error accessing protected method
			player.onDimensionsChanged();
			// @ts-expect-error accessing protected method
			player.onDimensionsChanged();

			// Resolve the second (latest) first, then the first (stale)
			resolveSecond(layoutResult);
			await secondLayout;
			resolveFirst(layoutResult);
			await firstLayout;

			// Allow microtasks to settle
			await new Promise(resolve => { setTimeout(resolve, 10); });

			// layoutCaption was called twice
			expect(mockLayoutCaption).toHaveBeenCalledTimes(2);
			// But only the second layout should have rendered (first was discarded by stale-ID guard)
			expect(mockGenerateRichCaptionFrame).toHaveBeenCalledTimes(1);
		});

		it("handles canvas validation failure during resize without crash", async () => {
			const { CanvasRichCaptionAssetSchema } = jest.requireMock("@shotstack/shotstack-canvas") as {
				CanvasRichCaptionAssetSchema: { safeParse: jest.Mock };
			};

			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			// Make canvas validation fail on next call (during resize)
			CanvasRichCaptionAssetSchema.safeParse.mockReturnValueOnce({ success: false });

			mockLayoutCaption.mockClear();

			// @ts-expect-error accessing protected method
			player.onDimensionsChanged();

			await new Promise(resolve => { setTimeout(resolve, 10); });

			// Layout should NOT be called since validation failed early
			expect(mockLayoutCaption).not.toHaveBeenCalled();
			// @ts-expect-error accessing private property
			expect(player.captionLayout).toBeNull();
		});

		it("skips rebuild when words array is empty", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			// Clear words to trigger early return in onDimensionsChanged
			// @ts-expect-error accessing private property
			player.words = [];

			mockLayoutCaption.mockClear();

			// @ts-expect-error accessing protected method
			player.onDimensionsChanged();

			await new Promise(resolve => { setTimeout(resolve, 10); });

			// Should NOT call layoutCaption because of the early return guard
			expect(mockLayoutCaption).not.toHaveBeenCalled();
		});
	});
});
