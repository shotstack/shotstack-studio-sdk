import { EditEvent } from "@core/events/edit-events";
import { stripInternalProperties } from "@core/shared/clip-utils";
import type { Clip } from "@schemas";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Transforms a clip's asset type.
 * Used for luma attachment (image/video → luma) and detachment (luma → image/video).
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

	public execute(context: CommandContext): CommandResult {
		const document = context.getDocument();
		if (!document) throw new Error("Cannot transform clip: no document");

		const clip = document.getClip(this.trackIndex, this.clipIndex);
		if (!clip?.asset) return CommandNoop("Invalid clip or no asset");

		// Capture document clip BEFORE mutation (source of truth for SDK events)
		const previousDocClip = structuredClone(clip);

		// Store original for undo
		this.originalAsset = structuredClone(clip.asset);
		this.originalAssetType = ((clip.asset as { type?: string })?.type as "image" | "video" | "luma") ?? null;

		// Only works for src-based assets
		const originalAsset = clip.asset as { src?: string };
		if (!originalAsset.src) {
			return CommandNoop("Asset has no src property");
		}

		// Create new asset with target type (minimal - resolver fills in details)
		const newAsset = { type: this.targetAssetType, src: originalAsset.src };

		// Document mutation
		context.documentUpdateClip(this.trackIndex, this.clipIndex, { asset: newAsset });

		// Full resolve (required for asset type changes - needs Player recreation with tracks array management)
		context.resolve();

		// Get document clip AFTER mutation (source of truth for SDK events)
		const currentDocClip = context.getDocumentClip(this.trackIndex, this.clipIndex);
		if (!currentDocClip) throw new Error(`TransformClipAssetCommand: document clip not found after mutation at ${this.trackIndex}/${this.clipIndex}`);

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: stripInternalProperties(previousDocClip) },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: stripInternalProperties(currentDocClip) }
		});

		return CommandSuccess();
	}

	public undo(context: CommandContext): CommandResult {
		if (!this.originalAsset) return CommandNoop("No original asset stored");

		// Capture document clip BEFORE undo mutation (source of truth for SDK events)
		const currentDocClip = structuredClone(context.getDocumentClip(this.trackIndex, this.clipIndex));

		// Document mutation - restore original asset
		context.documentUpdateClip(this.trackIndex, this.clipIndex, { asset: this.originalAsset });

		// Full resolve (required for asset type changes - needs Player recreation with tracks array management)
		context.resolve();

		// Get document clip AFTER undo mutation (restored state)
		const restoredDocClip = context.getDocumentClip(this.trackIndex, this.clipIndex);
		if (!currentDocClip || !restoredDocClip) {
			throw new Error(`TransformClipAssetCommand: document clip not found after undo at ${this.trackIndex}/${this.clipIndex}`);
		}

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: stripInternalProperties(currentDocClip) },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: stripInternalProperties(restoredDocClip) }
		});

		return CommandSuccess();
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
