import { EditEvent } from "@core/events/edit-events";
import { stripInternalProperties } from "@core/shared/clip-utils";
import type { Clip, TextAsset } from "@schemas";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Document-only command to update text content in a text clip.
 */
export class UpdateTextContentCommand implements EditCommand {
	readonly name = "updateTextContent";

	private clipId: string | null = null;
	private previousText = "";
	/** Document clip state before mutation (source of truth for SDK events) */
	private previousDocClip?: Clip;

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

		// Get document clip BEFORE mutation (source of truth for SDK events)
		const docClip = doc.getClip(this.trackIndex, this.clipIndex);
		if (!docClip) return CommandNoop("Clip not found in document");

		// Store for undo
		this.clipId = player.clipId;
		this.previousDocClip = structuredClone(docClip);
		const docAsset = docClip.asset as TextAsset;
		this.previousText = docAsset && "text" in docAsset ? (docAsset.text ?? "") : "";

		// Update document with new text
		const currentAsset = docClip.asset as TextAsset;
		const newAsset = { ...currentAsset, text: this.newText };
		doc.updateClip(this.trackIndex, this.clipIndex, { asset: newAsset });

		// Single-clip resolution (O(1) instead of O(n) full resolve)
		if (this.clipId) {
			context.resolveClip(this.clipId);
		} else {
			context.resolve();
		}

		// Get document clip AFTER mutation (source of truth for SDK events)
		const currentDocClip = context.getDocumentClip(this.trackIndex, this.clipIndex);
		if (!this.previousDocClip || !currentDocClip)
			throw new Error(`UpdateTextContentCommand: document clip not found after mutation at ${this.trackIndex}/${this.clipIndex}`);

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: stripInternalProperties(this.previousDocClip), trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: stripInternalProperties(currentDocClip), trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});

		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("UpdateTextContentCommand.undo: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("UpdateTextContentCommand.undo: document is required");

		// Get document clip BEFORE undo mutation (source of truth for SDK events)
		const currentDocClip = structuredClone(context.getDocumentClip(this.trackIndex, this.clipIndex));

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

		// Get document clip AFTER undo mutation (restored state)
		const restoredDocClip = context.getDocumentClip(this.trackIndex, this.clipIndex);

		if (this.previousDocClip) {
			if (!currentDocClip || !restoredDocClip) {
				throw new Error(`UpdateTextContentCommand: document clip not found after undo at ${this.trackIndex}/${this.clipIndex}`);
			}
			context.emitEvent(EditEvent.ClipUpdated, {
				previous: { clip: stripInternalProperties(currentDocClip), trackIndex: this.trackIndex, clipIndex: this.clipIndex },
				current: { clip: stripInternalProperties(restoredDocClip), trackIndex: this.trackIndex, clipIndex: this.clipIndex }
			});
		}

		return CommandSuccess();
	}

	dispose(): void {
		this.clipId = null;
		this.previousDocClip = undefined;
	}
}
