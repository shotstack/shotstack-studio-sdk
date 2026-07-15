import * as pixi from "pixi.js";
import { GifSource as PixiGifSource } from "pixi.js/gif";

const MAX_COMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_DECODED_BYTES = 64 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const MAX_FRAMES = 1000;
const MAX_DURATION_MS = 300_000;
const DEFAULT_FRAME_DELAY_MS = 100;
const REQUEST_TIMEOUT_MS = 15_000;

export interface GifFrame {
	readonly start: number;
	readonly end: number;
	readonly texture: pixi.Texture<pixi.CanvasSource>;
}

function assertAvailable(bytes: Uint8Array, offset: number, length: number): void {
	if (!Number.isSafeInteger(length) || length < 0 || offset + length > bytes.length) {
		throw new Error("GIF data is truncated or malformed.");
	}
}

function inspectGif(buffer: ArrayBuffer): void {
	if (buffer.byteLength === 0 || buffer.byteLength > MAX_COMPRESSED_BYTES) {
		throw new Error("GIF compressed size is outside the supported range.");
	}

	const bytes = new Uint8Array(buffer);
	let offset = 0;
	const readByte = (): number => {
		assertAvailable(bytes, offset, 1);
		const value = bytes[offset];
		offset += 1;
		return value;
	};
	const readUint16 = (): number => readByte() + readByte() * 256;
	const skip = (length: number): void => {
		assertAvailable(bytes, offset, length);
		offset += length;
	};
	const skipSubBlocks = (): void => {
		for (;;) {
			const length = readByte();
			if (length === 0) return;
			skip(length);
		}
	};
	const colorTableSize = (packed: number): number => 3 * 2 ** ((packed % 8) + 1);

	assertAvailable(bytes, 0, 6);
	const signature = String.fromCharCode(...bytes.subarray(0, 6));
	if (signature !== "GIF87a" && signature !== "GIF89a") throw new Error("Invalid GIF signature.");
	offset = 6;

	const width = readUint16();
	const height = readUint16();
	const packed = readByte();
	skip(2);
	if (width === 0 || height === 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
		throw new Error("GIF dimensions are outside the supported range.");
	}
	if (packed >= 0x80) skip(colorTableSize(packed));

	const fullFrameBytes = width * height * 4;
	let frameCount = 0;
	let patchBytes = 0;
	let durationMs = 0;
	let nextDelayMs: number | null = null;
	let foundTrailer = false;

	while (offset < bytes.length) {
		const introducer = readByte();
		if (introducer === 0x3b) {
			foundTrailer = true;
			break;
		}

		if (introducer === 0x21) {
			const label = readByte();
			if (label === 0xf9) {
				if (readByte() !== 4) throw new Error("Malformed GIF control extension.");
				readByte();
				nextDelayMs = (readUint16() || 10) * 10;
				readByte();
				if (readByte() !== 0) throw new Error("Malformed GIF control extension.");
			} else {
				skipSubBlocks();
				if (label === 0x01) nextDelayMs = null;
			}
		} else if (introducer === 0x2c) {
			const left = readUint16();
			const top = readUint16();
			const frameWidth = readUint16();
			const frameHeight = readUint16();
			if (frameWidth === 0 || frameHeight === 0 || left + frameWidth > width || top + frameHeight > height) {
				throw new Error("GIF frame exceeds its logical screen.");
			}

			const framePacked = readByte();
			if (framePacked >= 0x80) skip(colorTableSize(framePacked));
			readByte();
			skipSubBlocks();

			frameCount += 1;
			patchBytes += frameWidth * frameHeight * 4;
			durationMs += nextDelayMs ?? DEFAULT_FRAME_DELAY_MS;
			nextDelayMs = null;
			const peakDecodedBytes = fullFrameBytes * (frameCount + 2) + patchBytes;
			if (frameCount > MAX_FRAMES || !Number.isSafeInteger(peakDecodedBytes) || peakDecodedBytes > MAX_DECODED_BYTES) {
				throw new Error("GIF decoded size is outside the supported range.");
			}
			if (durationMs > MAX_DURATION_MS) throw new Error("GIF duration is outside the supported range.");
		} else {
			throw new Error("Unsupported GIF block.");
		}
	}

	if (!foundTrailer || frameCount === 0) throw new Error("GIF has no complete image frames.");
}

async function readBoundedResponse(response: Response): Promise<ArrayBuffer> {
	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_COMPRESSED_BYTES) {
		await response.body?.cancel().catch(() => undefined);
		throw new Error("GIF compressed size is outside the supported range.");
	}
	if (!response.body) {
		const buffer = await response.arrayBuffer();
		if (buffer.byteLength > MAX_COMPRESSED_BYTES) throw new Error("GIF compressed size is outside the supported range.");
		return buffer;
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				size += value.byteLength;
				if (size > MAX_COMPRESSED_BYTES) throw new Error("GIF compressed size is outside the supported range.");
				chunks.push(value);
			}
		}
	} catch (error) {
		await reader.cancel(error).catch(() => undefined);
		throw error;
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes.buffer;
}

export function isGifUrl(src: string): boolean {
	if (/^data:image\/gif(?:;|,)/i.test(src)) return true;
	try {
		return new URL(src, typeof window === "undefined" ? "http://localhost" : window.location.origin).pathname.toLowerCase().endsWith(".gif");
	} catch {
		return false;
	}
}

export function appendCorsQuery(src: string): string {
	if (/^(?:data|blob):/i.test(src)) return src;
	return `${src}${src.includes("?") ? "&" : "?"}x-cors=1`;
}

export class GifImageSource {
	public readonly width: number;
	public readonly height: number;
	public readonly duration: number;
	public readonly frames: GifFrame[];

	private constructor(source: PixiGifSource) {
		this.width = source.width;
		this.height = source.height;
		this.duration = source.duration;
		this.frames = source.frames.map(frame => {
			const { resource } = frame.texture.source;
			if (!resource) throw new Error("GIF decoder returned an empty frame.");
			return {
				start: frame.start,
				end: frame.end,
				texture: new pixi.Texture({ source: new pixi.CanvasSource({ resource }) })
			};
		});
	}

	public static async fetch(url: string): Promise<GifImageSource> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(url, { signal: controller.signal });
			if (!response.ok) throw new Error(`GIF request failed with HTTP ${response.status}.`);
			return GifImageSource.from(await readBoundedResponse(response));
		} finally {
			clearTimeout(timeout);
		}
	}

	public static from(buffer: ArrayBuffer): GifImageSource {
		inspectGif(buffer);
		const source = PixiGifSource.from(buffer, { fps: 10 });
		try {
			if (!Number.isFinite(source.duration) || source.duration <= 0 || source.duration > MAX_DURATION_MS) {
				throw new Error("GIF duration is outside the supported range.");
			}
			return new GifImageSource(source);
		} finally {
			source.destroy();
		}
	}

	public frameIndexAt(timeMs: number): number {
		const localTime = ((timeMs % this.duration) + this.duration) % this.duration;
		const index = this.frames.findIndex(frame => frame.start <= localTime && frame.end > localTime);
		return index < 0 ? this.frames.length - 1 : index;
	}

	public destroy(): void {
		for (const frame of this.frames) frame.texture.destroy(true);
		this.frames.length = 0;
	}
}
