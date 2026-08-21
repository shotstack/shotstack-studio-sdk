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

jest.mock("@canvas/players/generation/pending-overlay", () => ({
	AiPendingOverlay: jest.fn().mockImplementation(() => ({
		getContainer: jest.fn(() => ({ destroy: jest.fn() })),
		dispose: jest.fn()
	}))
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
import { ImageToVideoPlayer } from "@canvas/players/image-to-video-player";
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
		getResolvedEdit: jest.fn(),
		assetLoader: {
			load: jest.fn(),
			loadVideoUnique: jest.fn(),
			rejectAsset: jest.fn()
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

function createVideoTexture(width: number, height: number) {
	const resource = {
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
});

describe("player disposal during load", () => {
	let warnSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("does not subscribe to generation events when disposed mid-load", async () => {
		const on = jest.fn();
		const edit = Object.assign(createEdit(), {
			getInternalEvents: () => ({ on, off: jest.fn() }),
			getClipGenerationState: jest.fn(() => undefined)
		});

		let releaseTexture: (() => void) | undefined;
		edit.assetLoader.load.mockImplementation(
			() =>
				new Promise(resolve => {
					releaseTexture = () => resolve(null);
				})
		);

		const clip = { asset: { type: "image-to-video", src: "https://example.com/in.jpg" }, start: 0, length: 5 } as ResolvedClip;
		const player = new ImageToVideoPlayer(edit as never, clip);
		player.clipId = "clip-1";

		const loading = player.load();
		// load() awaits super.load() before it reaches the texture fetch
		await new Promise<void>(resolve => {
			setTimeout(resolve, 0);
		});
		expect(releaseTexture).toBeDefined();

		player.dispose();
		releaseTexture?.();
		await loading;

		expect(on).not.toHaveBeenCalled();
	});
});

describe("media player source URLs", () => {
	// Presigned S3-style URL: any appended query parameter invalidates the signature
	const signedSrc = "https://bucket.s3.amazonaws.com/media.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123";

	let warnSpy: jest.SpyInstance;

	beforeEach(() => {
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	function createClip(type: string): ResolvedClip {
		return { asset: { type, src: signedSrc }, start: 0, length: 5 } as ResolvedClip;
	}

	it("passes the image src to the loader unchanged", async () => {
		const edit = createEdit();
		edit.assetLoader.load.mockResolvedValueOnce(null);

		await new ImagePlayer(edit as never, createClip("image")).load();

		expect(edit.assetLoader.load).toHaveBeenCalledWith(signedSrc, { src: signedSrc, crossorigin: "anonymous", data: {} });
	});

	it("passes the video src to the loader unchanged", async () => {
		const edit = createEdit();
		edit.assetLoader.loadVideoUnique.mockResolvedValueOnce(null);

		await new VideoPlayer(edit as never, createClip("video")).load();

		expect(edit.assetLoader.loadVideoUnique).toHaveBeenCalledWith(signedSrc, { src: signedSrc, data: { autoPlay: false, muted: false } });
	});

	it("passes the image-to-video src to the loader unchanged", async () => {
		const edit = createEdit();
		edit.assetLoader.load.mockResolvedValueOnce(null);

		await new ImageToVideoPlayer(edit as never, createClip("image-to-video")).load();

		expect(edit.assetLoader.load).toHaveBeenCalledWith(signedSrc, { src: signedSrc, crossorigin: "anonymous", data: {} });
	});

	// Query-less URLs get a cache-busting parameter so a response cached
	// without CORS headers (plain <img> on the host page) is never reused
	const plainSrc = "https://bucket.s3.amazonaws.com/media.mp4";
	const bustedSrc = `${plainSrc}?x-cors=1`;

	it("cache-busts a query-less image src", async () => {
		const edit = createEdit();
		edit.assetLoader.load.mockResolvedValueOnce(null);

		await new ImagePlayer(edit as never, { asset: { type: "image", src: plainSrc }, start: 0, length: 5 } as ResolvedClip).load();

		expect(edit.assetLoader.load).toHaveBeenCalledWith(bustedSrc, { src: bustedSrc, crossorigin: "anonymous", data: {} });
	});

	it("cache-busts a query-less video src", async () => {
		const edit = createEdit();
		edit.assetLoader.loadVideoUnique.mockResolvedValueOnce(null);

		await new VideoPlayer(edit as never, { asset: { type: "video", src: plainSrc }, start: 0, length: 5 } as ResolvedClip).load();

		expect(edit.assetLoader.loadVideoUnique).toHaveBeenCalledWith(bustedSrc, { src: bustedSrc, data: { autoPlay: false, muted: false } });
	});
});
