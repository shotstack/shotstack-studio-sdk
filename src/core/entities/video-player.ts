import * as pixi from "pixi.js";

import { KeyframeBuilder } from "../animations/keyframe-builder";
import { type Size } from "../layouts/geometry";
import { type Clip } from "../schemas/clip";
import { type VideoAsset } from "../schemas/video-asset";

import type { Edit } from "./edit";
import { Player } from "./player";

export class VideoPlayer extends Player {
	private texture: pixi.Texture<pixi.VideoSource> | null;
	private sprite: pixi.Sprite | null;
	private isPlaying: boolean;

	private volumeKeyframeBuilder: KeyframeBuilder;

	private syncTimer: number;

	constructor(edit: Edit, clipConfiguration: Clip) {
		super(edit, clipConfiguration);

		this.texture = null;
		this.sprite = null;
		this.isPlaying = false;

		const videoAsset = this.clipConfiguration.asset as VideoAsset;

		this.volumeKeyframeBuilder = new KeyframeBuilder(videoAsset.volume ?? 1, this.getLength());
		this.syncTimer = 0;
	}

	/**
	 * TODO: Add support for .mov and .webm files
	 */
	public override async load(): Promise<void> {
		await super.load();

		const videoAsset = this.clipConfiguration.asset as VideoAsset;

		const identifier = videoAsset.src;

		if (identifier.endsWith(".mov") || identifier.endsWith(".webm")) {
			throw new Error(`Video source '${videoAsset.src}' is not supported. .mov and .webm files are currently not supported.`);
		}

		const loadOptions: pixi.UnresolvedAsset = { src: identifier, data: { autoPlay: false, muted: false } };
		const texture = await this.edit.assetLoader.load<pixi.Texture<pixi.VideoSource>>(identifier, loadOptions);

		const isValidVideoSource = texture?.source instanceof pixi.VideoSource;
		if (!isValidVideoSource) {
			throw new Error(`Invalid video source '${videoAsset.src}'.`);
		}

		this.texture = this.createCroppedTexture(texture);
		this.sprite = new pixi.Sprite(this.texture);

		this.getContainer().addChild(this.sprite);
		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		const { trim = 0 } = this.clipConfiguration.asset as VideoAsset;

		this.syncTimer += elapsed;

		if (!this.texture) {
			return;
		}

		const playbackTime = this.getPlaybackTime();
		const shouldClipPlay = this.edit.isPlaying && this.isActive();

		if (shouldClipPlay) {
			if (!this.isPlaying) {
				this.isPlaying = true;
				this.texture.source.resource.currentTime = playbackTime / 1000 + trim;
				this.texture.source.resource.play().catch(console.error);
			}

			if (this.texture.source.resource.volume !== this.getVolume()) {
				this.texture.source.resource.volume = this.getVolume();
			}

			const desyncThreshold = 100;
			const shouldSync = Math.abs((this.texture.source.resource.currentTime - trim) * 1000 - playbackTime) > desyncThreshold;

			if (shouldSync) {
				this.texture.source.resource.currentTime = playbackTime / 1000 + trim;
			}
		}

		if (!shouldClipPlay && this.isPlaying) {
			this.isPlaying = false;
			this.texture.source.resource.pause();
		}

		const shouldSync = this.syncTimer > 100;
		if (!this.edit.isPlaying && this.isActive() && shouldSync) {
			this.syncTimer = 0;
			this.texture.source.resource.currentTime = playbackTime / 1000 + trim;
		}
	}

	public override draw(): void {
		super.draw();
	}

	public override dispose(): void {
		super.dispose();

		this.sprite?.destroy();
		this.sprite = null;

		this.texture?.destroy();
		this.texture = null;
	}

	public override getSize(): Size {
		return { width: this.sprite?.width ?? 0, height: this.sprite?.height ?? 0 };
	}

	public getVolume(): number {
		return this.volumeKeyframeBuilder.getValue(this.getPlaybackTime());
	}

	private createCroppedTexture(texture: pixi.Texture<pixi.VideoSource>): pixi.Texture<pixi.VideoSource> {
		const videoAsset = this.clipConfiguration.asset as VideoAsset;

		if (!videoAsset.crop) {
			return texture;
		}

		const originalWidth = texture.width;
		const originalHeight = texture.height;

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
