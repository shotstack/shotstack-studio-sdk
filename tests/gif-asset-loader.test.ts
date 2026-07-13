/** @jest-environment jsdom */

import { AssetLoader } from "@loaders/asset-loader";
import { GifImageSource } from "@loaders/gif-image-source";

jest.mock("pixi.js", () => ({
	Assets: {
		setPreferences: jest.fn(),
		load: jest.fn(),
		unload: jest.fn(),
		cache: { has: jest.fn().mockReturnValue(false) }
	}
}));

jest.mock("@loaders/gif-image-source", () => ({
	GifImageSource: { fetch: jest.fn() }
}));

const fetchGif = GifImageSource.fetch as jest.MockedFunction<typeof GifImageSource.fetch>;

describe("AssetLoader GIF support", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("detects uppercase GIF URLs without a network probe", async () => {
		const fetchMock = jest.fn();
		global.fetch = fetchMock;
		const loader = new AssetLoader();

		await expect(loader.isGif("https://example.com/ANIMATION.GIF?token=abc")).resolves.toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("detects extensionless GIF URLs by signature", async () => {
		const cancel = jest.fn().mockResolvedValue(undefined);
		const releaseLock = jest.fn();
		const read = jest.fn().mockResolvedValueOnce({
			done: false,
			value: Uint8Array.from("GIF89a", character => character.charCodeAt(0))
		});
		const fetchMock = jest.fn().mockResolvedValue({ ok: true, body: { getReader: () => ({ read, cancel, releaseLock }) } });
		global.fetch = fetchMock;
		const loader = new AssetLoader();

		await expect(loader.isGif("https://example.com/assets/123")).resolves.toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/assets/123?x-cors=1",
			expect.objectContaining({ headers: { Range: "bytes=0-5" }, signal: expect.any(AbortSignal) })
		);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});

	it("classifies a complete non-GIF signature as a static image", async () => {
		const cancel = jest.fn().mockResolvedValue(undefined);
		const releaseLock = jest.fn();
		const read = jest.fn().mockResolvedValueOnce({ done: false, value: Uint8Array.of(137, 80, 78, 71, 13, 10) });
		global.fetch = jest.fn().mockResolvedValue({ ok: true, body: { getReader: () => ({ read, cancel, releaseLock }) } });
		const loader = new AssetLoader();

		await expect(loader.isGif("https://example.com/image.png")).resolves.toBe(false);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});

	it("rejects an inconclusive signature probe instead of bypassing GIF safeguards", async () => {
		const cancel = jest.fn().mockResolvedValue(undefined);
		const releaseLock = jest.fn();
		const read = jest.fn().mockResolvedValueOnce({ done: true });
		global.fetch = jest.fn().mockResolvedValue({ ok: true, body: { getReader: () => ({ read, cancel, releaseLock }) } });
		const loader = new AssetLoader();

		await expect(loader.isGif("https://example.com/assets/incomplete")).rejects.toThrow(/ended before its signature/);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});

	it("trusts GIF magic over a non-GIF file extension", async () => {
		const cancel = jest.fn().mockResolvedValue(undefined);
		const releaseLock = jest.fn();
		const read = jest.fn().mockResolvedValueOnce({
			done: false,
			value: Uint8Array.from("GIF89a", character => character.charCodeAt(0))
		});
		global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, body: { getReader: () => ({ read, cancel, releaseLock }) } });
		const loader = new AssetLoader();

		await expect(loader.isGif("https://example.com/mislabeled.png")).resolves.toBe(true);
		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(global.fetch).toHaveBeenCalledWith(
			"https://example.com/mislabeled.png?x-cors=1",
			expect.objectContaining({ headers: { Range: "bytes=0-5" }, signal: expect.any(AbortSignal) })
		);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});

	it("shares decoded sources and destroys them only after the last release", async () => {
		const source = {
			destroy: jest.fn(),
			getFirstFrameDataUrl: jest.fn().mockReturnValue("data:image/png;base64,frame"),
			width: 320,
			height: 180
		} as unknown as GifImageSource;
		fetchGif.mockResolvedValue(source);
		const loader = new AssetLoader();
		const identifier = "https://example.com/shared.gif";

		const [first, second] = await Promise.all([loader.loadGif(identifier), loader.loadGif(identifier)]);
		expect(first).toBe(source);
		expect(second).toBe(source);
		expect(fetchGif).toHaveBeenCalledTimes(1);

		loader.release(identifier);
		expect(source.destroy).not.toHaveBeenCalled();

		loader.release(identifier);
		await Promise.resolve();
		expect(source.destroy).toHaveBeenCalledTimes(1);
	});

	it("can generate a frozen thumbnail before a Player acquires the source", async () => {
		const source = {
			destroy: jest.fn(),
			getFirstFrameDataUrl: jest.fn().mockReturnValue("data:image/png;base64,frame"),
			width: 320,
			height: 180
		} as unknown as GifImageSource;
		fetchGif.mockResolvedValue(source);
		const loader = new AssetLoader();

		await expect(loader.getGifThumbnail("https://example.com/thumbnail.gif")).resolves.toEqual({
			isGif: true,
			dataUrl: "data:image/png;base64,frame",
			width: 320,
			height: 180
		});
		expect(fetchGif).toHaveBeenCalledTimes(1);
		await Promise.resolve();
		expect(source.destroy).toHaveBeenCalledTimes(1);
	});
});
