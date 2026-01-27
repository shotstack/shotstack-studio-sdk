import { Player, PlayerType } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import { type Size } from "@layouts/geometry";
import { SvgAssetSchema, type ResolvedClip, type SvgAsset } from "@schemas";
import { initResvg, renderSvgAssetToPng, type CanvasSvgAsset } from "@shotstack/shotstack-canvas";
import * as pixi from "pixi.js";

import { createPlaceholderGraphic } from "./placeholder-graphic";

const RESVG_WASM_URL = "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";

export class SvgPlayer extends Player {
	private static resvgInitialized: boolean = false;
	private static resvgInitPromise: Promise<void> | null = null;
	private texture: pixi.Texture | null = null;
	private sprite: pixi.Sprite | null = null;
	private renderedWidth: number = 0;
	private renderedHeight: number = 0;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Svg);
	}

	private static async initializeResvg(): Promise<void> {
		if (SvgPlayer.resvgInitialized) {
			return;
		}

		if (SvgPlayer.resvgInitPromise) {
			await SvgPlayer.resvgInitPromise;
			return;
		}

		SvgPlayer.resvgInitPromise = (async () => {
			const response = await fetch(RESVG_WASM_URL);
			const wasmBytes = await response.arrayBuffer();
			await initResvg(wasmBytes);
			SvgPlayer.resvgInitialized = true;
		})();

		await SvgPlayer.resvgInitPromise;
	}

	public override async load(): Promise<void> {
		await super.load();

		let svgAsset = this.clipConfiguration.asset as SvgAsset;

		if (svgAsset.src) {
			const resolvedSrc = this.edit.resolveMergeFields(svgAsset.src);
			if (resolvedSrc !== svgAsset.src) {
				svgAsset = { ...svgAsset, src: resolvedSrc };
			}
		}

		try {
			const validationResult = SvgAssetSchema.safeParse(svgAsset);
			if (!validationResult.success) {
				this.createFallbackGraphic();
				return;
			}

			await SvgPlayer.initializeResvg();

			const defaultWidth = this.clipConfiguration.width || this.edit.size.width;
			const defaultHeight = this.clipConfiguration.height || this.edit.size.height;

			const result = await renderSvgAssetToPng(svgAsset as CanvasSvgAsset, {
				defaultWidth,
				defaultHeight
			});

			this.renderedWidth = result.width;
			this.renderedHeight = result.height;

			const blob = new Blob([result.png as BlobPart], { type: "image/png" });
			const imageUrl = URL.createObjectURL(blob);

			const image = new Image();
			image.src = imageUrl;

			await new Promise<void>((resolve, reject) => {
				image.onload = () => resolve();
				image.onerror = () => reject(new Error("Failed to load SVG image"));
			});

			URL.revokeObjectURL(imageUrl);

			this.texture = pixi.Texture.from(image);
			this.sprite = new pixi.Sprite(this.texture);
			this.contentContainer.addChild(this.sprite);

			if (this.clipConfiguration.width && this.clipConfiguration.height) {
				this.applyFixedDimensions();
			}

			this.configureKeyframes();
		} catch (error) {
			console.error("Failed to render SVG asset:", error);
			this.createFallbackGraphic();
		}
	}

	public override async reloadAsset(): Promise<void> {
		await this.rerenderAtCurrentDimensions();
	}

	private createFallbackGraphic(): void {
		const width = this.clipConfiguration.width || this.edit.size.width;
		const height = this.clipConfiguration.height || this.edit.size.height;

		const graphics = createPlaceholderGraphic(width, height);

		this.renderedWidth = width;
		this.renderedHeight = height;
		this.contentContainer.addChild(graphics);
		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);
	}

	public override dispose(): void {
		super.dispose();

		if (this.sprite) {
			this.sprite.destroy();
			this.sprite = null;
		}

		if (this.texture) {
			this.texture.destroy(true);
			this.texture = null;
		}
	}

	public override getSize(): Size {
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			return {
				width: this.clipConfiguration.width,
				height: this.clipConfiguration.height
			};
		}

		return {
			width: this.renderedWidth || this.edit.size.width,
			height: this.renderedHeight || this.edit.size.height
		};
	}

	public override getContentSize(): Size {
		return {
			width: this.renderedWidth || this.edit.size.width,
			height: this.renderedHeight || this.edit.size.height
		};
	}

	protected override getFitScale(): number {
		return 1;
	}

	public override supportsEdgeResize(): boolean {
		return true;
	}

	protected override onDimensionsChanged(): void {
		this.rerenderAtCurrentDimensions();
	}

	private async rerenderAtCurrentDimensions(): Promise<void> {
		const svgAsset = this.clipConfiguration.asset as SvgAsset;
		const width = this.clipConfiguration.width || this.edit.size.width;
		const height = this.clipConfiguration.height || this.edit.size.height;

		try {
			const result = await renderSvgAssetToPng(svgAsset as CanvasSvgAsset, {
				defaultWidth: width,
				defaultHeight: height
			});

			this.renderedWidth = result.width;
			this.renderedHeight = result.height;

			if (this.sprite) {
				this.contentContainer.removeChild(this.sprite);
				this.sprite.destroy();
				this.sprite = null;
			}
			if (this.texture) {
				this.texture.destroy(true);
				this.texture = null;
			}

			const blob = new Blob([result.png as BlobPart], { type: "image/png" });
			const imageUrl = URL.createObjectURL(blob);

			const image = new Image();
			image.src = imageUrl;

			await new Promise<void>((resolve, reject) => {
				image.onload = () => resolve();
				image.onerror = () => reject(new Error("Failed to load SVG image"));
			});

			URL.revokeObjectURL(imageUrl);

			this.texture = pixi.Texture.from(image);
			this.sprite = new pixi.Sprite(this.texture);
			this.contentContainer.addChild(this.sprite);

			if (this.clipConfiguration.width && this.clipConfiguration.height) {
				this.applyFixedDimensions();
			}
		} catch (error) {
			console.error("Failed to re-render SVG at new dimensions:", error);
		}
	}
}
