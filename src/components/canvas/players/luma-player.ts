import type { Edit } from "@core/edit-session";
import { type Size } from "@layouts/geometry";
import { type ResolvedClip , type LumaAsset } from "@schemas";
import * as pixi from "pixi.js";

import { Player, PlayerType } from "./player";

type LumaSource = pixi.ImageSource | pixi.VideoSource;

export class LumaPlayer extends Player {
	private texture: pixi.Texture<LumaSource> | null;
	private sprite: pixi.Sprite | null;
	private isPlaying: boolean;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Luma);

		this.texture = null;
		this.sprite = null;
		this.isPlaying = false;
	}

	public override async load(): Promise<void> {
		await super.load();

		const lumaAsset = this.clipConfiguration.asset as LumaAsset;

		const identifier = lumaAsset.src;
		const loadOptions: pixi.UnresolvedAsset = { src: identifier, data: { autoPlay: false, muted: true } };
		const texture = await this.edit.assetLoader.load<pixi.Texture<LumaSource>>(identifier, loadOptions);

		const isValidLumaSource = texture?.source instanceof pixi.ImageSource || texture?.source instanceof pixi.VideoSource;
		if (!isValidLumaSource) {
			// Clean up ref if texture loaded but has invalid source type
			// (if texture was null, AssetLoader already decremented on failure)
			if (texture) {
				this.edit.assetLoader.decrementRef(identifier);
			}
			throw new Error(`Invalid luma source '${lumaAsset.src}'.`);
		}

		// Fix alpha channel rendering for WebM VP9 videos
		// PixiJS 8's auto-detection is buggy, causing invisible rendering
		if (texture.source instanceof pixi.VideoSource) {
			texture.source.alphaMode = "no-premultiply-alpha";
		}

		this.texture = texture;
		this.sprite = new pixi.Sprite(this.texture);

		this.contentContainer.addChild(this.sprite);
		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		if (!this.texture) {
			return;
		}

		if (this.texture.source instanceof pixi.VideoSource === false) {
			return;
		}

		const playbackTime = this.getPlaybackTime();
		const shouldClipPlay = this.edit.isPlaying && this.isActive();

		if (shouldClipPlay) {
			if (!this.isPlaying) {
				this.isPlaying = true;
				this.texture.source.resource.currentTime = playbackTime / 1000;
				this.texture.source.resource.play().catch(console.error);
			}

			if (this.texture.source.resource.volume !== this.getVolume()) {
				this.texture.source.resource.volume = this.getVolume();
			}

			const desyncThreshold = 100;
			const shouldSync = Math.abs(this.texture.source.resource.currentTime * 1000 - playbackTime) > desyncThreshold;

			if (shouldSync) {
				this.texture.source.resource.currentTime = playbackTime / 1000;
			}
		}

		if (!shouldClipPlay && this.isPlaying) {
			this.isPlaying = false;
			this.texture.source.resource.pause();
		}

		if (!this.edit.isPlaying && this.isActive()) {
			this.texture.source.resource.currentTime = playbackTime / 1000;
		}
	}

	public override draw(): void {
		super.draw();
	}

	public override dispose(): void {
		super.dispose();

		this.sprite?.destroy();
		this.sprite = null;

		// DON'T destroy the texture - it's managed by Assets
		// The unloadClipAssets() method in Edit already calls Assets.unload()
		this.texture = null;
	}

	public override getSize(): Size {
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			return {
				width: this.clipConfiguration.width,
				height: this.clipConfiguration.height
			};
		}
		return { width: this.sprite?.width ?? 0, height: this.sprite?.height ?? 0 };
	}

	public getVolume(): number {
		return 0;
	}

	public getSprite(): pixi.Sprite | null {
		return this.sprite;
	}

	public isVideoSource(): boolean {
		return this.texture?.source instanceof pixi.VideoSource;
	}

	public getVideoCurrentTime(): number {
		if (this.texture?.source instanceof pixi.VideoSource) {
			return this.texture.source.resource.currentTime;
		}
		return -1;
	}
}
