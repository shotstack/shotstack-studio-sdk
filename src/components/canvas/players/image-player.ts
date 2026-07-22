import type { Edit } from "@core/edit-session";
import { appendCorsQuery, type GifImageSource, isGifUrl } from "@core/loaders/gif-image-source";
import { sec } from "@core/timing/types";
import { type Size } from "@layouts/geometry";
import { type ResolvedClip, type ImageAsset } from "@schemas";
import * as pixi from "pixi.js";

import { createPlaceholderGraphic } from "./placeholder-graphic";
import { Player, PlayerType } from "./player";

export class ImagePlayer extends Player {
	private texture: pixi.Texture | null;
	private sprite: pixi.Sprite | null;
	private placeholder: pixi.Graphics | null;
	private gifSource: GifImageSource | null = null;
	private gifFrameTextures: pixi.Texture[] = [];
	private ownedTextureWrappers: pixi.Texture[] = [];
	private currentGifFrame = -1;
	private assetAcquisitions = new Map<number, string>();

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Image);

		this.texture = null;
		this.sprite = null;
		this.placeholder = null;
	}

	public override async load(): Promise<void> {
		const revision = this.beginMediaTimingLoad();
		await super.load();
		if (!this.isMediaTimingLoadCurrent(revision)) return;

		try {
			if (!(await this.loadTexture(revision))) return;
			this.completeMediaTimingLoad(revision, this.gifSource && this.gifSource.frames.length > 1 ? sec(this.gifSource.duration / 1000) : null);
			this.configureKeyframes();
		} catch {
			if (!this.isMediaTimingLoadCurrent(revision)) return;
			this.completeMediaTimingLoad(revision, null);
			this.createFallbackGraphic();
		}
	}

	private createFallbackGraphic(): void {
		const displaySize = this.getDisplaySize();
		this.clearPlaceholder();

		this.placeholder = createPlaceholderGraphic(displaySize.width, displaySize.height);
		this.contentContainer.addChild(this.placeholder);
		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);
		this.updateGifFrame();
	}

	public override dispose(): void {
		const { src } = this.clipConfiguration.asset as ImageAsset;
		this.releaseAssetAcquisitions(src);
		this.disposeTexture();
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

	public override getContentSize(): Size {
		if (this.sprite) {
			return { width: this.sprite.width, height: this.sprite.height };
		}

		return this.placeholder ? this.getDisplaySize() : { width: 0, height: 0 };
	}

	public override async prepareStaticRender(): Promise<void> {
		this.updateGifFrame();
	}

	/** Reload the image asset when asset.src changes (e.g., merge field update) */
	public override async reloadAsset(): Promise<void> {
		const revision = this.beginMediaTimingLoad();
		this.disposeTexture();
		this.clearPlaceholder();
		this.releaseAssetAcquisitions();

		try {
			if (!(await this.loadTexture(revision))) return;
			this.completeMediaTimingLoad(revision, this.gifSource && this.gifSource.frames.length > 1 ? sec(this.gifSource.duration / 1000) : null);
		} catch {
			if (!this.isMediaTimingLoadCurrent(revision)) return;
			this.completeMediaTimingLoad(revision, null);
			this.createFallbackGraphic();
		}
	}

	private async loadTexture(revision: number): Promise<boolean> {
		const imageAsset = this.clipConfiguration.asset as ImageAsset;
		const { src } = imageAsset;
		if (!src) {
			// Prompt-bearing assets route to pending placeholder players — reaching here without a src is invalid data
			throw new Error("Image asset has no src to load.");
		}

		const requestUrl = appendCorsQuery(src);
		this.assetAcquisitions.set(revision, src);
		if (isGifUrl(src)) {
			const source = await this.edit.assetLoader.loadGif(src, requestUrl);
			if (!this.isMediaTimingLoadCurrent(revision)) {
				if (source) this.releaseAssetAcquisition(revision);
				else this.assetAcquisitions.delete(revision);
				return false;
			}
			if (!source) {
				this.assetAcquisitions.delete(revision);
				throw new Error(`Unable to decode GIF image source '${src}'.`);
			}
			try {
				this.configureGif(source);
				return true;
			} catch (error) {
				this.disposeTexture();
				this.releaseAssetAcquisition(revision);
				throw error;
			}
		}

		const loadOptions: pixi.UnresolvedAsset = { alias: src, src: requestUrl, crossorigin: "anonymous", data: {} };
		const texture = await this.edit.assetLoader.load<pixi.Texture<pixi.ImageSource>>(src, loadOptions);
		if (!this.isMediaTimingLoadCurrent(revision)) {
			if (texture) this.releaseAssetAcquisition(revision);
			else this.assetAcquisitions.delete(revision);
			return false;
		}
		if (!(texture?.source instanceof pixi.ImageSource)) {
			this.assetAcquisitions.delete(revision);
			if (texture) await this.edit.assetLoader.rejectAsset(src);
			throw new Error(`Invalid image source '${src}'.`);
		}

		this.clearPlaceholder();
		this.texture = this.createCroppedTexture(texture);
		this.sprite = new pixi.Sprite(this.texture);
		this.contentContainer.addChild(this.sprite);

		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}
		return true;
	}

	private configureGif(source: GifImageSource): void {
		this.clearPlaceholder();
		this.gifSource = source;
		this.gifFrameTextures = source.frames.map(frame => this.createCroppedTexture(frame.texture));
		this.texture = this.gifFrameTextures[0] ?? null;
		if (!this.texture) throw new Error("GIF contains no renderable frames.");

		this.sprite = new pixi.Sprite(this.texture);
		this.contentContainer.addChild(this.sprite);
		this.currentGifFrame = 0;
		if (this.clipConfiguration.width && this.clipConfiguration.height) this.applyFixedDimensions();
		this.updateGifFrame();
	}

	private updateGifFrame(): void {
		if (!this.gifSource || !this.sprite || !this.isActive()) return;
		const frameIndex = this.gifSource.frameIndexAt(this.getPlaybackTime() * 1000);
		if (frameIndex === this.currentGifFrame) return;
		const texture = this.gifFrameTextures[frameIndex];
		if (!texture) return;
		this.sprite.texture = texture;
		this.texture = texture;
		this.currentGifFrame = frameIndex;
	}

	private disposeTexture(): void {
		if (this.sprite) {
			this.contentContainer.removeChild(this.sprite);
			this.sprite.destroy();
			this.sprite = null;
		}
		for (const texture of this.ownedTextureWrappers) texture.destroy(false);
		this.ownedTextureWrappers = [];
		this.texture = null;
		this.gifFrameTextures = [];
		this.gifSource = null;
		this.currentGifFrame = -1;
	}

	private releaseAssetAcquisition(revision: number): void {
		const identifier = this.assetAcquisitions.get(revision);
		if (!identifier) return;
		this.assetAcquisitions.delete(revision);
		this.edit.assetLoader.release(identifier);
	}

	private releaseAssetAcquisitions(alreadyReleasedIdentifier?: string): void {
		let skipIdentifier = alreadyReleasedIdentifier;
		for (const [revision, identifier] of this.assetAcquisitions) {
			this.assetAcquisitions.delete(revision);
			if (identifier === skipIdentifier) {
				skipIdentifier = undefined;
			} else {
				this.edit.assetLoader.release(identifier);
			}
		}
	}

	private clearPlaceholder(): void {
		if (this.placeholder) {
			this.contentContainer.removeChild(this.placeholder);
			this.placeholder.destroy();
			this.placeholder = null;
		}
	}

	public override supportsEdgeResize(): boolean {
		return true;
	}

	private createCroppedTexture<TSource extends pixi.TextureSource>(texture: pixi.Texture<TSource>): pixi.Texture<TSource> {
		const imageAsset = this.clipConfiguration.asset as ImageAsset;

		if (!imageAsset.crop) {
			return texture;
		}

		const originalWidth = texture.width;
		const originalHeight = texture.height;

		const left = Math.floor((imageAsset.crop?.left ?? 0) * originalWidth);
		const right = Math.floor((imageAsset.crop?.right ?? 0) * originalWidth);
		const top = Math.floor((imageAsset.crop?.top ?? 0) * originalHeight);
		const bottom = Math.floor((imageAsset.crop?.bottom ?? 0) * originalHeight);

		const x = left;
		const y = top;
		const width = originalWidth - left - right;
		const height = originalHeight - top - bottom;

		const crop = new pixi.Rectangle(x, y, width, height);
		const croppedTexture = new pixi.Texture({ source: texture.source, frame: crop });
		this.ownedTextureWrappers.push(croppedTexture);
		return croppedTexture;
	}
}
