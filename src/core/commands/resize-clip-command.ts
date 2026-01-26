import { EditEvent } from "@core/events/edit-events";
import { stripInternalProperties } from "@core/shared/clip-utils";
import type { Seconds } from "@core/timing/types";
import type { Clip } from "@schemas";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Document-only command to resize a clip's length.
 */
export class ResizeClipCommand implements EditCommand {
	readonly name = "resizeClip";

	/** Document-layer value for undo (may be "auto", "end", or numeric) */
	private originalLength?: Clip["length"];
	private clipId?: string;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private newLength: Seconds
	) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("ResizeClipCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("ResizeClipCommand.execute: document is required");

		// Get document clip to store original length
		const docTrack = context.getDocumentTrack(this.trackIndex);
		const docClip = docTrack?.clips[this.clipIndex];
		if (!docClip) {
			return CommandNoop(`Invalid clip at ${this.trackIndex}/${this.clipIndex}`);
		}

		// Get current player for event emission
		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) {
			return CommandNoop(`Player not found at ${this.trackIndex}/${this.clipIndex}`);
		}

		// Store document-layer value for undo
		this.originalLength = docClip.length;
		this.clipId = player.clipId ?? undefined;

		// Capture document clip BEFORE mutation
		const previousDocClip = structuredClone(docClip);

		// Document-only mutation
		doc.updateClip(this.trackIndex, this.clipIndex, { length: this.newLength });

		// Single-clip resolution (O(1) instead of O(n) full resolve)
		if (this.clipId) {
			context.resolveClip(this.clipId);
		} else {
			context.resolve();
		}

		context.updateDuration();

		// Get document clip AFTER mutation
		const currentDocClip = context.getDocumentClip(this.trackIndex, this.clipIndex);
		if (!currentDocClip) throw new Error(`ResizeClipCommand: document clip not found after mutation at ${this.trackIndex}/${this.clipIndex}`);

		// Emit event with document clips
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: stripInternalProperties(previousDocClip), trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: stripInternalProperties(currentDocClip), trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});

		context.propagateTimingChanges(this.trackIndex, this.clipIndex);

		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("ResizeClipCommand.undo: context is required");
		if (this.originalLength === undefined) throw new Error("ResizeClipCommand.undo: no original length");

		const doc = context.getDocument();
		if (!doc) throw new Error("ResizeClipCommand.undo: document is required");

		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) throw new Error("ResizeClipCommand.undo: player not found");

		// Capture document clip BEFORE undo mutation
		const currentDocClip = structuredClone(context.getDocumentClip(this.trackIndex, this.clipIndex));

		// Document-only mutation - restore original length (may be "auto", "end", or numeric)
		doc.updateClip(this.trackIndex, this.clipIndex, { length: this.originalLength });

		// Single-clip resolution (O(1) instead of O(n) full resolve)
		if (this.clipId) {
			context.resolveClip(this.clipId);
		} else {
			context.resolve();
		}

		context.updateDuration();

		// Get document clip AFTER undo mutation
		const restoredDocClip = context.getDocumentClip(this.trackIndex, this.clipIndex);
		if (!currentDocClip || !restoredDocClip) {
			throw new Error(`ResizeClipCommand: document clip not found after undo at ${this.trackIndex}/${this.clipIndex}`);
		}

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: stripInternalProperties(currentDocClip), trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: stripInternalProperties(restoredDocClip), trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});

		context.propagateTimingChanges(this.trackIndex, this.clipIndex);

		return CommandSuccess();
	}
}
