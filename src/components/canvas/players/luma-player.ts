import type { Edit } from "@core/edit-session";
import { sec } from "@core/timing/types";
import { type Size } from "@layouts/geometry";
import { type ResolvedClip, type LumaAsset } from "@schemas";
import * as pixi from "pixi.js";

import { Player, PlayerType } from "./player";

type LumaSource = pixi.ImageSource | pixi.VideoSource;

export class LumaPlayer extends Player {
	private texture: pixi.Texture<LumaSource> | null;
	private sprite: pixi.Sprite | null;
	private isPlaying: boolean;
	private loadedResourceIdentifier: string | null;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Luma);

		this.texture = null;
		this.sprite = null;
		this.isPlaying = false;
		this.loadedResourceIdentifier = null;
	}

	public override async load(): Promise<void> {
		const mediaTimingRevision = this.beginMediaTimingLoad();
		try {
			await super.load();
			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
			await this.loadLuma(mediaTimingRevision);
		} catch (error) {
			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
			this.completeMediaTimingLoad(mediaTimingRevision, null);
			throw error;
		}
	}

	public override async reloadAsset(): Promise<void> {
		const mediaTimingRevision = this.beginMediaTimingLoad();
		this.releaseLoadedResource();
		this.clearLumaVisual();
		try {
			await this.loadLuma(mediaTimingRevision);
		} catch (error) {
			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
			this.completeMediaTimingLoad(mediaTimingRevision, null);
			throw error;
		}
	}

	private async loadLuma(mediaTimingRevision: number): Promise<void> {
		const lumaAsset = this.clipConfiguration.asset as LumaAsset;
		const identifier = lumaAsset.src;
		const loadOptions: pixi.UnresolvedAsset = { src: identifier, data: { autoPlay: false, muted: true } };
		const texture = await this.edit.assetLoader.load<pixi.Texture<LumaSource>>(identifier, loadOptions);

		if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) {
			if (texture) this.edit.assetLoader.release(identifier);
			return;
		}

		const isValidLumaSource = texture?.source instanceof pixi.ImageSource || texture?.source instanceof pixi.VideoSource;
		if (!isValidLumaSource) {
			if (texture) {
				texture.destroy(true);
				await this.edit.assetLoader.rejectAsset(identifier);
			}
			throw new Error(`Invalid luma source '${lumaAsset.src}'.`);
		}

		if (texture.source instanceof pixi.VideoSource) {
			texture.source.alphaMode = "no-premultiply-alpha";
		}

		this.texture = texture;
		this.loadedResourceIdentifier = identifier;
		this.sprite = new pixi.Sprite(texture);
		this.contentContainer.addChild(this.sprite);
		const duration = texture.source instanceof pixi.VideoSource ? texture.source.resource.duration : null;
		this.completeMediaTimingLoad(mediaTimingRevision, duration !== null && Number.isFinite(duration) ? sec(duration) : null);
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

		const { trim = 0 } = this.clipConfiguration.asset as LumaAsset;
		const playbackTime = this.getPlaybackTime();
		const sourceTime = playbackTime + trim;
		const shouldClipPlay = this.edit.isPlaying && this.isActive();

		if (shouldClipPlay) {
			if (!this.isPlaying) {
				this.isPlaying = true;
				this.texture.source.resource.currentTime = sourceTime;
				this.texture.source.resource.play().catch(console.error);
			}

			if (this.texture.source.resource.volume !== this.getVolume()) {
				this.texture.source.resource.volume = this.getVolume();
			}

			const desyncThreshold = 0.1;
			const shouldSync = Math.abs(this.texture.source.resource.currentTime - sourceTime) > desyncThreshold;

			if (shouldSync) {
				this.texture.source.resource.currentTime = sourceTime;
			}
		}

		if (!shouldClipPlay && this.isPlaying) {
			this.isPlaying = false;
			this.texture.source.resource.pause();
		}

		if (!this.edit.isPlaying && this.isActive()) {
			this.texture.source.resource.currentTime = sourceTime;
		}
	}

	public override dispose(): void {
		this.clearLumaVisual();
		this.loadedResourceIdentifier = null;
		super.dispose();
	}

	public override getLoadedResourceIdentifier(): string | null {
		return this.loadedResourceIdentifier;
	}

	private releaseLoadedResource(): void {
		if (!this.loadedResourceIdentifier) return;
		this.edit.assetLoader.release(this.loadedResourceIdentifier);
		this.loadedResourceIdentifier = null;
	}

	private clearLumaVisual(): void {
		if (this.sprite) {
			this.contentContainer.removeChild(this.sprite);
			this.sprite.destroy();
			this.sprite = null;
		}
		// The texture is shared and released through AssetLoader.
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
