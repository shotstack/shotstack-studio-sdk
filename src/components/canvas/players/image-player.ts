import type { Edit } from "@core/edit-session";
import { type Size } from "@layouts/geometry";
import { type ResolvedClip, type ImageAsset } from "@schemas";
import * as pixi from "pixi.js";

import { Player, PlayerType } from "./player";

export class ImagePlayer extends Player {
	private texture: pixi.Texture<pixi.ImageSource> | null;
	private sprite: pixi.Sprite | null;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Image);

		this.texture = null;
		this.sprite = null;
	}

	public override async load(): Promise<void> {
		await super.load();
		await this.loadTexture();
		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);
	}

	public override draw(): void {
		super.draw();
	}

	public override dispose(): void {
		super.dispose();
		this.disposeTexture();
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

	public override getContentSize(): Size {
		return { width: this.sprite?.width ?? 0, height: this.sprite?.height ?? 0 };
	}

	/** Reload the image asset when asset.src changes (e.g., merge field update) */
	public override async reloadAsset(): Promise<void> {
		this.disposeTexture();
		await this.loadTexture();
	}

	private async loadTexture(): Promise<void> {
		const imageAsset = this.clipConfiguration.asset as ImageAsset;
		const { src } = imageAsset;

		const corsUrl = `${src}${src.includes("?") ? "&" : "?"}x-cors=1`;
		const loadOptions: pixi.UnresolvedAsset = { src: corsUrl, crossorigin: "anonymous", data: {} };
		const texture = await this.edit.assetLoader.load<pixi.Texture<pixi.ImageSource>>(corsUrl, loadOptions);

		if (!(texture?.source instanceof pixi.ImageSource)) {
			if (texture) {
				texture.destroy(true);
				// Asset unloading handled by ref counting in edit-session.unloadClipAssets()
			}
			throw new Error(`Invalid image source '${src}'.`);
		}

		this.texture = this.createCroppedTexture(texture);
		this.sprite = new pixi.Sprite(this.texture);
		this.contentContainer.addChild(this.sprite);

		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}
	}

	private disposeTexture(): void {
		if (this.sprite) {
			this.contentContainer.removeChild(this.sprite);
			this.sprite.destroy();
			this.sprite = null;
		}
		// DON'T destroy the texture - it's managed by Assets
		// The unloadClipAssets() method handles proper cleanup via Assets.unload()
		this.texture = null;
	}

	public override supportsEdgeResize(): boolean {
		return true;
	}

	private createCroppedTexture(texture: pixi.Texture<pixi.ImageSource>): pixi.Texture<pixi.ImageSource> {
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
		return new pixi.Texture({ source: texture.source, frame: crop });
	}
}
