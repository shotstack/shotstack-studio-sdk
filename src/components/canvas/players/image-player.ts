import type { Edit } from "@core/edit-session";
import { GifImageLoadError } from "@core/loaders/gif-image-load-error";
import { getAnimatedGifDurationMs, GifImageSource } from "@core/loaders/gif-image-source";
import { appendCorsQuery } from "@core/loaders/gif-url";
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
	private gifSource: GifImageSource | null;
	private gifFrameTextures: pixi.Texture[];
	private ownedTextureWrappers: pixi.Texture[];
	private currentGifFrame: number;
	private loadedAssetIdentifier: string | null;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Image);

		this.texture = null;
		this.sprite = null;
		this.placeholder = null;
		this.gifSource = null;
		this.gifFrameTextures = [];
		this.ownedTextureWrappers = [];
		this.currentGifFrame = -1;
		this.loadedAssetIdentifier = null;
	}

	public override async load(): Promise<void> {
		const mediaTimingRevision = this.beginMediaTimingLoad();
		await super.load();
		if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
		try {
			if (!(await this.loadTexture(mediaTimingRevision))) return;
			const duration = getAnimatedGifDurationMs(this.gifSource);
			this.completeMediaTimingLoad(mediaTimingRevision, duration === null ? null : sec(duration / 1000));
			this.configureKeyframes();
		} catch (error) {
			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
			this.completeMediaTimingLoad(mediaTimingRevision, null);
			this.createFallbackGraphic();
			if (error instanceof GifImageLoadError) throw error;
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
		this.disposeTexture();
		this.clearPlaceholder();
		this.loadedAssetIdentifier = null;
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

	public override getLoadedResourceIdentifier(): string | null {
		return this.loadedAssetIdentifier;
	}

	public override async prepareStaticRender(): Promise<void> {
		this.updateGifFrame();
	}

	/** Reload the image asset when asset.src changes (e.g., merge field update) */
	public override async reloadAsset(): Promise<void> {
		const mediaTimingRevision = this.beginMediaTimingLoad();
		this.disposeTexture();
		this.clearPlaceholder();
		this.releaseLoadedAsset();

		try {
			if (!(await this.loadTexture(mediaTimingRevision))) return;
			const duration = getAnimatedGifDurationMs(this.gifSource);
			this.completeMediaTimingLoad(mediaTimingRevision, duration === null ? null : sec(duration / 1000));
		} catch (error) {
			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
			this.completeMediaTimingLoad(mediaTimingRevision, null);
			this.createFallbackGraphic();
			if (error instanceof GifImageLoadError) throw error;
		}
	}

	private async loadTexture(mediaTimingRevision: number): Promise<boolean> {
		const imageAsset = this.clipConfiguration.asset as ImageAsset;
		const { src } = imageAsset;
		if (!src) {
			// Prompt-bearing assets route to pending placeholder players — reaching here without a src is invalid data
			throw new Error("Image asset has no src to load.");
		}
		const requestUrl = appendCorsQuery(src);
		let isGif: boolean;
		try {
			isGif = await this.edit.assetLoader.isGif(src, requestUrl);
		} catch (error) {
			throw new GifImageLoadError(`Unable to validate GIF image source '${src}'.`, { cause: error });
		}
		if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return false;
		if (!isGif) this.completeMediaTimingLoad(mediaTimingRevision, null);

		if (isGif) {
			const source = await this.edit.assetLoader.loadGif(src, requestUrl);
			if (!source) throw new GifImageLoadError(`Unable to decode GIF image source '${src}'.`);
			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) {
				this.edit.assetLoader.release(src);
				return false;
			}

			try {
				this.configureGif(source);
				this.loadedAssetIdentifier = src;
				return true;
			} catch (error) {
				this.disposeTexture();
				this.edit.assetLoader.release(src);
				throw new GifImageLoadError(`Unable to configure GIF image source '${src}'.`, { cause: error });
			}
		}

		const loadOptions: pixi.UnresolvedAsset = { alias: src, src: requestUrl, crossorigin: "anonymous", data: {} };
		const texture = await this.edit.assetLoader.load<pixi.Texture<pixi.ImageSource>>(src, loadOptions);
		if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) {
			if (texture) this.edit.assetLoader.release(src);
			return false;
		}

		if (!(texture?.source instanceof pixi.ImageSource)) {
			if (texture) {
				texture.destroy(true);
				await this.edit.assetLoader.rejectAsset(src);
			}
			throw new Error(`Invalid image source '${src}'.`);
		}

		this.clearPlaceholder();
		this.texture = this.createCroppedTexture(texture);
		this.sprite = new pixi.Sprite(this.texture);
		this.contentContainer.addChild(this.sprite);
		this.loadedAssetIdentifier = src;

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

		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}
		this.updateGifFrame();
	}

	private updateGifFrame(): void {
		if (!this.gifSource || !this.sprite || !this.isActive()) return;

		const frameIndex = this.gifSource.frameIndexAt(this.getPlaybackTime() * 1000);
		if (frameIndex === this.currentGifFrame) return;

		const frameTexture = this.gifFrameTextures[frameIndex];
		if (!frameTexture) return;
		this.sprite.texture = frameTexture;
		this.texture = frameTexture;
		this.currentGifFrame = frameIndex;
	}

	private disposeTexture(): void {
		if (this.sprite) {
			this.contentContainer.removeChild(this.sprite);
			this.sprite.destroy();
			this.sprite = null;
		}
		for (const texture of this.ownedTextureWrappers) {
			texture.destroy(false);
		}
		this.ownedTextureWrappers = [];
		this.texture = null;
		this.gifFrameTextures = [];
		this.gifSource = null;
		this.currentGifFrame = -1;
	}

	private releaseLoadedAsset(): void {
		if (!this.loadedAssetIdentifier) return;
		this.edit.assetLoader.release(this.loadedAssetIdentifier);
		this.loadedAssetIdentifier = null;
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
