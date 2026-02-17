/**
 * SVG Player Tests
 *
 * Comprehensive tests for the SvgPlayer class which renders SVG assets
 * to PNG via WASM (resvg) and displays them as PixiJS sprites.
 *
 * Key areas tested:
 * - WASM initialization (singleton pattern)
 * - SVG schema validation
 * - Successful rendering flow
 * - Error handling and fallback graphics
 * - Resource cleanup (dispose)
 * - Size calculations
 */

import { PlayerType } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import type { ResolvedClip, SvgAsset } from "@schemas";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks - Must be defined before imports that use them
// ─────────────────────────────────────────────────────────────────────────────

// Store mock references for assertions
let mockSpriteInstance: Record<string, unknown>;
let mockTextureInstance: Record<string, unknown>;
let mockGraphicsInstance: Record<string, unknown>;

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
		return {
			children,
			sortableChildren: true,
			parent: null as unknown,
			label: null as string | null,
			zIndex: 0,
			addChild: jest.fn((child: { parent?: unknown }) => {
				children.push(child);
				return child;
			}),
			removeChild: jest.fn((child: unknown) => {
				const idx = children.indexOf(child);
				if (idx !== -1) children.splice(idx, 1);
				return child;
			}),
			destroy: jest.fn(),
			setMask: jest.fn()
		};
	};

	const createMockGraphics = () => ({
		fillStyle: {},
		strokeStyle: {},
		rect: jest.fn().mockReturnThis(),
		fill: jest.fn().mockReturnThis(),
		moveTo: jest.fn().mockReturnThis(),
		lineTo: jest.fn().mockReturnThis(),
		stroke: jest.fn().mockReturnThis(),
		clear: jest.fn().mockReturnThis(),
		destroy: jest.fn()
	});

	const createMockSprite = () => ({
		texture: {},
		width: 800,
		height: 600,
		anchor: { set: jest.fn() },
		destroy: jest.fn()
	});

	const createMockTexture = () => ({
		width: 800,
		height: 600,
		destroy: jest.fn()
	});

	return {
		Container: jest.fn().mockImplementation(createMockContainer),
		Graphics: jest.fn().mockImplementation(() => {
			mockGraphicsInstance = createMockGraphics();
			return mockGraphicsInstance;
		}),
		Sprite: jest.fn().mockImplementation(() => {
			mockSpriteInstance = createMockSprite();
			return mockSpriteInstance;
		}),
		Texture: {
			from: jest.fn().mockImplementation(() => {
				mockTextureInstance = createMockTexture();
				return mockTextureInstance;
			}),
			WHITE: {}
		},
		Rectangle: jest.fn().mockImplementation((x, y, w, h) => ({ x, y, width: w, height: h })),
		Assets: {
			load: jest.fn().mockImplementation(async () => {
				mockTextureInstance = createMockTexture();
				return mockTextureInstance;
			}),
			unload: jest.fn(),
			cache: { has: jest.fn().mockReturnValue(false) }
		},
		ColorMatrixFilter: jest.fn(() => ({ negative: jest.fn() }))
	};
});

// Mock @shotstack/shotstack-canvas
const mockInitResvg = jest.fn().mockResolvedValue(undefined);
const mockRenderSvgAssetToPng = jest.fn().mockResolvedValue({
	png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // PNG magic bytes
	width: 800,
	height: 600
});

jest.mock("@shotstack/shotstack-canvas", () => ({
	initResvg: (...args: unknown[]) => mockInitResvg(...args),
	renderSvgAssetToPng: (...args: unknown[]) => mockRenderSvgAssetToPng(...args)
}));

// Mock fetch for WASM loading
const mockFetch = jest.fn().mockResolvedValue({
	arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100))
});
global.fetch = mockFetch;

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = jest.fn().mockReturnValue("blob:mock-url");
const mockRevokeObjectURL = jest.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// Mock Image class to trigger onload immediately when src is set
class MockImage {
	onload: (() => void) | null = null;

	onerror: (() => void) | null = null;

	private srcValue = "";

	get src(): string {
		return this.srcValue;
	}

	set src(value: string) {
		this.srcValue = value;
		// Trigger onload asynchronously to simulate real behavior
		setTimeout(() => {
			if (this.onload) this.onload();
		}, 0);
	}
}
global.Image = MockImage as unknown as typeof Image;

// Mock AssetLoader
jest.mock("@loaders/asset-loader", () => ({
	AssetLoader: jest.fn().mockImplementation(() => ({
		load: jest.fn().mockResolvedValue({}),
		loadVideoUnique: jest.fn().mockResolvedValue(null),
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
		cleanupForPlayer: jest.fn()
	}))
}));

// Mock TextPlayer
jest.mock("@canvas/players/text-player", () => ({
	TextPlayer: { resetFontCache: jest.fn() }
}));

// Mock AlignmentGuides
jest.mock("@canvas/system/alignment-guides", () => ({
	AlignmentGuides: jest.fn().mockImplementation(() => ({
		drawCanvasGuide: jest.fn(),
		drawClipGuide: jest.fn(),
		clear: jest.fn()
	}))
}));

// Mock captions module
jest.mock("@core/captions", () => ({
	findActiveCue: jest.fn().mockReturnValue(null)
}));

// Mock font config
jest.mock("@core/fonts/font-config", () => ({
	parseFontFamily: jest.fn().mockReturnValue("Arial"),
	resolveFontPath: jest.fn().mockReturnValue(null)
}));

// Mock placeholder graphic
jest.mock("@canvas/players/placeholder-graphic", () => ({
	createPlaceholderGraphic: jest.fn().mockImplementation(() => {
		mockGraphicsInstance = {
			fillStyle: {},
			strokeStyle: {},
			rect: jest.fn().mockReturnThis(),
			fill: jest.fn().mockReturnThis(),
			moveTo: jest.fn().mockReturnThis(),
			lineTo: jest.fn().mockReturnThis(),
			stroke: jest.fn().mockReturnThis(),
			clear: jest.fn().mockReturnThis(),
			destroy: jest.fn()
		};
		return mockGraphicsInstance;
	})
}));

// Import after mocks are set up
// eslint-disable-next-line import/first
import { SvgPlayer } from "@canvas/players/svg-player";
// eslint-disable-next-line import/first, @typescript-eslint/no-require-imports
const { createPlaceholderGraphic } = require("@canvas/players/placeholder-graphic");

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function createMockEdit(playbackTimeMs = 0): Edit {
	return {
		playbackTime: playbackTimeMs,
		isPlaying: false,
		size: { width: 1920, height: 1080 },
		resolveMergeFields: jest.fn((value: string) => value),
		assetLoader: {
			load: jest.fn(),
			loadVideoUnique: jest.fn(),
			incrementRef: jest.fn(),
			decrementRef: jest.fn()
		},
		events: { emit: jest.fn(), on: jest.fn(), off: jest.fn() },
		output: { size: { width: 1920, height: 1080 } }
	} as unknown as Edit;
}

function createSvgClipConfig(
	options: Partial<{
		src: string;
		width: number;
		height: number;
		start: number;
		length: number;
	}> = {}
): ResolvedClip {
	const {
		src = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="red" width="100" height="100"/></svg>',
		width,
		height,
		start = 0,
		length = 10
	} = options;

	return {
		asset: { type: "svg", src } as SvgAsset,
		start,
		length,
		...(width !== undefined && { width }),
		...(height !== undefined && { height })
	} as ResolvedClip;
}

function createInvalidSvgClipConfig(): ResolvedClip {
	return {
		asset: { type: "svg" } as SvgAsset, // Missing required 'src' or 'shape'
		start: 0,
		length: 10
	} as ResolvedClip;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset mocks between tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
	jest.clearAllMocks();

	// Reset the static initialization state
	// @ts-expect-error - accessing private static for testing
	SvgPlayer.resvgInitialized = false;
	// @ts-expect-error - accessing private static for testing
	SvgPlayer.resvgInitPromise = null;

	// Reset mock implementations to defaults
	mockRenderSvgAssetToPng.mockResolvedValue({
		png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
		width: 800,
		height: 600
	});

	mockFetch.mockResolvedValue({
		arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100))
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("SvgPlayer", () => {
	describe("constructor", () => {
		it("creates player with correct PlayerType", () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();

			const player = new SvgPlayer(mockEdit, clipConfig);

			expect(player).toBeInstanceOf(SvgPlayer);
			expect(player.playerType).toBe(PlayerType.Svg);
		});
	});

	describe("WASM Initialization", () => {
		it("initializes resvg WASM on first load", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();

			expect(mockFetch).toHaveBeenCalledWith("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm");
			expect(mockInitResvg).toHaveBeenCalled();
		});

		it("reuses WASM initialization across multiple players (singleton)", async () => {
			const mockEdit = createMockEdit();

			const player1 = new SvgPlayer(mockEdit, createSvgClipConfig());
			const player2 = new SvgPlayer(mockEdit, createSvgClipConfig());

			await player1.load();
			await player2.load();

			// Should only initialize once
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockInitResvg).toHaveBeenCalledTimes(1);
		});

		it("handles concurrent initialization requests", async () => {
			const mockEdit = createMockEdit();

			const player1 = new SvgPlayer(mockEdit, createSvgClipConfig());
			const player2 = new SvgPlayer(mockEdit, createSvgClipConfig());
			const player3 = new SvgPlayer(mockEdit, createSvgClipConfig());

			// Start all loads concurrently
			await Promise.all([player1.load(), player2.load(), player3.load()]);

			// Should only initialize once despite concurrent requests
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockInitResvg).toHaveBeenCalledTimes(1);
		});
	});

	describe("SVG Rendering", () => {
		it("renders valid SVG to PNG texture", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();

			expect(mockRenderSvgAssetToPng).toHaveBeenCalledWith(
				expect.objectContaining({ type: "svg" }),
				expect.objectContaining({
					defaultWidth: 1920,
					defaultHeight: 1080
				})
			);
		});

		it("uses clip dimensions when specified", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig({ width: 400, height: 300 });
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();

			expect(mockRenderSvgAssetToPng).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					defaultWidth: 400,
					defaultHeight: 300
				})
			);
		});

		it("creates blob URL and loads texture via Image and Texture.from", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);
			// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
			const pixi = require("pixi.js");

			await player.load();

			expect(mockCreateObjectURL).toHaveBeenCalled();
			// New implementation uses Image + Texture.from instead of Assets.load
			expect(pixi.Texture.from).toHaveBeenCalled();
		});

		it("revokes blob URL after texture is loaded", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();

			expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
		});
	});

	describe("Validation and Error Handling", () => {
		it("creates fallback graphic when SVG validation fails", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createInvalidSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();

			// Should not attempt to render
			expect(mockRenderSvgAssetToPng).not.toHaveBeenCalled();

			// Should create fallback graphic
			expect(createPlaceholderGraphic).toHaveBeenCalled();
		});

		it("creates fallback graphic when rendering fails", async () => {
			mockRenderSvgAssetToPng.mockRejectedValueOnce(new Error("Render failed"));

			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			const consoleSpy = jest.spyOn(console, "error").mockImplementation();

			await player.load();

			// Should create fallback graphic
			expect(createPlaceholderGraphic).toHaveBeenCalled();

			// Should log error
			expect(consoleSpy).toHaveBeenCalledWith("Failed to render SVG asset:", expect.any(Error));

			consoleSpy.mockRestore();
		});

		it("creates fallback graphic when WASM fetch fails", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			const consoleSpy = jest.spyOn(console, "error").mockImplementation();

			await player.load();

			expect(createPlaceholderGraphic).toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});

		it("revokes blob URL even when texture loading fails", async () => {
			// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
			const pixi = require("pixi.js");
			pixi.Assets.load.mockRejectedValueOnce(new Error("Texture load failed"));

			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			const consoleSpy = jest.spyOn(console, "error").mockImplementation();

			await player.load();

			// Blob URL should still be revoked (finally block)
			expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

			consoleSpy.mockRestore();
		});
	});

	describe("Size Calculations", () => {
		it("returns clip dimensions when explicitly set", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig({ width: 400, height: 300 });
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();

			const size = player.getSize();
			expect(size).toEqual({ width: 400, height: 300 });
		});

		it("returns rendered dimensions when clip dimensions not set", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();

			const size = player.getSize();
			expect(size).toEqual({ width: 800, height: 600 }); // From mock render result
		});

		it("returns edit size as fallback before loading", () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			const size = player.getSize();
			expect(size).toEqual({ width: 1920, height: 1080 });
		});

		it("getContentSize returns rendered dimensions", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();

			const contentSize = player.getContentSize();
			expect(contentSize).toEqual({ width: 800, height: 600 });
		});

		it("getFitScale returns 1 (no scaling)", () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			// @ts-expect-error - accessing protected method for testing
			const fitScale = player.getFitScale();
			expect(fitScale).toBe(1);
		});
	});

	describe("Resize Support", () => {
		it("supports edge resize", () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			expect(player.supportsEdgeResize()).toBe(true);
		});
	});

	describe("Resource Cleanup", () => {
		it("disposes sprite and texture on dispose", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();

			// Get references before dispose
			const spriteRef = mockSpriteInstance;
			const textureRef = mockTextureInstance;

			player.dispose();

			expect(spriteRef["destroy"]).toHaveBeenCalled();
			expect(textureRef["destroy"]).toHaveBeenCalledWith(true);
		});

		it("handles dispose when sprite/texture are null", () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			// Dispose without loading - should not throw
			expect(() => player.dispose()).not.toThrow();
		});

		it("sets sprite and texture to null after dispose", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();
			player.dispose();

			// @ts-expect-error - accessing private property for testing
			expect(player.sprite).toBeNull();
			// @ts-expect-error - accessing private property for testing
			expect(player.texture).toBeNull();
		});
	});

	describe("Update Cycle", () => {
		it("inherits update from Player base class", () => {
			const mockEdit = createMockEdit();
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			// SvgPlayer.update() exists and is callable (delegates to super)
			expect(typeof player.update).toBe("function");
		});
	});

	describe("Fallback Graphic", () => {
		it("creates fallback graphic with edit dimensions", async () => {
			const mockEdit = createMockEdit();
			mockEdit.size = { width: 640, height: 480 };
			const clipConfig = createInvalidSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			jest.spyOn(console, "error").mockImplementation();

			await player.load();

			// Verify createPlaceholderGraphic was called with correct dimensions
			expect(createPlaceholderGraphic).toHaveBeenCalledWith(640, 480);
		});

		it("uses clip dimensions for fallback when available", async () => {
			const mockEdit = createMockEdit();
			const clipConfig = {
				...createInvalidSvgClipConfig(),
				width: 200,
				height: 150
			} as ResolvedClip;
			const player = new SvgPlayer(mockEdit, clipConfig);

			jest.spyOn(console, "error").mockImplementation();

			await player.load();

			// Verify createPlaceholderGraphic was called with clip dimensions
			expect(createPlaceholderGraphic).toHaveBeenCalledWith(200, 150);
		});
	});

	describe("Integration with Edit Session", () => {
		it("uses edit size for default rendering dimensions", async () => {
			const mockEdit = createMockEdit();
			mockEdit.size = { width: 3840, height: 2160 }; // 4K
			const clipConfig = createSvgClipConfig();
			const player = new SvgPlayer(mockEdit, clipConfig);

			await player.load();

			expect(mockRenderSvgAssetToPng).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					defaultWidth: 3840,
					defaultHeight: 2160
				})
			);
		});
	});
});

describe("SvgPlayer - Edge Cases", () => {
	it("handles empty SVG src gracefully", async () => {
		const mockEdit = createMockEdit();
		const clipConfig = createSvgClipConfig({ src: "" });
		const player = new SvgPlayer(mockEdit, clipConfig);

		const consoleSpy = jest.spyOn(console, "error").mockImplementation();

		// Should not throw, should create fallback
		await expect(player.load()).resolves.not.toThrow();

		consoleSpy.mockRestore();
	});

	it("handles very large SVG content", async () => {
		const mockEdit = createMockEdit();
		// Create a large SVG (under the 500KB limit)
		const largeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="4096">
			${Array(1000).fill('<rect x="0" y="0" width="10" height="10"/>').join("")}
		</svg>`;
		const clipConfig = createSvgClipConfig({ src: largeSvg });
		const player = new SvgPlayer(mockEdit, clipConfig);

		await player.load();

		expect(mockRenderSvgAssetToPng).toHaveBeenCalled();
	});

	it("handles SVG with special characters in content", async () => {
		const mockEdit = createMockEdit();
		const svgWithSpecialChars = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
			<text x="10" y="50">&lt;Hello&gt; &amp; "World"</text>
		</svg>`;
		const clipConfig = createSvgClipConfig({ src: svgWithSpecialChars });
		const player = new SvgPlayer(mockEdit, clipConfig);

		await player.load();

		expect(mockRenderSvgAssetToPng).toHaveBeenCalledWith(expect.objectContaining({ src: svgWithSpecialChars }), expect.anything());
	});
});
