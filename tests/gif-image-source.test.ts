/** @jest-environment jsdom */

import { GifImageSource, isGifUrl } from "@loaders/gif-image-source";
import { GifSource as PixiGifSource } from "pixi.js/gif";

jest.mock("pixi.js", () => ({
	CanvasSource: jest.fn(function CanvasSource(this: { resource: HTMLCanvasElement }, { resource }: { resource: HTMLCanvasElement }) {
		this.resource = resource;
	}),
	Texture: jest.fn(function Texture(this: { source: unknown; destroy: jest.Mock }, { source }: { source: unknown }) {
		this.source = source;
		this.destroy = jest.fn();
	})
}));

jest.mock("pixi.js/gif", () => ({ GifSource: { from: jest.fn() } }));

const pixiGifFrom = PixiGifSource.from as jest.MockedFunction<typeof PixiGifSource.from>;
const TWO_FRAME_GIF = "R0lGODlhAgACAPAAAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAAAAAACwAAAAAAgACAAACAoRRACH5BAAKAAAALAAAAAACAAIAgAAA/wAAAAIChFEAOw==";

function decodeBase64(value: string): ArrayBuffer {
	return Uint8Array.from(atob(value), character => character.charCodeAt(0)).buffer;
}

function appendUint16(bytes: number[], value: number): void {
	bytes.push(value % 256, Math.floor(value / 256) % 256);
}

function createGif(width: number, height: number, frameCount: number): ArrayBuffer {
	const bytes = [71, 73, 70, 56, 57, 97];
	appendUint16(bytes, width);
	appendUint16(bytes, height);
	bytes.push(0, 0, 0);
	for (let frame = 0; frame < frameCount; frame += 1) {
		bytes.push(0x2c, 0, 0, 0, 0);
		appendUint16(bytes, width);
		appendUint16(bytes, height);
		bytes.push(0, 2, 2, 0x44, 0x01, 0);
	}
	bytes.push(0x3b);
	return Uint8Array.from(bytes).buffer;
}

function createDecodedSource(): PixiGifSource & { destroy: jest.Mock } {
	const frames = [
		{ start: 0, end: 40, texture: { source: { resource: document.createElement("canvas") } } },
		{ start: 40, end: 140, texture: { source: { resource: document.createElement("canvas") } } }
	];
	return {
		width: 2,
		height: 2,
		duration: 140,
		frames,
		textures: frames.map(frame => frame.texture),
		totalFrames: frames.length,
		destroy: jest.fn()
	} as unknown as PixiGifSource & { destroy: jest.Mock };
}

describe("GifImageSource", () => {
	beforeEach(() => pixiGifFrom.mockReset());

	it("classifies GIF paths and data URLs without probing ordinary images", () => {
		expect(isGifUrl("https://example.com/animation.GIF?token=1")).toBe(true);
		expect(isGifUrl("data:image/gif;base64,R0lGODlh")).toBe(true);
		expect(isGifUrl("https://example.com/photo.png")).toBe(false);
	});

	it("uses Pixi decoding and selects frames from looping playhead time", () => {
		const decoded = createDecodedSource();
		pixiGifFrom.mockReturnValue(decoded);

		const source = GifImageSource.from(decodeBase64(TWO_FRAME_GIF));

		expect(source.frameIndexAt(39)).toBe(0);
		expect(source.frameIndexAt(40)).toBe(1);
		expect(source.frameIndexAt(180)).toBe(1);
		expect(decoded.destroy).toHaveBeenCalledTimes(1);
	});

	it("rejects an eager decode that exceeds the browser memory budget", () => {
		expect(() => GifImageSource.from(createGif(4096, 4096, 2))).toThrow(/decoded size/);
		expect(pixiGifFrom).not.toHaveBeenCalled();
	});
});
