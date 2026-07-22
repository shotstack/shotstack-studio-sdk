/**
 * @jest-environment jsdom
 */
/* eslint-disable max-classes-per-file, @typescript-eslint/lines-between-class-members, no-underscore-dangle */

const mockCreatePlaceholderGraphic = jest.fn((width: number, height: number) => ({
	__placeholder: true,
	width,
	height,
	destroy: jest.fn()
}));

jest.mock("@canvas/players/placeholder-graphic", () => ({
	createPlaceholderGraphic: mockCreatePlaceholderGraphic
}));

jest.mock("@core/loaders/gif-image-source", () => ({
	appendCorsQuery: (src: string) => `${src}?x-cors=1`,
	isGifUrl: (src: string) => src.endsWith(".gif")
}));

jest.mock("pixi.js", () => {
	class MockPoint {
		public x: number;
		public y: number;
		public set = jest.fn((x = 0, y = x) => {
			this.x = x;
			this.y = y;
		});
		public copyFrom = jest.fn(({ x = 0, y = 0 }: { x?: number; y?: number }) => {
			this.x = x;
			this.y = y;
		});

		constructor(x = 0, y = 0) {
			this.x = x;
			this.y = y;
		}
	}

	class MockContainer {
		public children: unknown[] = [];
		public sortableChildren = false;
		public eventMode: string | null = null;
		public cursor: string | null = null;
		public rotation = 0;
		public angle = 0;
		public alpha = 1;
		public visible = true;
		public zIndex = 0;
		public mask: unknown = null;
		public destroyed = false;
		public position = new MockPoint();
		public scale = new MockPoint(1, 1);
		public pivot = new MockPoint();
		public skew = { set: jest.fn() };
		public on = jest.fn();

		public addChild = jest.fn((child: unknown) => {
			this.children.push(child);
			return child;
		});

		public removeChild = jest.fn((child: unknown) => {
			this.children = this.children.filter(existing => existing !== child);
			return child;
		});

		public destroy = jest.fn(() => {
			this.destroyed = true;
		});
	}

	class MockGraphics extends MockContainer {
		public clear = jest.fn().mockReturnThis();
		public rect = jest.fn().mockReturnThis();
		public fill = jest.fn().mockReturnThis();
		public moveTo = jest.fn().mockReturnThis();
		public lineTo = jest.fn().mockReturnThis();
		public stroke = jest.fn().mockReturnThis();
		public roundRect = jest.fn().mockReturnThis();
	}

	class MockSprite extends MockContainer {
		public texture: { width?: number; height?: number };
		public width: number;
		public height: number;
		public anchor = { set: jest.fn() };

		constructor(texture: { width?: number; height?: number }) {
			super();
			this.texture = texture;
			this.width = texture?.width ?? 0;
			this.height = texture?.height ?? 0;
		}
	}

	class MockTexture {
		public source: unknown;
		public width: number;
		public height: number;
		public destroyed = false;

		constructor({
			source,
			frame,
			width = 0,
			height = 0
		}: { source?: { width?: number; height?: number }; frame?: { width?: number; height?: number }; width?: number; height?: number } = {}) {
			this.source = source;
			this.width = width || frame?.width || source?.width || 0;
			this.height = height || frame?.height || source?.height || 0;
		}

		public destroy = jest.fn(() => {
			this.destroyed = true;
		});
	}

	class MockRectangle {
		constructor(
			public x: number,
			public y: number,
			public width: number,
			public height: number
		) {}
	}

	class MockImageSource {}

	class MockVideoSource {
		public resource: unknown;
		public alphaMode = "premultiply-alpha-on-upload";

		constructor({ resource }: { resource: unknown }) {
			this.resource = resource;
		}
	}

	return {
		// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
		...require("./helpers/pixi-mock-filters").pixiFilterStubs,
		Container: MockContainer,
		Graphics: MockGraphics,
		Sprite: MockSprite,
		Texture: MockTexture,
		Rectangle: MockRectangle,
		ImageSource: MockImageSource,
		VideoSource: MockVideoSource
	};
});

// Import after mocks are set up.
// eslint-disable-next-line import/first
import { ImagePlayer } from "@canvas/players/image-player";
// eslint-disable-next-line import/first
import { VideoPlayer } from "@canvas/players/video-player";
// eslint-disable-next-line import/first
import type { ResolvedClip } from "@schemas";
// eslint-disable-next-line import/first
import * as pixi from "pixi.js";

function createEdit() {
	return {
		size: { width: 1080, height: 1920 },
		playbackTime: 0,
		isPlaying: false,
		assetLoader: {
			load: jest.fn(),
			loadGif: jest.fn(),
			loadVideoUnique: jest.fn(),
			rejectAsset: jest.fn(),
			release: jest.fn()
		}
	};
}

function createImageClip(): ResolvedClip {
	return {
		asset: {
			type: "image",
			src: "https://example.com/missing.png"
		},
		start: 0,
		length: 5,
		width: 400,
		height: 300
	} as ResolvedClip;
}

function createVideoClip(): ResolvedClip {
	return {
		asset: {
			type: "video",
			src: "https://example.com/video.mp4"
		},
		start: 0,
		length: 5
	} as ResolvedClip;
}

function createGifClip(): ResolvedClip {
	return {
		asset: { type: "image", src: "https://example.com/animation.gif" },
		start: 0,
		length: 5
	} as ResolvedClip;
}

function createVideoTexture(width: number, height: number, duration = 5) {
	const resource = {
		duration,
		volume: 1,
		currentTime: 0,
		pause: jest.fn(),
		play: jest.fn().mockResolvedValue(undefined),
		load: jest.fn(),
		src: ""
	};

	return new pixi.Texture({
		source: new pixi.VideoSource({ resource: resource as unknown as HTMLVideoElement }),
		width,
		height
	} as ConstructorParameters<typeof pixi.Texture>[0]);
}

describe("media player fallbacks", () => {
	let warnSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("uses the GIF cycle for auto timing and selects frames from the playhead", async () => {
		const edit = createEdit();
		const first = new pixi.Texture({ width: 2, height: 2 } as ConstructorParameters<typeof pixi.Texture>[0]);
		const second = new pixi.Texture({ width: 2, height: 2 } as ConstructorParameters<typeof pixi.Texture>[0]);
		const gifSource = {
			duration: 200,
			frames: [
				{ start: 0, end: 100, texture: first },
				{ start: 100, end: 200, texture: second }
			],
			frameIndexAt: jest.fn((time: number) => (time < 100 ? 0 : 1))
		};
		edit.assetLoader.loadGif.mockResolvedValue(gifSource);
		const player = new ImagePlayer(edit as never, createGifClip());

		await player.load();
		expect(player.getMediaDuration()).toBe(0.2);

		edit.playbackTime = 0.15;
		player.update(0, 0);
		const { sprite } = player as unknown as { sprite: { texture: unknown } };
		expect(sprite.texture).toBe(second);
	});

	it("releases replaced and disposed pending GIF loads exactly once", async () => {
		const edit = createEdit();
		let resolveFirst!: (source: unknown) => void;
		let resolveSecond!: (source: unknown) => void;
		edit.assetLoader.loadGif.mockReturnValueOnce(
			new Promise(resolve => {
				resolveFirst = resolve;
			})
		);
		edit.assetLoader.loadGif.mockReturnValueOnce(
			new Promise(resolve => {
				resolveSecond = resolve;
			})
		);
		const player = new ImagePlayer(edit as never, createGifClip());
		const staleLoad = player.load();
		await Promise.resolve();

		(player.clipConfiguration.asset as { src: string }).src = "https://example.com/replacement.gif";
		const replacementLoad = player.reloadAsset();
		await Promise.resolve();
		edit.assetLoader.release("https://example.com/replacement.gif");
		player.dispose();
		resolveFirst({ duration: 100, frames: [] });
		resolveSecond({ duration: 100, frames: [] });
		await Promise.all([staleLoad, replacementLoad]);

		expect(edit.assetLoader.release.mock.calls).toEqual([["https://example.com/animation.gif"], ["https://example.com/replacement.gif"]]);
	});

	it("uses display dimensions for a failed image placeholder", async () => {
		const edit = createEdit();
		edit.assetLoader.load.mockResolvedValueOnce(null);

		const player = new ImagePlayer(edit as never, createImageClip());

		await player.load();

		expect(mockCreatePlaceholderGraphic).toHaveBeenCalledWith(400, 300);
		expect(edit.assetLoader.rejectAsset).not.toHaveBeenCalled();
		expect(player.getSize()).toEqual({ width: 400, height: 300 });
		expect(player.getContentSize()).toEqual({ width: 400, height: 300 });
		expect(Number.isFinite(player.getScale())).toBe(true);
		expect(player.getContentContainer().children).toHaveLength(1);
		expect((player.getContentContainer().children[0] as { __placeholder?: boolean }).__placeholder).toBe(true);
	});

	it("replaces a failed video placeholder after a successful reload", async () => {
		const edit = createEdit();
		edit.assetLoader.loadVideoUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(createVideoTexture(1280, 720));

		const player = new VideoPlayer(edit as never, createVideoClip());

		await player.load();

		expect(mockCreatePlaceholderGraphic).toHaveBeenCalledWith(1080, 1920);
		expect(player.getContentContainer().children).toHaveLength(1);
		expect((player.getContentContainer().children[0] as { __placeholder?: boolean }).__placeholder).toBe(true);
		expect(player.getSize()).toEqual({ width: 1080, height: 1920 });

		await player.reloadAsset();

		expect(player.getContentContainer().children).toHaveLength(1);
		expect((player.getContentContainer().children[0] as { __placeholder?: boolean }).__placeholder).not.toBe(true);
		expect(player.getSize()).toEqual({ width: 1280, height: 720 });
		expect(Number.isFinite(player.getScale())).toBe(true);
	});

	it("ignores a stale video load after a newer source is ready", async () => {
		const edit = createEdit();
		let resolveFirst!: (texture: ReturnType<typeof createVideoTexture>) => void;
		const firstLoad = new Promise<ReturnType<typeof createVideoTexture>>(resolve => {
			resolveFirst = resolve;
		});
		const secondTexture = createVideoTexture(1920, 1080, 2);
		edit.assetLoader.loadVideoUnique.mockReturnValueOnce(firstLoad).mockResolvedValueOnce(secondTexture);
		const player = new VideoPlayer(edit as never, createVideoClip());

		const staleLoad = player.load();
		await Promise.resolve();
		(player.clipConfiguration.asset as { src: string }).src = "https://example.com/new-video.mp4";
		await player.reloadAsset();
		resolveFirst(createVideoTexture(640, 360, 8));
		await staleLoad;

		expect(player.getMediaDuration()).toBe(2);
		expect((player as unknown as { texture: unknown }).texture).toBe(secondTexture);
	});
});
