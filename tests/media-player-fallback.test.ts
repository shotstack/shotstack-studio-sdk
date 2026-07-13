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
import { LumaPlayer } from "@canvas/players/luma-player";
// eslint-disable-next-line import/first
import { Player, PlayerType } from "@canvas/players/player";
// eslint-disable-next-line import/first
import { VideoPlayer } from "@canvas/players/video-player";
// eslint-disable-next-line import/first
import { sec } from "@core/timing/types";
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
			isGif: jest.fn().mockResolvedValue(false),
			loadGif: jest.fn(),
			load: jest.fn(),
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

function createLumaClip(): ResolvedClip {
	return {
		asset: {
			type: "luma",
			src: "https://example.com/luma-a.mp4"
		},
		start: 0,
		length: 5
	} as ResolvedClip;
}

function createVideoTexture(width: number, height: number, duration = 8) {
	const resource = {
		volume: 1,
		duration,
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

function createHtmlVideoTexture(width: number, height: number, duration = 8, initialReadyState = 0) {
	const video = document.createElement("video");
	let readyState = initialReadyState;

	Object.defineProperties(video, {
		readyState: { configurable: true, get: () => readyState },
		duration: { configurable: true, get: () => duration },
		pause: { configurable: true, value: jest.fn() },
		play: { configurable: true, value: jest.fn().mockResolvedValue(undefined) },
		load: { configurable: true, value: jest.fn() }
	});

	return {
		video,
		texture: new pixi.Texture({
			source: new pixi.VideoSource({ resource: video }),
			width,
			height
		} as ConstructorParameters<typeof pixi.Texture>[0]),
		setReadyState: (value: number) => {
			readyState = value;
		}
	};
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

class TimingStatePlayer extends Player {
	constructor(edit: ReturnType<typeof createEdit>, clip: ResolvedClip) {
		super(edit as never, clip, PlayerType.Image);
	}

	public beginTimingLoad(): number {
		return this.beginMediaTimingLoad();
	}

	public completeTimingLoad(revision: number, duration: number): void {
		this.completeMediaTimingLoad(revision, sec(duration));
	}

	public override getSize(): { width: number; height: number } {
		return this.edit.size;
	}
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

		const loading = player.load();
		expect(player.getMediaTimingState()).toEqual({
			status: "pending",
			asset: { type: "image", src: "https://example.com/missing.png" }
		});
		await loading;

		expect(mockCreatePlaceholderGraphic).toHaveBeenCalledWith(400, 300);
		expect(edit.assetLoader.rejectAsset).not.toHaveBeenCalled();
		expect(player.getSize()).toEqual({ width: 400, height: 300 });
		expect(player.getContentSize()).toEqual({ width: 400, height: 300 });
		expect(Number.isFinite(player.getScale())).toBe(true);
		expect(player.getContentContainer().children).toHaveLength(1);
		expect((player.getContentContainer().children[0] as { __placeholder?: boolean }).__placeholder).toBe(true);
		expect(player.getMediaTimingState()).toEqual({
			status: "ready",
			asset: { type: "image", src: "https://example.com/missing.png" },
			duration: null
		});
	});

	it("routes a mislabeled GIF through the bounded decoder and publishes its cycle duration", async () => {
		const edit = createEdit();
		const frameTexture = new pixi.Texture({ width: 2, height: 2 } as ConstructorParameters<typeof pixi.Texture>[0]);
		edit.assetLoader.isGif.mockResolvedValueOnce(true);
		edit.assetLoader.loadGif.mockResolvedValueOnce({
			totalFrames: 2,
			duration: 2400,
			frames: [
				{ start: 0, end: 1200, texture: frameTexture },
				{ start: 1200, end: 2400, texture: frameTexture }
			],
			frameIndexAt: jest.fn().mockReturnValue(0)
		});

		const player = new ImagePlayer(edit as never, createImageClip());
		await player.load();

		expect(edit.assetLoader.isGif).toHaveBeenCalledWith("https://example.com/missing.png", "https://example.com/missing.png?x-cors=1");
		expect(edit.assetLoader.load).not.toHaveBeenCalled();
		expect(edit.assetLoader.loadGif).toHaveBeenCalledTimes(1);
		expect(player.getMediaTimingState()).toEqual({
			status: "ready",
			asset: { type: "image", src: "https://example.com/missing.png" },
			duration: 2.4
		});
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
		expect(player.getMediaTimingState()).toEqual({
			status: "ready",
			asset: { type: "video", src: "https://example.com/video.mp4" },
			duration: null
		});

		await player.reloadAsset();

		expect(player.getContentContainer().children).toHaveLength(1);
		expect((player.getContentContainer().children[0] as { __placeholder?: boolean }).__placeholder).not.toBe(true);
		expect(player.getSize()).toEqual({ width: 1280, height: 720 });
		expect(Number.isFinite(player.getScale())).toBe(true);
		expect(player.getMediaTimingState()).toEqual({
			status: "ready",
			asset: { type: "video", src: "https://example.com/video.mp4" },
			duration: 8
		});
	});

	it("ignores a stale video reload failure after the current source succeeds", async () => {
		const edit = createEdit();
		const staleLoad = createDeferred<never>();
		const currentTexture = createVideoTexture(1920, 1080, 12);
		edit.assetLoader.loadVideoUnique.mockReturnValueOnce(staleLoad.promise).mockResolvedValueOnce(currentTexture);
		const player = new VideoPlayer(edit as never, createVideoClip());

		const staleReload = player.reloadAsset();
		player.clipConfiguration.asset = { type: "video", src: "https://example.com/current.mp4" };
		await player.reloadAsset();

		staleLoad.reject(new Error("stale request failed"));
		await staleReload;

		expect(mockCreatePlaceholderGraphic).not.toHaveBeenCalled();
		expect(player.getContentContainer().children).toHaveLength(1);
		expect((player.getContentContainer().children[0] as { __placeholder?: boolean }).__placeholder).not.toBe(true);
		expect(player.getSize()).toEqual({ width: 1920, height: 1080 });
		expect(player.getMediaTimingState()).toEqual({
			status: "ready",
			asset: { type: "video", src: "https://example.com/current.mp4" },
			duration: 12
		});
	});

	it("keeps video updates suppressed when a stale reload fails before the current reload settles", async () => {
		const edit = createEdit();
		const staleLoad = createDeferred<never>();
		const currentLoad = createDeferred<ReturnType<typeof createVideoTexture>>();
		edit.assetLoader.loadVideoUnique.mockReturnValueOnce(staleLoad.promise).mockReturnValueOnce(currentLoad.promise);
		const player = new VideoPlayer(edit as never, createVideoClip());

		const staleReload = player.reloadAsset();
		player.clipConfiguration.asset = { type: "video", src: "https://example.com/current.mp4" };
		const currentReload = player.reloadAsset();

		staleLoad.reject(new Error("stale request failed"));
		await staleReload;

		// @ts-expect-error - private state is asserted to guard the async reload contract
		expect(player.skipVideoUpdate).toBe(true);
		expect(mockCreatePlaceholderGraphic).not.toHaveBeenCalled();

		currentLoad.resolve(createVideoTexture(1280, 720, 6));
		await currentReload;

		// @ts-expect-error - private state is asserted to guard the async reload contract
		expect(player.skipVideoUpdate).toBe(false);
	});

	it("waits for loadeddata from an HTML video and removes every readiness listener", async () => {
		const edit = createEdit();
		const pending = createHtmlVideoTexture(1920, 1080, 11);
		const removeListenerSpy = jest.spyOn(pending.video, "removeEventListener");
		edit.assetLoader.loadVideoUnique.mockResolvedValueOnce(pending.texture);
		const player = new VideoPlayer(edit as never, createVideoClip());

		const reload = player.reloadAsset();
		await Promise.resolve();
		expect(player.getContentContainer().children).toHaveLength(0);

		pending.setReadyState(HTMLMediaElement.HAVE_CURRENT_DATA);
		pending.video.dispatchEvent(new Event("loadeddata"));
		await reload;

		expect(removeListenerSpy.mock.calls.map(([event]) => event)).toEqual(expect.arrayContaining(["loadeddata", "error", "abort"]));
		expect(player.getContentContainer().children).toHaveLength(1);
		expect(player.getMediaTimingState()).toMatchObject({ status: "ready", duration: 11 });
	});

	it.each(["error", "abort"])("handles an HTML video %s event and removes every readiness listener", async eventName => {
		const edit = createEdit();
		const pending = createHtmlVideoTexture(1920, 1080);
		const removeListenerSpy = jest.spyOn(pending.video, "removeEventListener");
		edit.assetLoader.loadVideoUnique.mockResolvedValueOnce(pending.texture);
		const player = new VideoPlayer(edit as never, createVideoClip());

		const reload = player.reloadAsset();
		await Promise.resolve();
		pending.video.dispatchEvent(new Event(eventName));
		await reload;

		expect(removeListenerSpy.mock.calls.map(([event]) => event)).toEqual(expect.arrayContaining(["loadeddata", "error", "abort"]));
		expect(pending.texture.destroy).toHaveBeenCalledWith(true);
		expect(player.getContentContainer().children).toHaveLength(1);
		expect((player.getContentContainer().children[0] as { __placeholder?: boolean }).__placeholder).toBe(true);
		expect(player.getMediaTimingState()).toMatchObject({ status: "ready", duration: null });
	});

	it("cancels an HTML video readiness wait when a newer reload starts", async () => {
		const edit = createEdit();
		const stale = createHtmlVideoTexture(640, 360);
		const current = createHtmlVideoTexture(1920, 1080, 12, HTMLMediaElement.HAVE_CURRENT_DATA);
		const removeListenerSpy = jest.spyOn(stale.video, "removeEventListener");
		edit.assetLoader.loadVideoUnique.mockResolvedValueOnce(stale.texture).mockResolvedValueOnce(current.texture);
		const player = new VideoPlayer(edit as never, createVideoClip());

		const staleReload = player.reloadAsset();
		await Promise.resolve();
		player.clipConfiguration.asset = { type: "video", src: "https://example.com/current.mp4" };
		const currentReload = player.reloadAsset();
		await Promise.all([staleReload, currentReload]);

		expect(removeListenerSpy.mock.calls.map(([event]) => event)).toEqual(expect.arrayContaining(["loadeddata", "error", "abort"]));
		expect(stale.texture.destroy).toHaveBeenCalledWith(true);
		expect(current.texture.destroy).not.toHaveBeenCalled();
		expect(player.getContentContainer().children).toHaveLength(1);
		expect(player.getSize()).toEqual({ width: 1920, height: 1080 });
	});

	it("rejects an HTML video generation superseded after loadeddata resolves", async () => {
		const edit = createEdit();
		const stale = createHtmlVideoTexture(640, 360);
		const current = createHtmlVideoTexture(1280, 720, 6, HTMLMediaElement.HAVE_CURRENT_DATA);
		edit.assetLoader.loadVideoUnique.mockResolvedValueOnce(stale.texture).mockResolvedValueOnce(current.texture);
		const player = new VideoPlayer(edit as never, createVideoClip());

		const staleReload = player.reloadAsset();
		await Promise.resolve();
		stale.setReadyState(HTMLMediaElement.HAVE_CURRENT_DATA);
		stale.video.dispatchEvent(new Event("loadeddata"));

		player.clipConfiguration.asset = { type: "video", src: "https://example.com/current.mp4" };
		const currentReload = player.reloadAsset();
		await Promise.all([staleReload, currentReload]);

		expect(stale.texture.destroy).toHaveBeenCalledWith(true);
		expect(current.texture.destroy).not.toHaveBeenCalled();
		expect(player.getContentContainer().children).toHaveLength(1);
		expect(player.getSize()).toEqual({ width: 1280, height: 720 });
		expect(player.getMediaTimingState()).toMatchObject({ status: "ready", duration: 6 });
	});

	it("reloads luma metadata and releases the resource actually replaced", async () => {
		const edit = createEdit();
		const firstTexture = createVideoTexture(1280, 720, 4);
		const secondTexture = createVideoTexture(1280, 720, 6);
		edit.assetLoader.load.mockResolvedValueOnce(firstTexture).mockResolvedValueOnce(secondTexture);
		const player = new LumaPlayer(edit as never, createLumaClip());

		await player.load();
		expect(player.getMediaTimingState()).toMatchObject({ status: "ready", duration: 4 });
		expect(player.getLoadedResourceIdentifier()).toBe("https://example.com/luma-a.mp4");

		player.clipConfiguration.asset = { type: "luma", src: "https://example.com/luma-b.mp4" };
		const reloading = player.reloadAsset();
		expect(player.getMediaTimingState()).toMatchObject({ status: "pending" });
		await reloading;

		expect(edit.assetLoader.release).toHaveBeenCalledWith("https://example.com/luma-a.mp4");
		expect(player.getLoadedResourceIdentifier()).toBe("https://example.com/luma-b.mp4");
		expect(player.getMediaTimingState()).toMatchObject({ status: "ready", duration: 6 });
	});

	it("seeks luma video from its trim offset", async () => {
		const edit = createEdit();
		edit.playbackTime = 1.25;
		const texture = createVideoTexture(1280, 720, 8);
		edit.assetLoader.load.mockResolvedValueOnce(texture);
		const clip = createLumaClip();
		clip.asset = { type: "luma", src: "https://example.com/luma.mp4", trim: 2 };
		const player = new LumaPlayer(edit as never, clip);

		await player.load();
		player.update(0, 0);

		expect(texture.source.resource.currentTime).toBe(3.25);
	});

	it("rejects stale metadata when an asset changes A to B to A", () => {
		const player = new TimingStatePlayer(createEdit(), createImageClip());
		const firstA = player.beginTimingLoad();
		player.clipConfiguration.asset = { type: "image", src: "https://example.com/b.png" };
		player.beginTimingLoad();
		player.clipConfiguration.asset = { type: "image", src: "https://example.com/missing.png" };
		const currentA = player.beginTimingLoad();

		player.completeTimingLoad(firstA, 9);
		expect(player.getMediaTimingState()).toMatchObject({ status: "pending" });

		player.completeTimingLoad(currentA, 2.5);
		expect(player.getMediaTimingState()).toMatchObject({ status: "ready", duration: 2.5 });
	});

	it("publishes a changed non-temporal asset through the base timing contract", async () => {
		const player = new TimingStatePlayer(createEdit(), createImageClip());
		player.clipConfiguration.asset = { type: "shape", shape: "rectangle", width: 100, height: 100 } as never;

		await player.reloadAsset();

		expect(player.getMediaTimingState()).toEqual({
			status: "ready",
			asset: { type: "shape", src: null },
			duration: null
		});
	});
});
