import type { Edit } from "@core/edit";
import { type Size } from "@layouts/geometry";
import { type ResolvedClip } from "@schemas/clip";
import { type ImageAsset } from "@schemas/image-asset";
import * as pixi from "pixi.js";

import { Player } from "./player";

export class ImagePlayer extends Player {
	private texture: pixi.Texture<pixi.ImageSource> | null;
	private sprite: pixi.Sprite | null;
	private originalSize: Size | null;

	constructor(timeline: Edit, clipConfiguration: ResolvedClip) {
		super(timeline, clipConfiguration);

		this.texture = null;
		this.sprite = null;
		this.originalSize = null;
	}

	public override async load(): Promise<void> {
		await super.load();

		const imageAsset = this.clipConfiguration.asset as ImageAsset;

		const identifier = imageAsset.src;
		const loadOptions: pixi.UnresolvedAsset = {
			src: identifier,
			crossovern: "anonymous",
			data: {}
		};
		const texture = await this.edit.assetLoader.load<pixi.Texture<pixi.ImageSource>>(identifier, loadOptions);

		const isValidImageSource = texture?.source instanceof pixi.ImageSource;
		if (!isValidImageSource) {
			throw new Error(`Invalid image source '${imageAsset.src}'.`);
		}

		this.texture = this.createCroppedTexture(texture);
		this.sprite = new pixi.Sprite(this.texture);

		this.contentContainer.addChild(this.sprite);

		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}

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

		this.sprite?.destroy();
		this.sprite = null;

		this.texture?.destroy();
		this.texture = null;

		this.originalSize = null;
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

	protected override supportsEdgeResize(): boolean {
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
