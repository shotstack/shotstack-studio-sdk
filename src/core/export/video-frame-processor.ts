import * as pixi from "pixi.js";

import { SimpleLRUCache } from "./export-utils";

export interface VideoPlayerExtended {
	texture?: { source?: { resource?: HTMLVideoElement } };
	sprite?: { texture?: pixi.Texture };
	clipConfiguration?: { asset?: { src?: string; trim?: number; type?: string } };
	originalTextureSource?: unknown;
	originalVideoElement?: HTMLVideoElement;
	lastReplacedTimestamp?: number;
	skipVideoUpdate?: boolean;
	getStart?(): number;
	getEnd?(): number;
	getLength?(): number;
}

export function isVideoPlayer(player: unknown): player is VideoPlayerExtended {
	if (!player || typeof player !== "object") return false;
	const p = player as Record<string, unknown>;
	const hasVideoConstructor = p.constructor?.name === "VideoPlayer";
	const texture = p["texture"] as { source?: { resource?: unknown } } | undefined;
	const hasVideoTexture = texture?.source?.resource instanceof HTMLVideoElement;
	return hasVideoConstructor || hasVideoTexture;
}

export class VideoFrameProcessor {
	private frameCache = new SimpleLRUCache<ImageData>(10);
	private textureCache = new SimpleLRUCache<pixi.Texture>(5);
	private videoElements = new Map<string, { element: HTMLVideoElement; player: VideoPlayerExtended }>();
	private extractionCanvas: HTMLCanvasElement | null = null;
	private extractionContext: CanvasRenderingContext2D | null = null;

	async initialize(clips: ReadonlyArray<unknown>): Promise<void> {
		for (const clip of clips) {
			if (isVideoPlayer(clip)) {
				const videoClip = clip as VideoPlayerExtended;
				const videoElement = videoClip.texture?.source?.resource;
				if (videoElement) {
					this.videoElements.set(this.getVideoKey(videoClip), { element: videoElement, player: videoClip });
				}
			}
		}
		this.extractionCanvas = document.createElement("canvas");
		this.extractionCanvas.width = 3840; // 4K width
		this.extractionCanvas.height = 2160; // 4K height
		this.extractionContext = this.extractionCanvas.getContext("2d", {
			willReadFrequently: true,
			alpha: true
		});
	}

	async extractFrame(videoKey: string, timestamp: number): Promise<ImageData | null> {
		const cacheKey = `${videoKey}-${timestamp}`;
		const cached = this.frameCache.get(cacheKey);
		if (cached) return cached;

		const videoInfo = this.videoElements.get(videoKey);
		if (!videoInfo || !this.extractionContext || !this.extractionCanvas) return null;

		try {
			const { element: video, player } = videoInfo;
			const videoTime = (timestamp - (player.getStart?.() || 0)) / 1000 + (player.clipConfiguration?.asset?.trim || 0);
			await this.seekToTime(video, videoTime);

			const width = video.videoWidth || video.width || 1920;
			const height = video.videoHeight || video.height || 1080;

			this.extractionContext.clearRect(0, 0, width, height);
			this.extractionContext.drawImage(video, 0, 0, width, height);
			const imageData = this.extractionContext.getImageData(0, 0, width, height);
			this.frameCache.set(cacheKey, imageData);
			return imageData;
		} catch (error) {
			console.warn("Failed to extract frame:", error);
			return null;
		}
	}

	async replaceVideoTexture(player: VideoPlayerExtended, timestamp: number): Promise<void> {
		const frame = await this.extractFrame(this.getVideoKey(player), timestamp);
		if (!frame) return;

		const textureKey = `${this.getVideoKey(player)}-${timestamp}`;
		let texture = this.textureCache.get(textureKey);

		if (!texture) {
			const canvas = document.createElement("canvas");
			canvas.width = frame.width;
			canvas.height = frame.height;
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.putImageData(frame, 0, 0);
				texture = pixi.Texture.from(canvas);
				this.textureCache.set(textureKey, texture);
			}
		}

		if (texture && player.texture) {
			if (!player.originalTextureSource) {
				// eslint-disable-next-line no-param-reassign
				player.originalTextureSource = player.texture.source;
				if (player.texture.source?.resource instanceof HTMLVideoElement) {
					// eslint-disable-next-line no-param-reassign
					player.originalVideoElement = player.texture.source.resource;
				}
			}
			// eslint-disable-next-line no-param-reassign
			player.texture = texture;
			// eslint-disable-next-line no-param-reassign
			if (player.sprite?.texture) player.sprite.texture = texture;
			// eslint-disable-next-line no-param-reassign
			player.lastReplacedTimestamp = timestamp;
		}
	}

	disableVideoPlayback(clips: ReadonlyArray<unknown>): VideoPlayerExtended[] {
		const videoPlayers: VideoPlayerExtended[] = [];

		for (const clip of clips) {
			if (isVideoPlayer(clip)) {
				const videoClip = clip as VideoPlayerExtended;
				videoPlayers.push(videoClip);
				if (videoClip.texture?.source?.resource instanceof HTMLVideoElement) {
					videoClip.texture.source.resource.pause();
				}
				videoClip.skipVideoUpdate = true;
			}
		}
		return videoPlayers;
	}

	getVideoKey(player: VideoPlayerExtended): string {
		return player.clipConfiguration?.asset?.src || "";
	}

	dispose(): void {
		this.frameCache.clear();
		this.textureCache.clear();
		this.videoElements.clear();
		this.extractionCanvas = null;
		this.extractionContext = null;
	}

	private async seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
		return new Promise<void>(resolve => {
			if (Math.abs(video.currentTime - time) < 0.1) {
				resolve();
				return;
			}
			const onSeeked = (): void => {
				video.removeEventListener("seeked", onSeeked);
				setTimeout(resolve, 1);
			};
			video.addEventListener("seeked", onSeeked);
			// eslint-disable-next-line no-param-reassign
			video.currentTime = time;
		});
	}
}
