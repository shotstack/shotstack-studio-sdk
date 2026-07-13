import * as pixi from "pixi.js";
import { GifSource as PixiGifSource } from "pixi.js/gif";

export const GIF_DECODE_LIMITS = Object.freeze({
	maxCompressedBytes: 50 * 1024 * 1024,
	maxDecodedBytes: 128 * 1024 * 1024,
	maxDimension: 4096,
	maxFrames: 1000,
	maxCycleDurationMs: 300_000
});

export interface GifFrameTexture {
	readonly start: number;
	readonly end: number;
	readonly texture: pixi.Texture<pixi.CanvasSource>;
}

export interface GifInspection {
	readonly width: number;
	readonly height: number;
	readonly frameCount: number;
	readonly decodedBytes: number;
}

interface GifScanResult {
	readonly inspection: GifInspection;
	readonly durationMs: number;
	readonly imagesWithoutControlExtension: number[];
}

const GIF_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_FRAME_DELAY_MS = 100;
const DEFAULT_GRAPHIC_CONTROL_EXTENSION = Uint8Array.of(0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00);

interface GifReader {
	readonly position: number;
	readonly hasRemaining: boolean;
	readByte(): number;
	readUint16(): number;
	skip(byteLength: number): void;
	skipSubBlocks(): void;
}

function createGifReader(bytes: Uint8Array): GifReader {
	let offset = 0;
	const requireBytes = (byteLength: number): void => {
		if (!Number.isSafeInteger(byteLength) || byteLength < 0 || offset + byteLength > bytes.byteLength) {
			throw new Error("GIF data is truncated or malformed.");
		}
	};
	const readByte = (): number => {
		requireBytes(1);
		const value = bytes[offset];
		offset += 1;
		return value;
	};
	const skip = (byteLength: number): void => {
		requireBytes(byteLength);
		offset += byteLength;
	};

	return {
		get position(): number {
			return offset;
		},
		get hasRemaining(): boolean {
			return offset < bytes.byteLength;
		},
		readByte,
		readUint16: () => readByte() + readByte() * 256,
		skip,
		skipSubBlocks: () => {
			for (;;) {
				const byteLength = readByte();
				if (byteLength === 0) return;
				skip(byteLength);
			}
		}
	};
}

function validateCompressedSize(byteLength: number): void {
	if (byteLength <= 0) {
		throw new Error("GIF data is empty.");
	}
	if (byteLength > GIF_DECODE_LIMITS.maxCompressedBytes) {
		throw new Error(`GIF exceeds the ${GIF_DECODE_LIMITS.maxCompressedBytes} byte compressed-size limit.`);
	}
}

function getColorTableByteLength(packedFields: number): number {
	return 3 * 2 ** ((packedFields % 8) + 1);
}

function validateGifSignature(bytes: Uint8Array): void {
	if (bytes.byteLength < 6) throw new Error("GIF data is truncated or malformed.");
	const signature = String.fromCharCode(...bytes.subarray(0, 6));
	if (signature !== "GIF87a" && signature !== "GIF89a") {
		throw new Error("Asset does not contain a valid GIF signature.");
	}
}

function validateFrameDescriptor(left: number, top: number, width: number, height: number, screenWidth: number, screenHeight: number): void {
	const right = left + width;
	const bottom = top + height;
	if (
		![left, top, width, height, right, bottom].every(Number.isSafeInteger) ||
		width <= 0 ||
		height <= 0 ||
		right > screenWidth ||
		bottom > screenHeight
	) {
		throw new Error("GIF image frame descriptor is invalid or exceeds the logical screen.");
	}
}

export function validateGifCycleDuration(durationMs: number): void {
	if (!Number.isFinite(durationMs) || durationMs <= 0) {
		throw new Error("GIF has an invalid animation cycle duration.");
	}
	if (durationMs > GIF_DECODE_LIMITS.maxCycleDurationMs) {
		throw new Error(`GIF animation cycle exceeds the ${GIF_DECODE_LIMITS.maxCycleDurationMs}ms limit.`);
	}
}

function scanGif(buffer: ArrayBuffer): GifScanResult {
	validateCompressedSize(buffer.byteLength);
	const bytes = new Uint8Array(buffer);
	validateGifSignature(bytes);

	const reader = createGifReader(bytes);
	reader.skip(6);
	const width = reader.readUint16();
	const height = reader.readUint16();
	const screenPackedFields = reader.readByte();
	reader.skip(2);

	if (width <= 0 || height <= 0) {
		throw new Error("GIF has invalid dimensions or no image frames.");
	}
	if (width > GIF_DECODE_LIMITS.maxDimension || height > GIF_DECODE_LIMITS.maxDimension) {
		throw new Error(`GIF dimensions exceed the ${GIF_DECODE_LIMITS.maxDimension}px limit.`);
	}
	if (screenPackedFields >= 0x80) {
		reader.skip(getColorTableByteLength(screenPackedFields));
	}

	const fullFrameBytes = width * height * 4;
	const imagesWithoutControlExtension: number[] = [];
	let frameCount = 0;
	let patchBytes = 0;
	let maxPatchBytes = 0;
	let decodedBytes = fullFrameBytes * 3;
	let durationMs = 0;
	let pendingFrameDelayMs: number | null = null;
	let foundTrailer = false;

	while (reader.hasRemaining) {
		const blockOffset = reader.position;
		const introducer = reader.readByte();

		if (introducer === 0x3b) {
			foundTrailer = true;
			break;
		}

		if (introducer === 0x21) {
			const extensionLabel = reader.readByte();
			if (extensionLabel === 0xf9) {
				if (reader.readByte() !== 4) throw new Error("GIF graphic control extension is malformed.");
				reader.readByte();
				const delayCentiseconds = reader.readUint16();
				reader.readByte();
				if (reader.readByte() !== 0) throw new Error("GIF graphic control extension is malformed.");
				pendingFrameDelayMs = (delayCentiseconds || 10) * 10;
			} else {
				reader.skipSubBlocks();
				// A graphic control extension applies to the next rendered graphic, including plain text.
				if (extensionLabel === 0x01) pendingFrameDelayMs = null;
			}
		} else if (introducer === 0x2c) {
			if (pendingFrameDelayMs === null) imagesWithoutControlExtension.push(blockOffset);
			durationMs += pendingFrameDelayMs ?? DEFAULT_FRAME_DELAY_MS;
			pendingFrameDelayMs = null;

			const left = reader.readUint16();
			const top = reader.readUint16();
			const frameWidth = reader.readUint16();
			const frameHeight = reader.readUint16();
			validateFrameDescriptor(left, top, frameWidth, frameHeight, width, height);

			const imagePackedFields = reader.readByte();
			if (imagePackedFields >= 0x80) {
				reader.skip(getColorTableByteLength(imagePackedFields));
			}
			reader.readByte();
			reader.skipSubBlocks();

			frameCount += 1;
			const framePatchBytes = frameWidth * frameHeight * 4;
			patchBytes += framePatchBytes;
			maxPatchBytes = Math.max(maxPatchBytes, framePatchBytes);
			if (frameCount > GIF_DECODE_LIMITS.maxFrames) {
				throw new Error(`GIF exceeds the ${GIF_DECODE_LIMITS.maxFrames} frame limit.`);
			}
			// Pixi retains each composited frame plus patch arrays, and uses three
			// full-frame and two patch-sized buffers while compositing.
			decodedBytes = fullFrameBytes * (frameCount + 3) + patchBytes + maxPatchBytes * 2;
			if (!Number.isSafeInteger(decodedBytes) || decodedBytes > GIF_DECODE_LIMITS.maxDecodedBytes) {
				throw new Error(`GIF decoded frames exceed the ${GIF_DECODE_LIMITS.maxDecodedBytes} byte limit.`);
			}
			if (durationMs > GIF_DECODE_LIMITS.maxCycleDurationMs) {
				throw new Error(`GIF animation cycle exceeds the ${GIF_DECODE_LIMITS.maxCycleDurationMs}ms limit.`);
			}
		} else {
			throw new Error("GIF contains an unsupported or malformed block.");
		}
	}

	if (!foundTrailer) throw new Error("GIF data is truncated or malformed.");
	if (frameCount === 0) throw new Error("GIF has invalid dimensions or no image frames.");
	validateGifCycleDuration(durationMs);

	return {
		inspection: {
			width,
			height,
			frameCount,
			decodedBytes
		},
		durationMs,
		imagesWithoutControlExtension
	};
}

function addDefaultGraphicControlExtensions(buffer: ArrayBuffer, imageOffsets: readonly number[]): ArrayBuffer {
	if (imageOffsets.length === 0) return buffer;

	const input = new Uint8Array(buffer);
	const output = new Uint8Array(input.byteLength + imageOffsets.length * DEFAULT_GRAPHIC_CONTROL_EXTENSION.byteLength);
	let inputOffset = 0;
	let outputOffset = 0;

	for (const imageOffset of imageOffsets) {
		const segment = input.subarray(inputOffset, imageOffset);
		output.set(segment, outputOffset);
		outputOffset += segment.byteLength;
		output.set(DEFAULT_GRAPHIC_CONTROL_EXTENSION, outputOffset);
		outputOffset += DEFAULT_GRAPHIC_CONTROL_EXTENSION.byteLength;
		inputOffset = imageOffset;
	}

	output.set(input.subarray(inputOffset), outputOffset);
	return output.buffer;
}

export function inspectGif(buffer: ArrayBuffer): GifInspection {
	return scanGif(buffer).inspection;
}

export function validateGifContentLength(contentLength: string | null): void {
	if (!contentLength) return;

	const byteLength = Number(contentLength);
	if (Number.isFinite(byteLength)) {
		validateCompressedSize(byteLength);
	}
}

export async function readGifResponse(response: Response): Promise<ArrayBuffer> {
	try {
		validateGifContentLength(response.headers.get("content-length"));
	} catch (error) {
		await response.body?.cancel(error).catch(() => undefined);
		throw error;
	}
	if (!response.body) {
		throw new Error("GIF response body is not available as a readable stream.");
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				byteLength += value.byteLength;
				validateCompressedSize(byteLength);
				chunks.push(value);
			}
		}
	} catch (error) {
		await reader.cancel(error).catch(() => undefined);
		throw error;
	} finally {
		reader.releaseLock();
	}

	validateCompressedSize(byteLength);
	const bytes = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes.buffer;
}

export function selectGifFrame(frames: readonly Pick<GifFrameTexture, "start" | "end">[], timeMs: number, durationMs: number): number {
	if (frames.length === 0 || durationMs <= 0) return 0;

	const localTime = ((timeMs % durationMs) + durationMs) % durationMs;
	let low = 0;
	let high = frames.length - 1;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const frame = frames[middle];
		if (localTime < frame.start) {
			high = middle - 1;
		} else if (localTime >= frame.end) {
			low = middle + 1;
		} else {
			return middle;
		}
	}

	return Math.min(low, frames.length - 1);
}

export function getAnimatedGifDurationMs(source: Pick<GifImageSource, "duration" | "totalFrames"> | null): number | null {
	return source && source.totalFrames > 1 ? source.duration : null;
}

export class GifImageSource {
	public readonly width: number;
	public readonly height: number;
	public readonly duration: number;
	public readonly frames: GifFrameTexture[];
	public readonly totalFrames: number;

	private firstFrameDataUrl: string | null = null;
	private destroyed = false;

	private constructor(source: PixiGifSource) {
		this.width = source.width;
		this.height = source.height;
		this.totalFrames = source.totalFrames;
		this.duration = source.duration;
		this.frames = [];

		try {
			for (const frame of source.frames) {
				const { resource } = frame.texture.source;
				if (!resource) throw new Error("GIF decoder returned a frame without a canvas resource.");

				this.frames.push({
					start: frame.start,
					end: frame.end,
					texture: new pixi.Texture({
						source: new pixi.CanvasSource({ resource })
					})
				});
			}
		} catch (error) {
			for (const frame of this.frames) frame.texture.destroy(true);
			this.frames.length = 0;
			throw error;
		} finally {
			// The decoder is bundled, while these replacement textures belong to the host Pixi runtime.
			source.destroy();
		}
	}

	public static async fetch(url: string): Promise<GifImageSource> {
		const response = await fetch(url, { signal: AbortSignal.timeout(GIF_REQUEST_TIMEOUT_MS) });
		if (!response.ok) {
			throw new Error(`GIF request failed with HTTP ${response.status}.`);
		}

		const buffer = await readGifResponse(response);
		return GifImageSource.from(buffer);
	}

	public static from(buffer: ArrayBuffer): GifImageSource {
		const { inspection, durationMs, imagesWithoutControlExtension } = scanGif(buffer);
		const normalizedBuffer = addDefaultGraphicControlExtensions(buffer, imagesWithoutControlExtension);
		const source = PixiGifSource.from(normalizedBuffer, { fps: 10 });

		if (
			source.width !== inspection.width ||
			source.height !== inspection.height ||
			source.totalFrames !== inspection.frameCount ||
			source.duration !== durationMs
		) {
			source.destroy();
			throw new Error("GIF frame metadata changed during decoding.");
		}

		return new GifImageSource(source);
	}

	public frameIndexAt(timeMs: number): number {
		return selectGifFrame(this.frames, timeMs, this.duration);
	}

	public getFirstFrameDataUrl(maxDimension = 128): string | null {
		if (this.firstFrameDataUrl) return this.firstFrameDataUrl;

		const resource = this.frames[0]?.texture.source.resource;
		if (typeof HTMLCanvasElement !== "undefined" && resource instanceof HTMLCanvasElement) {
			const scale = Math.min(1, maxDimension / Math.max(resource.width, resource.height));
			if (scale < 1) {
				const thumbnail = document.createElement("canvas");
				thumbnail.width = Math.max(1, Math.round(resource.width * scale));
				thumbnail.height = Math.max(1, Math.round(resource.height * scale));
				const context = thumbnail.getContext("2d");
				if (context) {
					context.drawImage(resource, 0, 0, thumbnail.width, thumbnail.height);
					this.firstFrameDataUrl = thumbnail.toDataURL("image/png");
				}
				thumbnail.width = 0;
				thumbnail.height = 0;
			} else {
				this.firstFrameDataUrl = resource.toDataURL("image/png");
			}
		}
		return this.firstFrameDataUrl;
	}

	public destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		for (const frame of this.frames) frame.texture.destroy(true);
		this.frames.length = 0;
		this.firstFrameDataUrl = null;
	}
}
