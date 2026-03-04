/**
 * @jest-environment jsdom
 */

import type { Edit } from "@core/edit-session";
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
	});
	mockGetVisibleWordsAtTime = jest.fn().mockReturnValue([
		{ wordIndex: 0, text: "Hello", x: 100, y: 540, width: 120, startTime: 0, endTime: 400, isRTL: false },
		{ wordIndex: 1, text: "World", x: 300, y: 540, width: 130, startTime: 500, endTime: 900, isRTL: false }
	]);
	mockGetActiveWordAtTime = jest.fn().mockReturnValue(
		{ wordIndex: 0, text: "Hello", x: 100, y: 540, width: 120, startTime: 0, endTime: 400, isRTL: false }
	);
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
				RichCaptionAssetSchema: { safeParse: jest.Mock }
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
			expect(mockRegisterFromBytes).toHaveBeenCalledWith(
				expect.any(ArrayBuffer),
				expect.objectContaining({ family: "Roboto" })
			);
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
				CanvasRichCaptionAssetSchema: { safeParse: jest.Mock }
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
		it("creates new texture each frame for pixi v8 compatibility", async () => {
			const edit = createMockEdit();
			const player = new RichCaptionPlayer(edit, createClip(createAsset()));
			await player.load();

			const pixi = jest.requireMock("pixi.js") as { Texture: { from: jest.Mock } };
			const fromCallCount = pixi.Texture.from.mock.calls.length;

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 0.2;
			player.update(0.016, 0.2);

			(edit as unknown as Record<string, unknown>)["playbackTime"] = 0.4;
			player.update(0.016, 0.4);

			
			expect(pixi.Texture.from.mock.calls.length).toBeGreaterThan(fromCallCount);
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
			await new Promise(resolve => { setTimeout(resolve, 10); });

			expect(mockLayoutCaption.mock.calls.length).toBe(layoutCallsBefore + 1);
		});
	});

	describe("Google Font Resolution", () => {
		it("resolves Google Font hash via getFontDisplayName", async () => {
			const { parseFontFamily: mockParseFontFamily } = jest.requireMock("@core/fonts/font-config") as {
				parseFontFamily: jest.Mock
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
});
