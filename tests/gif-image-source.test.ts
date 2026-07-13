/** @jest-environment jsdom */

import {
	GIF_DECODE_LIMITS,
	GifImageSource,
	getAnimatedGifDurationMs,
	inspectGif,
	readGifResponse,
	selectGifFrame,
	validateGifContentLength,
	validateGifCycleDuration
} from "@loaders/gif-image-source";
import { GifSource as PixiGifSource } from "pixi.js/gif";
import * as pixi from "pixi.js";

jest.mock("pixi.js", () => {
	const CanvasSource = jest.fn(function MockCanvasSource(this: { resource: HTMLCanvasElement }, { resource }: { resource: HTMLCanvasElement }): void {
		this.resource = resource;
	});
	const Texture = jest.fn(function MockTexture(this: { source: unknown; destroy: jest.Mock }, { source }: { source: unknown }): void {
		this.source = source;
		this.destroy = jest.fn();
	});

	return { CanvasSource, Texture };
});

jest.mock("pixi.js/gif", () => ({
	GifSource: { from: jest.fn() }
}));

const pixiGifFrom = PixiGifSource.from as jest.MockedFunction<typeof PixiGifSource.from>;
const TWO_FRAME_GIF = "R0lGODlhAgACAPAAAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAAAAAACwAAAAAAgACAAACAoRRACH5BAAKAAAALAAAAAACAAIAgAAA/wAAAAIChFEAOw==";
const MISSING_SECOND_GCE_GIF = "R0lGODlhAgACAPAAAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAMgAAACwAAAAAAgACAAACAoRRACwAAAAAAgACAIAAAP8AAAACAoRRADs=";
const GCE_BEFORE_COMMENTS_GIF =
	"R0lGODlhAwABAPAAAP8AAAAA/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQIMgD/ACH+AUEAIf4BQgAsAAAAAAMAAQAAAgKECwAh+QQAMgD/ACwBAAAAAQABAAACAkwBADs=";

function decodeBase64(base64: string): ArrayBuffer {
	return Uint8Array.from(atob(base64), character => character.charCodeAt(0)).buffer;
}

function appendUint16(bytes: number[], value: number): void {
	bytes.push(value % 256, Math.floor(value / 256) % 256);
}

function createGif(
	width: number,
	height: number,
	frameCount: number,
	frameDescriptor: { left?: number; top?: number; width?: number; height?: number } = {}
): ArrayBuffer {
	const bytes = [71, 73, 70, 56, 57, 97];
	appendUint16(bytes, width);
	appendUint16(bytes, height);
	bytes.push(0, 0, 0);

	for (let frame = 0; frame < frameCount; frame += 1) {
		bytes.push(0x2c);
		appendUint16(bytes, frameDescriptor.left ?? 0);
		appendUint16(bytes, frameDescriptor.top ?? 0);
		appendUint16(bytes, frameDescriptor.width ?? width);
		appendUint16(bytes, frameDescriptor.height ?? height);
		bytes.push(0, 2, 2, 0x44, 0x01, 0);
	}
	bytes.push(0x3b);
	return Uint8Array.from(bytes).buffer;
}

function createDecodedSource(width: number, height: number, frameDurations: number[]): PixiGifSource & { destroy: jest.Mock } {
	let time = 0;
	const frames = frameDurations.map(duration => {
		const start = time;
		time += duration;
		return {
			start,
			end: time,
			texture: { source: { resource: document.createElement("canvas") } }
		};
	});
	return {
		width,
		height,
		duration: time,
		frames,
		textures: frames.map(frame => frame.texture),
		totalFrames: frames.length,
		destroy: jest.fn()
	} as unknown as PixiGifSource & { destroy: jest.Mock };
}

describe("GIF decode safeguards", () => {
	it("calculates Pixi's retained frames and eager patch allocation before decoding", () => {
		expect(inspectGif(createGif(320, 180, 20))).toEqual({
			width: 320,
			height: 180,
			frameCount: 20,
			decodedBytes: 320 * 180 * 45 * 4
		});
	});

	it("rejects decoded GIFs over the allocation budget", () => {
		expect(() => inspectGif(createGif(4096, 4096, 5))).toThrow(/decoded frames exceed/);
	});

	it("rejects excessive dimensions and frame counts", () => {
		expect(() => inspectGif(createGif(GIF_DECODE_LIMITS.maxDimension + 1, 1, 1))).toThrow(/dimensions exceed/);
		expect(() => inspectGif(createGif(1, 1, GIF_DECODE_LIMITS.maxFrames + 1))).toThrow(/frame limit/);
	});

	it("rejects a frame descriptor outside the logical screen before decoding", () => {
		expect(() => inspectGif(createGif(1, 1, 1, { width: 65535 }))).toThrow(/frame descriptor/);
	});

	it("rejects malformed and truncated container data before Pixi sees it", () => {
		expect(() => inspectGif(Uint8Array.from([71, 73, 70]).buffer)).toThrow(/truncated/);
		expect(() => inspectGif(Uint8Array.from([78, 79, 84, 71, 73, 70, 56, 57, 97]).buffer)).toThrow(/valid GIF signature/);
	});

	it("rejects oversized Content-Length values before downloading", () => {
		expect(() => validateGifContentLength(String(GIF_DECODE_LIMITS.maxCompressedBytes + 1))).toThrow(/compressed-size limit/);
		expect(() => validateGifContentLength(null)).not.toThrow();
	});

	it("cancels an oversized response before reading its body", async () => {
		const cancel = jest.fn().mockResolvedValue(undefined);
		const response = {
			headers: new Headers({ "content-length": String(GIF_DECODE_LIMITS.maxCompressedBytes + 1) }),
			body: { cancel }
		} as unknown as Response;

		await expect(readGifResponse(response)).rejects.toThrow(/compressed-size limit/);
		expect(cancel).toHaveBeenCalledTimes(1);
	});

	it("cancels a chunked response as soon as it crosses the compressed limit", async () => {
		const cancel = jest.fn().mockResolvedValue(undefined);
		const releaseLock = jest.fn();
		const read = jest
			.fn()
			.mockResolvedValueOnce({ done: false, value: { byteLength: GIF_DECODE_LIMITS.maxCompressedBytes + 1 } })
			.mockResolvedValueOnce({ done: true });
		const response = {
			headers: new Headers(),
			body: { getReader: () => ({ read, cancel, releaseLock }) }
		} as unknown as Response;

		await expect(readGifResponse(response)).rejects.toThrow(/compressed-size limit/);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});

	it("rejects cycles longer than the backend's five-minute limit", () => {
		expect(() => validateGifCycleDuration(GIF_DECODE_LIMITS.maxCycleDurationMs + 1)).toThrow(/cycle exceeds/);
		expect(() => validateGifCycleDuration(GIF_DECODE_LIMITS.maxCycleDurationMs)).not.toThrow();
	});
});

describe("GIF playhead frame selection", () => {
	const frames = [
		{ start: 0, end: 40 },
		{ start: 40, end: 140 },
		{ start: 140, end: 200 }
	];

	it("honours variable frame delays", () => {
		expect(selectGifFrame(frames, 39, 200)).toBe(0);
		expect(selectGifFrame(frames, 40, 200)).toBe(1);
		expect(selectGifFrame(frames, 139, 200)).toBe(1);
		expect(selectGifFrame(frames, 140, 200)).toBe(2);
	});

	it("repeats deterministically for clips longer than one cycle", () => {
		expect(selectGifFrame(frames, 240, 200)).toBe(1);
		expect(selectGifFrame(frames, 400, 200)).toBe(0);
	});
});

describe("GIF intrinsic duration", () => {
	it("uses one full cycle only for animated GIFs", () => {
		expect(getAnimatedGifDurationMs({ totalFrames: 3, duration: 2400 })).toBe(2400);
		expect(getAnimatedGifDurationMs({ totalFrames: 1, duration: 100 })).toBeNull();
	});
});

describe("Pixi GIF source adapter", () => {
	beforeEach(() => {
		pixiGifFrom.mockReset();
	});

	it("delegates decoding of a valid two-frame GIF to Pixi", () => {
		const decoded = createDecodedSource(2, 2, [100, 100]);
		const decodedTextures = decoded.frames.map(frame => frame.texture);
		const decodedCanvases = decoded.frames.map(frame => frame.texture.source.resource);
		pixiGifFrom.mockReturnValue(decoded);
		const source = GifImageSource.from(decodeBase64(TWO_FRAME_GIF));

		expect(source.totalFrames).toBe(2);
		expect(source.width).toBe(2);
		expect(source.height).toBe(2);
		expect(source.duration).toBe(200);
		expect(source.frameIndexAt(source.frames[0].end)).toBe(1);
		expect(source.frames.every(frame => frame.texture instanceof pixi.Texture)).toBe(true);
		expect(source.frames.every(frame => frame.texture.source instanceof pixi.CanvasSource)).toBe(true);
		expect(source.frames.every((frame, index) => frame.texture !== decodedTextures[index])).toBe(true);
		expect(source.frames.map(frame => frame.texture.source.resource)).toEqual(decodedCanvases);
		expect(decoded.destroy).toHaveBeenCalledTimes(1);
		expect(pixiGifFrom).toHaveBeenCalledWith(expect.any(ArrayBuffer), { fps: 10 });
	});

	it("adds a default control extension instead of inheriting an earlier frame delay", () => {
		const buffer = decodeBase64(MISSING_SECOND_GCE_GIF);
		pixiGifFrom.mockReturnValue(createDecodedSource(2, 2, [500, 100]));
		const source = GifImageSource.from(buffer);
		const normalizedBuffer = pixiGifFrom.mock.calls[0][0];

		expect(normalizedBuffer.byteLength).toBe(buffer.byteLength + 8);
		expect(source.duration).toBe(600);
		expect(source.frames.map(frame => frame.end - frame.start)).toEqual([500, 100]);
	});

	it("preserves a control extension across intervening comment blocks", () => {
		const buffer = decodeBase64(GCE_BEFORE_COMMENTS_GIF);
		pixiGifFrom.mockReturnValue(createDecodedSource(3, 1, [500, 500]));
		const source = GifImageSource.from(buffer);
		const normalizedBuffer = pixiGifFrom.mock.calls[0][0];

		expect(normalizedBuffer.byteLength).toBe(buffer.byteLength);
		expect(source.duration).toBe(1000);
	});

	it("destroys a Pixi source whose decoded metadata differs from preflight", () => {
		const decoded = createDecodedSource(3, 2, [100, 100]);
		pixiGifFrom.mockReturnValue(decoded);

		expect(() => GifImageSource.from(decodeBase64(TWO_FRAME_GIF))).toThrow(/metadata changed/);
		expect(decoded.destroy).toHaveBeenCalledTimes(1);
	});

	it("transfers frame ownership and destroys each host texture exactly once", () => {
		const decoded = createDecodedSource(2, 2, [100, 100]);
		pixiGifFrom.mockReturnValue(decoded);
		const source = GifImageSource.from(decodeBase64(TWO_FRAME_GIF));
		const textureDestroyers = source.frames.map(frame => jest.spyOn(frame.texture, "destroy"));

		source.destroy();
		source.destroy();
		expect(decoded.destroy).toHaveBeenCalledTimes(1);
		textureDestroyers.forEach(destroy => {
			expect(destroy).toHaveBeenCalledTimes(1);
			expect(destroy).toHaveBeenCalledWith(true);
		});
	});
});
