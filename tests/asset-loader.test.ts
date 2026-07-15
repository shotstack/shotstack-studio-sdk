/**
 * @jest-environment jsdom
 *
 * AssetLoader Tests
 *
 * Tests for the AssetLoader class, particularly the video loading behavior
 * that ensures each VideoPlayer gets an independent HTMLVideoElement.
 */

import { AssetLoader } from "@loaders/asset-loader";
import { GifImageSource } from "@loaders/gif-image-source";
import * as pixi from "pixi.js";

jest.mock("@loaders/gif-image-source", () => ({
	GifImageSource: { fetch: jest.fn() }
}));

const mockGifFetch = GifImageSource.fetch as jest.Mock;

// Mock pixi.js VideoSource and Texture
jest.mock("pixi.js", () => ({
	VideoSource: jest.fn().mockImplementation(({ resource }) => ({
		resource,
		alphaMode: "no-premultiply-alpha"
	})),
	Texture: jest.fn().mockImplementation(({ source }) => ({
		source,
		destroy: jest.fn()
	})),
	Assets: {
		setPreferences: jest.fn(),
		load: jest.fn(),
		unload: jest.fn(),
		cache: { has: jest.fn().mockReturnValue(false) }
	}
}));

describe("AssetLoader", () => {
	const pixiMock = pixi as unknown as {
		Assets: {
			load: jest.Mock;
			unload: jest.Mock;
			cache: { has: jest.Mock };
		};
	};

	beforeEach(() => {
		jest.clearAllMocks();
		pixiMock.Assets.unload.mockResolvedValue(undefined);
		pixiMock.Assets.cache.has.mockReturnValue(false);
	});

	describe("load", () => {
		it.each([null, undefined])("treats %p Pixi results as failed and cleans up state", async resolvedAsset => {
			const loader = new AssetLoader();
			const url = "https://example.com/missing.png";
			const loadOptions = { src: url };

			pixiMock.Assets.load.mockResolvedValueOnce(resolvedAsset);

			const result = await loader.load(url, loadOptions);

			expect(result).toBeNull();
			expect(loader.loadTracker.registry[url]).toEqual({ progress: 1, status: "failed" });
			expect(pixiMock.Assets.unload).toHaveBeenCalledWith(url);
		});

		it("unloads an unreferenced asset after its pending load settles", async () => {
			const loader = new AssetLoader();
			const url = "https://example.com/pending.png";
			let resolveAsset!: (asset: object) => void;
			pixiMock.Assets.load.mockReturnValueOnce(
				new Promise(resolve => {
					resolveAsset = resolve;
				})
			);

			const load = loader.load(url, { src: url });
			loader.release(url);
			pixiMock.Assets.cache.has.mockReturnValue(true);
			resolveAsset({});
			await load;
			await Promise.resolve();

			expect(pixiMock.Assets.unload).toHaveBeenCalledWith(url);
		});
	});

	describe("loadGif", () => {
		it("shares one decoded source until the final clip releases it", async () => {
			const source = { destroy: jest.fn() };
			mockGifFetch.mockResolvedValue(source);
			const loader = new AssetLoader();
			const src = "https://example.com/animation.gif";

			const [first, second] = await Promise.all([loader.loadGif(src, `${src}?x-cors=1`), loader.loadGif(src, `${src}?x-cors=1`)]);

			expect(first).toBe(source);
			expect(second).toBe(source);
			expect(mockGifFetch).toHaveBeenCalledTimes(1);
			loader.release(src);
			expect(source.destroy).not.toHaveBeenCalled();
			loader.release(src);
			await Promise.resolve();
			expect(source.destroy).toHaveBeenCalledTimes(1);
		});
	});

	describe("loadVideoUnique", () => {
		/**
		 * Regression test for video playback glitch with overlapping clips.
		 *
		 * Bug: When two clips used the same video URL, PixiJS's caching returned
		 * the same texture (and thus same HTMLVideoElement). This caused:
		 * 1. Seek conflicts during overlap (both players fighting over currentTime)
		 * 2. pause() on one clip paused the shared element, stopping all clips
		 *
		 * Fix: loadVideoUnique() creates a fresh HTMLVideoElement per call,
		 * ensuring each VideoPlayer has independent playback control.
		 */
		it("creates unique video elements for same URL", async () => {
			const loader = new AssetLoader();
			const url = "https://example.com/video.mp4";
			const loadOptions = { src: url, data: { autoPlay: false, muted: false } };

			// Track created video elements
			const createdVideos: HTMLVideoElement[] = [];
			const origCreate = document.createElement.bind(document);

			jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
				const el = origCreate(tag);
				if (tag === "video") {
					createdVideos.push(el as HTMLVideoElement);
					// Simulate loadedmetadata event for the Promise to resolve
					setTimeout(() => {
						el.dispatchEvent(new Event("loadedmetadata"));
					}, 0);
				}
				return el;
			});

			// Load same video twice
			const [texture1, texture2] = await Promise.all([loader.loadVideoUnique(url, loadOptions), loader.loadVideoUnique(url, loadOptions)]);

			// Should create 2 distinct video elements
			expect(createdVideos.length).toBe(2);
			expect(createdVideos[0]).not.toBe(createdVideos[1]);

			// Textures should exist
			expect(texture1).not.toBeNull();
			expect(texture2).not.toBeNull();

			// The textures should have different source resources (video elements)
			expect(texture1?.source.resource).not.toBe(texture2?.source.resource);
		});

		it("returns null on video load error", async () => {
			const loader = new AssetLoader();
			const url = "https://example.com/nonexistent.mp4";
			const loadOptions = { src: url };

			const origCreate = document.createElement.bind(document);

			jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
				const el = origCreate(tag);
				if (tag === "video") {
					// Simulate error event
					setTimeout(() => el.dispatchEvent(new Event("error")), 0);
				}
				return el;
			});

			const texture = await loader.loadVideoUnique(url, loadOptions);

			expect(texture).toBeNull();
			expect(loader.loadTracker.registry[url]?.status).toBe("failed");
		});

		it("does not use refCount system (each video is independent)", async () => {
			const loader = new AssetLoader();
			const url = "https://example.com/video.mp4";
			const loadOptions = { src: url };

			const incrementSpy = jest.spyOn(loader, "incrementRef");
			const decrementSpy = jest.spyOn(loader, "decrementRef");

			const origCreate = document.createElement.bind(document);
			jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
				const el = origCreate(tag);
				if (tag === "video") {
					setTimeout(() => el.dispatchEvent(new Event("loadedmetadata")), 0);
				}
				return el;
			});

			await loader.loadVideoUnique(url, loadOptions);

			// loadVideoUnique should NOT use refCounts - each video manages its own lifecycle
			expect(incrementSpy).not.toHaveBeenCalled();
			expect(decrementSpy).not.toHaveBeenCalled();
		});
	});
});
