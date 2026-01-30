import type { Edit } from "@core/edit-session";
import { computeAiAssetNumber, isAiAsset } from "@core/shared/ai-asset-utils";
import { type Size } from "@layouts/geometry";
import type { ResolvedClip } from "@schemas";

import { AiPendingOverlay } from "./ai-pending-overlay";
import { Player, PlayerType } from "./player";

export class TextToImagePlayer extends Player {
	private aiOverlay: AiPendingOverlay | null = null;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.TextToImage);
	}

	public override async load(): Promise<void> {
		await super.load();

		const { width, height } = this.getSize();

		// Compute asset number from resolved state
		const allClips = this.edit.getResolvedEdit()?.timeline.tracks.flatMap(t => t.clips) ?? [];
		const assetNumber = computeAiAssetNumber(allClips, this.clipId ?? "");

		// Extract resolved prompt and asset type
		const { asset } = this.clipConfiguration;
		const prompt = isAiAsset(asset) ? asset.prompt || "" : "";
		const assetType = isAiAsset(asset) ? asset.type : "text-to-image";

		this.aiOverlay = new AiPendingOverlay({
			mode: "panel",
			icon: "image",
			width,
			height,
			assetNumber: assetNumber ?? undefined,
			prompt,
			assetType
		});
		this.contentContainer.addChild(this.aiOverlay.getContainer());

		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);
		const { width, height } = this.getSize();
		this.aiOverlay?.resize(width, height);
	}

	public override getSize(): Size {
		const asset = this.clipConfiguration.asset as { width?: number; height?: number };
		return {
			width: this.clipConfiguration.width ?? asset.width ?? this.edit.size.width,
			height: this.clipConfiguration.height ?? asset.height ?? this.edit.size.height
		};
	}

	public override dispose(): void {
		this.aiOverlay?.dispose();
		this.aiOverlay = null;
		super.dispose();
	}
}
