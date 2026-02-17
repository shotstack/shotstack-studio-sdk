import type { Edit } from "@core/edit-session";
import { computeAiAssetNumber, isAiAsset } from "@core/shared/ai-asset-utils";
import { type Size } from "@layouts/geometry";
import { type ResolvedClip, type ImageToVideoAsset } from "@schemas";
import * as pixi from "pixi.js";

import { AiPendingOverlay } from "./ai-pending-overlay";
import { createPlaceholderGraphic } from "./placeholder-graphic";
import { Player, PlayerType } from "./player";

export class ImageToVideoPlayer extends Player {
	private sprite: pixi.Sprite | null = null;
	private texture: pixi.Texture<pixi.ImageSource> | null = null;
	private placeholder: pixi.Graphics | null = null;
	private aiOverlay: AiPendingOverlay | null = null;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.ImageToVideo);
	}

	public override async load(): Promise<void> {
		await super.load();

		const displaySize = this.getDisplaySize();

		// Compute asset number from resolved state
		const allClips = this.edit.getResolvedEdit()?.timeline.tracks.flatMap(t => t.clips) ?? [];
		const assetNumber = computeAiAssetNumber(allClips, this.clipId ?? "");

		// Extract resolved prompt and asset type
		const { asset } = this.clipConfiguration;
		const prompt = isAiAsset(asset) ? asset.prompt || "" : "";
		const assetType = isAiAsset(asset) ? asset.type : "image-to-video";

		try {
			await this.loadTexture();
			this.aiOverlay = new AiPendingOverlay({
				mode: "badge",
				icon: "video",
				width: displaySize.width,
				height: displaySize.height,
				assetNumber: assetNumber ?? undefined,
				prompt,
				assetType
			});
		} catch {
			this.placeholder = createPlaceholderGraphic(displaySize.width, displaySize.height);
			this.contentContainer.addChild(this.placeholder);
			this.aiOverlay = new AiPendingOverlay({
				mode: "panel",
				icon: "video",
				width: displaySize.width,
				height: displaySize.height,
				assetNumber: assetNumber ?? undefined,
				prompt,
				assetType
			});
		}

		this.contentContainer.addChild(this.aiOverlay.getContainer());
		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		const displaySize = this.getDisplaySize();
		this.aiOverlay?.resize(displaySize.width, displaySize.height);

		const overlayContainer = this.aiOverlay?.getContainer();
		if (overlayContainer) {
			const containerScale = this.getContainerScale();
			const size = this.getSize();

			// Counter-scale so overlay renders at screen-space pixels
			overlayContainer.scale.set(1 / containerScale.x, 1 / containerScale.y);

			// Position at the top-left of the visible content rect
			overlayContainer.position.set(
				size.width / 2 - displaySize.width / (2 * containerScale.x),
				size.height / 2 - displaySize.height / (2 * containerScale.y)
			);
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
			width: this.sprite?.width || this.edit.size.width,
			height: this.sprite?.height || this.edit.size.height
		};
	}

	public override dispose(): void {
		if (this.sprite) {
			this.contentContainer.removeChild(this.sprite);
			this.sprite.destroy();
			this.sprite = null;
		}
		this.texture = null;

		this.placeholder?.destroy();
		this.placeholder = null;

		this.aiOverlay?.dispose();
		this.aiOverlay = null;

		super.dispose();
	}

	private getDisplaySize(): Size {
		return {
			width: this.clipConfiguration.width ?? this.edit.size.width,
			height: this.clipConfiguration.height ?? this.edit.size.height
		};
	}

	private async loadTexture(): Promise<void> {
		const asset = this.clipConfiguration.asset as ImageToVideoAsset;
		const { src } = asset;

		const corsUrl = `${src}${src.includes("?") ? "&" : "?"}x-cors=1`;
		const loadOptions: pixi.UnresolvedAsset = { src: corsUrl, crossorigin: "anonymous", data: {} };
		const texture = await this.edit.assetLoader.load<pixi.Texture<pixi.ImageSource>>(corsUrl, loadOptions);

		if (!(texture?.source instanceof pixi.ImageSource)) {
			if (texture) {
				texture.destroy(true);
			}
			throw new Error(`Invalid image source '${src}'.`);
		}

		this.texture = texture;
		this.sprite = new pixi.Sprite(this.texture);
		this.contentContainer.addChild(this.sprite);

		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}
	}
}
