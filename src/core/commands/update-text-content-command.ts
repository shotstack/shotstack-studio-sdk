import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip, TextAsset } from "@schemas";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Document-only command to update text content in a text clip.
 */
export class UpdateTextContentCommand implements EditCommand {
	readonly name = "updateTextContent";

	private clipId: string | null = null;
	private previousText = "";
	private previousClipConfig?: ResolvedClip;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private newText: string
	) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("UpdateTextContentCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("UpdateTextContentCommand.execute: document is required");

		// Get current player for config and ID
		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) {
			return CommandNoop(`Invalid clip at ${this.trackIndex}/${this.clipIndex}`);
		}

		// Store for undo
		this.clipId = player.clipId;
		this.previousClipConfig = structuredClone(player.clipConfiguration);
		const { asset } = player.clipConfiguration;
		this.previousText = asset && "text" in asset ? ((asset as TextAsset).text ?? "") : "";

		// Get current clip from document
		const clip = doc.getClip(this.trackIndex, this.clipIndex);
		if (!clip) return CommandNoop("Clip not found in document");

		// Update document with new text
		const currentAsset = clip.asset as TextAsset;
		const newAsset = { ...currentAsset, text: this.newText };
		doc.updateClip(this.trackIndex, this.clipIndex, { asset: newAsset });

		// Single-clip resolution (O(1) instead of O(n) full resolve)
		if (this.clipId) {
			context.resolveClip(this.clipId);
		} else {
			context.resolve();
		}

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: this.previousClipConfig, trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: player.clipConfiguration, trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});

		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("UpdateTextContentCommand.undo: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("UpdateTextContentCommand.undo: document is required");

		const player = this.clipId ? context.getPlayerByClipId(this.clipId) : context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) return CommandNoop("Player not found for undo");

		const currentConfig = structuredClone(player.clipConfiguration);

		// Get current clip from document
		const clip = doc.getClip(this.trackIndex, this.clipIndex);
		if (!clip) return CommandNoop("Clip not found for undo");

		// Restore previous text in document
		const currentAsset = clip.asset as TextAsset;
		const restoredAsset = { ...currentAsset, text: this.previousText };
		doc.updateClip(this.trackIndex, this.clipIndex, { asset: restoredAsset });

		// Single-clip resolution (O(1) instead of O(n) full resolve)
		if (this.clipId) {
			context.resolveClip(this.clipId);
		} else {
			context.resolve();
		}

		if (this.previousClipConfig) {
			context.emitEvent(EditEvent.ClipUpdated, {
				previous: { clip: currentConfig, trackIndex: this.trackIndex, clipIndex: this.clipIndex },
				current: { clip: this.previousClipConfig, trackIndex: this.trackIndex, clipIndex: this.clipIndex }
			});
		}

		return CommandSuccess();
	}

	dispose(): void {
		this.clipId = null;
		this.previousClipConfig = undefined;
	}
}
