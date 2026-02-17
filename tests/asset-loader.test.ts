/**
 * @jest-environment jsdom
 *
 * AssetLoader Tests
 *
 * Tests for the AssetLoader class, particularly the video loading behavior
 * that ensures each VideoPlayer gets an independent HTMLVideoElement.
 */

import { AssetLoader } from "@loaders/asset-loader";

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
