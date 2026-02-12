/**
 * @jest-environment jsdom
 */

import type { Edit } from "@core/edit-session";
import type { RichTextAsset, ResolvedClip } from "@schemas";

let mockRegisterFontFromUrl: jest.Mock<Promise<void>, [string, { family: string; weight: string }]>;
let mockRegisterFontFromFile: jest.Mock<Promise<void>, [string, { family: string; weight: string }]>;
let mockValidate: jest.Mock<{ value: unknown }, [unknown]>;
let mockCreateRenderer: jest.Mock<{ render: jest.Mock<Promise<void>, [unknown]> }, [HTMLCanvasElement]>;
let mockRenderFrame: jest.Mock<Promise<unknown[]>, [unknown, number, number]>;
let mockOpenTypeParse: jest.Mock<{ tables: Record<string, unknown> }, [ArrayBuffer]>;
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
				if (idx >= 0) {
					children.splice(idx, 1);
				}
				return child;
			}),
			destroy: jest.fn(),
			on: jest.fn(),
			setMask: jest.fn(),
			getBounds: jest.fn(() => ({ x: 0, y: 0, width: 640, height: 360 }))
		};
	};

	return {
		Container: jest.fn().mockImplementation(createMockContainer),
		Texture: {
			from: jest.fn().mockImplementation(() => ({
				destroy: jest.fn()
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
			moveTo: jest.fn().mockReturnThis(),
			lineTo: jest.fn().mockReturnThis(),
			stroke: jest.fn().mockReturnThis(),
			roundRect: jest.fn().mockReturnThis(),
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
		Rectangle: jest.fn().mockImplementation((x, y, w, h) => ({ x, y, width: w, height: h })),
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
	resolveFontPath: jest.fn().mockReturnValue(null)
}));

jest.mock("@schemas", () => ({
	RichTextAssetSchema: {
		safeParse: jest.fn().mockImplementation((asset: unknown) => ({
			success: true,
			data: asset
		}))
	}
}));

jest.mock("opentype.js", () => ({
	parse: (...args: [ArrayBuffer]) => mockOpenTypeParse(...args)
}));

jest.mock("@shotstack/shotstack-canvas", () => ({
	createTextEngine: jest.fn().mockImplementation(async () => {
		const renderer = {
			render: jest.fn().mockResolvedValue(undefined)
		};
		mockCreateRenderer = jest.fn().mockReturnValue(renderer);
		mockValidate = jest.fn().mockImplementation((asset: unknown) => ({ value: asset }));
		mockRenderFrame = jest.fn().mockResolvedValue([]);
		mockRegisterFontFromUrl = jest.fn().mockResolvedValue(undefined);
		mockRegisterFontFromFile = jest.fn().mockResolvedValue(undefined);

		return {
			validate: mockValidate,
			createRenderer: mockCreateRenderer,
			renderFrame: mockRenderFrame,
			registerFontFromUrl: mockRegisterFontFromUrl,
			registerFontFromFile: mockRegisterFontFromFile,
			destroy: jest.fn()
		};
	})
}));

// Import after mocks are set up
// eslint-disable-next-line import/first
import { RichTextPlayer } from "@canvas/players/rich-text-player";

interface Deferred<T> {
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
	promise: Promise<T>;
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { resolve, reject, promise };
}

function createMockEdit(fontUrlsByKey: Record<string, string>): Edit {
	const fontUrls = Object.values(fontUrlsByKey);
	const events = { emit: jest.fn(), on: jest.fn(), off: jest.fn() };
	return {
		size: { width: 1280, height: 720 },
		playbackTime: 0,
		isPlaying: false,
		events,
		getInternalEvents: jest.fn(() => events),
		getTimelineFonts: jest.fn().mockReturnValue(fontUrls.map(src => ({ src }))),
		getFontMetadata: jest.fn().mockReturnValue(new Map<string, { baseFamilyName: string; weight: number }>()),
		getFontUrlByFamilyAndWeight: jest.fn().mockImplementation((family: string, weight: number) => fontUrlsByKey[`${family}|${weight}`] ?? null),
		getEdit: jest.fn().mockReturnValue({
			output: { size: { width: 1280, height: 720 } },
			timeline: { fonts: fontUrls.map(src => ({ src })) }
		})
	} as unknown as Edit;
}

function createClip(asset: RichTextAsset): ResolvedClip {
	return {
		id: "clip-1",
		start: 0,
		length: 6,
		width: 640,
		height: 360,
		asset
	} as unknown as ResolvedClip;
}

function createAsset(weight: number = 400, family: string = "Source Sans"): RichTextAsset {
	return {
		type: "rich-text",
		text: "Hello world",
		font: {
			family,
			weight,
			size: 48,
			color: "#ffffff"
		}
	} as unknown as RichTextAsset;
}

async function createReadyPlayer(
	fontUrlsByKey: Record<string, string> = { "Source Sans|400": "https://cdn.test/source-regular.ttf" }
): Promise<{ player: RichTextPlayer; asset: RichTextAsset; edit: Edit }> {
	const edit = createMockEdit(fontUrlsByKey);
	const asset = createAsset(400);
	const player = new RichTextPlayer(edit, createClip(asset));
	await player.load();
	return { player, asset, edit };
}

async function reconfigure(player: RichTextPlayer, asset: RichTextAsset): Promise<void> {
	await (player as unknown as { reconfigure: (input: RichTextAsset) => Promise<void> }).reconfigure(asset);
}

describe("RichTextPlayer font caching", () => {
	beforeEach(() => {
		mockFetch.mockReset();
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(64))
		});
		global.fetch = mockFetch as unknown as typeof fetch;

		mockOpenTypeParse = jest.fn().mockReturnValue({
			tables: {
				fvar: {
					axes: [{ tag: "wght" }]
				}
			}
		});
		(RichTextPlayer as unknown as { fontCapabilityCache: Map<string, Promise<boolean>> }).fontCapabilityCache.clear();
	});

	it("deduplicates registration across repeated reconfigure calls for the same font key", async () => {
		const { player, asset } = await createReadyPlayer();

		await reconfigure(player, asset);
		await reconfigure(player, asset);
		await reconfigure(player, asset);

		expect(mockRegisterFontFromUrl).toHaveBeenCalledTimes(1);
	});

	it("deduplicates in-flight concurrent reconfigure registration calls", async () => {
		const { player, asset } = await createReadyPlayer();
		const deferred = createDeferred<void>();
		mockRegisterFontFromUrl.mockImplementationOnce(async () => deferred.promise);

		const first = reconfigure(player, asset);
		const second = reconfigure(player, asset);

		await Promise.resolve();
		expect(mockRegisterFontFromUrl).toHaveBeenCalledTimes(1);

		deferred.resolve(undefined);
		await Promise.all([first, second]);
	});

	it("deduplicates capability fetch/parse for repeated reconfigure calls on the same URL", async () => {
		const { player, asset } = await createReadyPlayer();

		await reconfigure(player, asset);
		await reconfigure(player, asset);
		await reconfigure(player, asset);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(mockOpenTypeParse).toHaveBeenCalledTimes(1);
	});

	it("caches failed registration results and does not retry on subsequent reconfigure", async () => {
		const { player, asset } = await createReadyPlayer();
		mockRegisterFontFromUrl.mockRejectedValueOnce(new Error("registration failed"));

		await reconfigure(player, asset);
		await reconfigure(player, asset);

		expect(mockRegisterFontFromUrl).toHaveBeenCalledTimes(1);
	});

	it("caches failed capability checks and does not refetch on subsequent reconfigure", async () => {
		const { player, asset } = await createReadyPlayer();
		mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

		await reconfigure(player, asset);
		await reconfigure(player, asset);

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("treats different URLs as unique keys and performs one registration/check per URL", async () => {
		const { player } = await createReadyPlayer({
			"Source Sans|400": "https://cdn.test/source-regular.ttf",
			"Source Serif|400": "https://cdn.test/source-serif.ttf"
		});

		const regular = createAsset(400, "Source Sans");
		const serif = createAsset(400, "Source Serif");

		await reconfigure(player, regular);
		await reconfigure(player, serif);

		expect(mockRegisterFontFromUrl).toHaveBeenCalledTimes(2);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it("deduplicates registration and capability checks when URL query/hash changes for the same font", async () => {
		const edit = createMockEdit({
			"Source Sans|400": "https://cdn.test/source.ttf?token=first"
		});
		const asset = createAsset(400, "Source Sans");
		const player = new RichTextPlayer(edit, createClip(asset));
		await player.load();

		(edit.getFontUrlByFamilyAndWeight as unknown as jest.Mock).mockReturnValue("https://cdn.test/source.ttf?token=second#hash");

		await reconfigure(player, asset);
		await reconfigure(player, asset);

		expect(mockRegisterFontFromUrl).toHaveBeenCalledTimes(1);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});
});
