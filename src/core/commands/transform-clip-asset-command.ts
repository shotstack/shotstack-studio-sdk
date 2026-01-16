import { EditEvent } from "@core/events/edit-events";
import type { Clip, ResolvedClip } from "@schemas";

import type { EditCommand, CommandContext } from "./types";

/**
 * Transforms a clip's asset type.
 * Used for luma attachment (image/video → luma) and detachment (luma → image/video).
 *
 * Document-only: This command only mutates the document.
 * The PlayerReconciler handles Player recreation via the Resolved event
 * (detects asset type change and recreates the Player).
 *
 * NOTE: Uses full resolve() instead of resolveClip() because asset type changes
 * require Player recreation, which needs the full reconciler's rebuildTracksOrdering()
 * to properly manage the tracks array. This is acceptable since asset type changes
 * are rare operations (only luma attachment/detachment).
 */
export class TransformClipAssetCommand implements EditCommand {
	public readonly name = "TransformClipAsset";

	private originalAsset: Clip["asset"] | null = null;
	private originalAssetType: "image" | "video" | "luma" | null = null;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private targetAssetType: "image" | "video" | "luma"
	) {}

	public execute(context: CommandContext): void {
		const document = context.getDocument();
		if (!document) throw new Error("Cannot transform clip: no document");

		const clip = document.getClip(this.trackIndex, this.clipIndex);
		if (!clip?.asset) throw new Error("Cannot transform clip: invalid clip or no asset");

		// Store original for undo
		this.originalAsset = structuredClone(clip.asset);
		this.originalAssetType = ((clip.asset as { type?: string })?.type as "image" | "video" | "luma") ?? null;

		// Only works for src-based assets
		const originalAsset = clip.asset as { src?: string };
		if (!originalAsset.src) {
			throw new Error("Cannot transform clip: asset has no src property");
		}

		// Create new asset with target type (minimal - resolver fills in details)
		const newAsset = { type: this.targetAssetType, src: originalAsset.src };

		// Document mutation
		context.documentUpdateClip(this.trackIndex, this.clipIndex, { asset: newAsset });

		// Full resolve (required for asset type changes - needs Player recreation with tracks array management)
		context.resolve();

		// Get resolved clip for event
		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		const newConfig = player?.clipConfiguration;

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: { asset: this.originalAsset } as ResolvedClip },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: newConfig! }
		});
	}

	public undo(context: CommandContext): void {
		if (!this.originalAsset) return;

		// Document mutation - restore original asset
		context.documentUpdateClip(this.trackIndex, this.clipIndex, { asset: this.originalAsset });

		// Full resolve (required for asset type changes - needs Player recreation with tracks array management)
		context.resolve();

		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		const currentConfig = player?.clipConfiguration;

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: currentConfig! },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: { asset: this.originalAsset } as ResolvedClip }
		});
	}

	/** Get the stored original asset type (used for reliable restoration) */
	public getOriginalAssetType(): "image" | "video" | "luma" | null {
		return this.originalAssetType;
	}

	public dispose(): void {
		this.originalAsset = null;
		this.originalAssetType = null;
	}
}
