import { KeyframeBuilder } from "@animations/keyframe-builder";
import type { Edit } from "@core/edit-session";
import { sec } from "@core/timing/types";
import { type Size } from "@layouts/geometry";
import { type ResolvedClip, type VideoAsset } from "@schemas";
import * as pixi from "pixi.js";

import { createPlaceholderGraphic } from "./placeholder-graphic";
import { Player, PlayerType } from "./player";

export class VideoPlayer extends Player {
	private texture: pixi.Texture<pixi.VideoSource> | null;
	private sprite: pixi.Sprite | null;
	private placeholder: pixi.Graphics | null;
	private isPlaying: boolean;

	private volumeKeyframeBuilder: KeyframeBuilder;

	private syncTimer: number;
	private activeSyncTimer: number;
	private skipVideoUpdate: boolean;
	private cancelVideoReadyWait: (() => void) | null;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Video);

		this.texture = null;
		this.sprite = null;
		this.placeholder = null;
		this.isPlaying = false;

		const videoAsset = this.clipConfiguration.asset as VideoAsset;

		this.volumeKeyframeBuilder = new KeyframeBuilder(videoAsset.volume ?? 1, this.getLength());
		this.syncTimer = 0;
		this.activeSyncTimer = 0;
		this.skipVideoUpdate = false;
		this.cancelVideoReadyWait = null;
	}

	public override async load(): Promise<void> {
		const mediaTimingRevision = this.beginMediaTimingLoad();
		this.cancelPendingVideoReadyWait();
		await super.load();
		if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
		try {
			if (!(await this.loadVideo(mediaTimingRevision))) return;
			this.completeMediaTimingLoad(mediaTimingRevision, this.getLoadedDuration());
			this.configureKeyframes();
		} catch (error) {
			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
			this.completeMediaTimingLoad(mediaTimingRevision, null);
			console.warn(`[VideoPlayer.load] FAILED clipId=${this.clipId}:`, error);
			this.createFallbackGraphic();
		}
	}

	private createFallbackGraphic(): void {
		const { width, height } = this.getDisplaySize();
		this.clearPlaceholder();

		this.placeholder = createPlaceholderGraphic(width, height);
		this.contentContainer.addChild(this.placeholder);
		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		if (this.skipVideoUpdate) {
			return;
		}

		const { trim = 0 } = this.clipConfiguration.asset as VideoAsset;

		this.syncTimer += elapsed;

		if (!this.texture) {
			return;
		}

		// getPlaybackTime() returns seconds
		const playbackTime = this.getPlaybackTime();
		const shouldClipPlay = this.edit.isPlaying && this.isActive();

		if (shouldClipPlay) {
			if (!this.isPlaying) {
				this.isPlaying = true;
				this.activeSyncTimer = 0;
				this.texture.source.resource.volume = this.getVolume();
				this.texture.source.resource.currentTime = playbackTime + trim;
				this.texture.source.resource.play().catch(console.error);
			}

			if (this.texture.source.resource.volume !== this.getVolume()) {
				this.texture.source.resource.volume = this.getVolume();
			}

			// Rate-limit sync checks to once per second to prevent audio stuttering
			this.activeSyncTimer += elapsed;
			if (this.activeSyncTimer > 1000) {
				this.activeSyncTimer = 0;
				// Desync threshold: 0.3 seconds (300ms)
				const desyncThreshold = 0.3;
				// Both currentTime and playbackTime are in seconds
				const drift = Math.abs(this.texture.source.resource.currentTime - trim - playbackTime);
				if (drift > desyncThreshold) {
					this.texture.source.resource.currentTime = playbackTime + trim;
				}
			}
		}

		if (!shouldClipPlay && this.isPlaying) {
			this.isPlaying = false;
			this.texture.source.resource.pause();
		}

		// When paused, sync every 100ms for scrubbing
		const shouldSync = this.syncTimer > 100;
		if (!this.edit.isPlaying && this.isActive() && shouldSync) {
			this.syncTimer = 0;
			this.texture.source.resource.currentTime = playbackTime + trim;
		}
	}

	public override dispose(): void {
		this.cancelPendingVideoReadyWait();
		this.disposeVideo();
		this.clearPlaceholder();
		super.dispose();
	}

	public override getSize(): Size {
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			return {
				width: this.clipConfiguration.width,
				height: this.clipConfiguration.height
			};
		}

		if (this.sprite) {
			return { width: this.sprite.width, height: this.sprite.height };
		}

		return this.placeholder ? this.getDisplaySize() : { width: 0, height: 0 };
	}

	public override supportsEdgeResize(): boolean {
		return true;
	}

	/** Reload the video asset when asset.src changes (e.g., merge field update) */
	public override async reloadAsset(): Promise<void> {
		const mediaTimingRevision = this.beginMediaTimingLoad();
		this.cancelPendingVideoReadyWait();
		this.skipVideoUpdate = true;
		this.isPlaying = false;
		this.syncTimer = 0;
		this.activeSyncTimer = 0;

		try {
			this.disposeVideo();
			this.clearPlaceholder();
			if (!(await this.loadVideo(mediaTimingRevision))) return;
			this.completeMediaTimingLoad(mediaTimingRevision, this.getLoadedDuration());
		} catch (error) {
			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
			this.completeMediaTimingLoad(mediaTimingRevision, null);
			console.warn(`[VideoPlayer.reloadAsset] FAILED clipId=${this.clipId}:`, error);
			this.createFallbackGraphic();
		} finally {
			if (this.isMediaTimingLoadCurrent(mediaTimingRevision)) this.skipVideoUpdate = false;
		}
	}

	public override reconfigureAfterRestore(): void {
		super.reconfigureAfterRestore();

		const videoAsset = this.clipConfiguration.asset as VideoAsset;
		this.volumeKeyframeBuilder = new KeyframeBuilder(videoAsset.volume ?? 1, this.getLength());
	}

	private async loadVideo(mediaTimingRevision: number): Promise<boolean> {
		const videoAsset = this.clipConfiguration.asset as VideoAsset;
		const { src } = videoAsset;
		if (!src) {
			// Prompt-bearing assets route to pending placeholder players — reaching here without a src is invalid data
			throw new Error("Video asset has no src to load.");
		}

		if (src.endsWith(".mov")) {
			throw new Error(`Video source '${src}' is not supported. .mov files cannot be played in the browser. Please convert to .webm or .mp4 first.`);
		}

		const corsUrl = `${src}${src.includes("?") ? "&" : "?"}x-cors=1`;
		const loadOptions: pixi.UnresolvedAsset = { src: corsUrl, data: { autoPlay: false, muted: false } };

		// Use unique loader to create independent video element per player
		// This prevents conflicts when multiple clips use the same video source
		const texture = await this.edit.assetLoader.loadVideoUnique(corsUrl, loadOptions);

		if (!texture || !(texture.source instanceof pixi.VideoSource)) {
			throw new Error(`Invalid video source '${src}'.`);
		}
		if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) {
			this.destroyVideoTexture(texture);
			return false;
		}

		// Fix alpha channel rendering for WebM VP9 videos (PixiJS 8 auto-detection is buggy)
		texture.source.alphaMode = "no-premultiply-alpha";

		const loadedTexture = this.createCroppedTexture(texture);

		// Ensure the video has at least one decoded frame before adding to render tree
		// This prevents WebGL errors when GPU tries to upload uninitialized texture data
		const video = loadedTexture.source.resource;
		try {
			if (!(await this.waitForVideoReady(video, mediaTimingRevision)) || !this.isMediaTimingLoadCurrent(mediaTimingRevision)) {
				this.destroyVideoTexture(loadedTexture);
				return false;
			}
		} catch (error) {
			this.destroyVideoTexture(loadedTexture);
			throw error;
		}

		this.clearPlaceholder();
		this.texture = loadedTexture;
		this.sprite = new pixi.Sprite(loadedTexture);
		this.contentContainer.addChild(this.sprite);

		// Set initial volume immediately so the element never sits at the browser default of 1.0
		this.texture.source.resource.volume = this.getVolume();
		return true;
	}

	private waitForVideoReady(video: HTMLVideoElement, mediaTimingRevision: number): Promise<boolean> {
		if (!(video instanceof HTMLVideoElement) || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
			return Promise.resolve(this.isMediaTimingLoadCurrent(mediaTimingRevision));
		}

		return new Promise<boolean>((resolve, reject) => {
			let settled = false;
			let onLoadedData: () => void;
			let onError: () => void;
			let onAbort: () => void;
			let cancel: () => void;

			const cleanup = () => {
				video.removeEventListener("loadeddata", onLoadedData);
				video.removeEventListener("error", onError);
				video.removeEventListener("abort", onAbort);
				if (this.cancelVideoReadyWait === cancel) this.cancelVideoReadyWait = null;
			};
			const settle = (ready: boolean, error?: Error) => {
				if (settled) return;
				settled = true;
				cleanup();
				if (error) reject(error);
				else resolve(ready);
			};
			onLoadedData = () => {
				settle(this.isMediaTimingLoadCurrent(mediaTimingRevision));
			};
			onError = () => {
				settle(false, new Error("Video failed while waiting for its first decoded frame."));
			};
			onAbort = () => {
				settle(false, new Error("Video loading was aborted before its first decoded frame."));
			};
			cancel = () => {
				settle(false);
			};

			this.cancelVideoReadyWait = cancel;
			video.addEventListener("loadeddata", onLoadedData);
			video.addEventListener("error", onError);
			video.addEventListener("abort", onAbort);

			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) cancel();
			else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onLoadedData();
		});
	}

	private cancelPendingVideoReadyWait(): void {
		this.cancelVideoReadyWait?.();
	}

	private disposeVideo(): void {
		if (this.sprite) {
			this.contentContainer.removeChild(this.sprite);
			this.sprite.destroy();
			this.sprite = null;
		}
		// Destroy the texture since we own it (created via loadVideoUnique)
		if (this.texture) {
			this.destroyVideoTexture(this.texture);
			this.texture = null;
		}
	}

	private destroyVideoTexture(texture: pixi.Texture<pixi.VideoSource>): void {
		const { resource } = texture.source;
		resource.pause();
		resource.src = "";
		resource.load();
		texture.destroy(true);
	}

	private getLoadedDuration(): ReturnType<typeof sec> | null {
		const duration = this.texture?.source.resource.duration;
		return duration !== undefined && Number.isFinite(duration) ? sec(duration) : null;
	}

	private clearPlaceholder(): void {
		if (!this.placeholder) {
			return;
		}

		this.contentContainer.removeChild(this.placeholder);
		this.placeholder.destroy();
		this.placeholder = null;
	}

	public getVolume(): number {
		return this.volumeKeyframeBuilder.getValue(this.getPlaybackTime());
	}

	public getCurrentDrift(): number {
		if (!this.texture?.source?.resource) return 0;
		const { trim = 0 } = this.clipConfiguration.asset as VideoAsset;
		const videoTime = this.texture.source.resource.currentTime;
		// getPlaybackTime() returns seconds, videoTime is also seconds
		const playbackTime = this.getPlaybackTime();
		return Math.abs(videoTime - trim - playbackTime);
	}

	private createCroppedTexture(texture: pixi.Texture<pixi.VideoSource>): pixi.Texture<pixi.VideoSource> {
		const videoAsset = this.clipConfiguration.asset as VideoAsset;

		if (!videoAsset.crop) {
			return texture;
		}

		const originalWidth = texture.width;
		const originalHeight = texture.height;

		// Guard against uninitialized textures - skip cropping until GPU upload completes
		if (originalWidth <= 0 || originalHeight <= 0) {
			return texture;
		}

		const left = Math.floor((videoAsset.crop?.left ?? 0) * originalWidth);
		const right = Math.floor((videoAsset.crop?.right ?? 0) * originalWidth);
		const top = Math.floor((videoAsset.crop?.top ?? 0) * originalHeight);
		const bottom = Math.floor((videoAsset.crop?.bottom ?? 0) * originalHeight);

		const x = left;
		const y = top;
		const width = originalWidth - left - right;
		const height = originalHeight - top - bottom;

		const crop = new pixi.Rectangle(x, y, width, height);
		return new pixi.Texture({ source: texture.source, frame: crop });
	}
}
