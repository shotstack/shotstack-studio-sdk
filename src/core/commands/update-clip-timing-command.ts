import { EditEvent } from "@core/events/edit-events";
import { stripInternalProperties } from "@core/shared/clip-utils";
import type { Seconds } from "@core/timing/types";
import type { Clip } from "@schemas";

import { type CommandContext, type EditCommand, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Command parameters for timing updates.
 * Values in Seconds.
 */
export interface TimingUpdateParams {
	start?: Seconds | "auto";
	length?: Seconds | "auto" | "end";
}

/**
 * Document-only command to update a clip's timing.
 */
export class UpdateClipTimingCommand implements EditCommand {
	public readonly name = "UpdateClipTiming";

	/** Document-layer values for undo */
	private originalStart?: Clip["start"];
	private originalLength?: Clip["length"];
	private clipId?: string;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private params: TimingUpdateParams
	) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("UpdateClipTimingCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("UpdateClipTimingCommand.execute: document is required");

		// Get document clip to store original values
		const docTrack = context.getDocumentTrack(this.trackIndex);
		const docClip = docTrack?.clips[this.clipIndex];
		if (!docClip) {
			return CommandNoop(`Invalid clip at ${this.trackIndex}/${this.clipIndex}`);
		}

		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) {
			return CommandNoop(`Player not found at ${this.trackIndex}/${this.clipIndex}`);
		}

		// Store document-layer values for undo
		this.originalStart = docClip.start;
		this.originalLength = docClip.length;
		this.clipId = player.clipId ?? undefined;

		// Capture document clip BEFORE mutation (source of truth for SDK events)
		const previousDocClip = structuredClone(docClip);

		// Build document updates from params
		const updates: Partial<{ start: Seconds | "auto"; length: Seconds | "auto" | "end" }> = {};

		if (this.params.start !== undefined) {
			updates.start = this.params.start;
		}

		if (this.params.length !== undefined) {
			updates.length = this.params.length;
		}

		// Document-only mutation
		doc.updateClip(this.trackIndex, this.clipIndex, updates);

		// Single-clip resolution (O(1) instead of O(n) full resolve)
		if (this.clipId) {
			context.resolveClip(this.clipId);
		} else {
			context.resolve();
		}

		// Handle "auto" length async resolution
		if (updates.length === "auto") {
			context.resolveClipAutoLength(player).then(() => {
				context.updateDuration();
				context.propagateTimingChanges(this.trackIndex, this.clipIndex);
			});
		}

		context.updateDuration();

		// Get document clip AFTER mutation (source of truth for SDK events)
		const currentDocClip = context.getDocumentClip(this.trackIndex, this.clipIndex);
		if (!currentDocClip) throw new Error(`UpdateClipTimingCommand: document clip not found after mutation at ${this.trackIndex}/${this.clipIndex}`);

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: stripInternalProperties(previousDocClip) },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: stripInternalProperties(currentDocClip) }
		});

		context.propagateTimingChanges(this.trackIndex, this.clipIndex);

		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("UpdateClipTimingCommand.undo: context is required");
		if (this.originalStart === undefined && this.originalLength === undefined) {
			throw new Error("UpdateClipTimingCommand.undo: no original values");
		}

		const doc = context.getDocument();
		if (!doc) throw new Error("UpdateClipTimingCommand.undo: document is required");

		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) throw new Error("UpdateClipTimingCommand.undo: player not found");

		// Capture document clip BEFORE undo mutation (source of truth for SDK events)
		const currentDocClip = structuredClone(context.getDocumentClip(this.trackIndex, this.clipIndex));

		// Document-only mutation - restore original timing
		const updates: Partial<{ start: Clip["start"]; length: Clip["length"] }> = {};
		if (this.originalStart !== undefined) updates.start = this.originalStart;
		if (this.originalLength !== undefined) updates.length = this.originalLength;

		doc.updateClip(this.trackIndex, this.clipIndex, updates);

		// Single-clip resolution (O(1) instead of O(n) full resolve)
		if (this.clipId) {
			context.resolveClip(this.clipId);
		} else {
			context.resolve();
		}

		// Handle "auto" length async resolution
		if (this.originalLength === "auto") {
			context.resolveClipAutoLength(player).then(() => {
				context.updateDuration();
				context.propagateTimingChanges(this.trackIndex, this.clipIndex);
			});
		}

		context.updateDuration();

		// Get document clip AFTER undo mutation (source of truth for SDK events)
		const restoredDocClip = context.getDocumentClip(this.trackIndex, this.clipIndex);
		if (!currentDocClip || !restoredDocClip) {
			throw new Error(`UpdateClipTimingCommand: document clip not found after undo at ${this.trackIndex}/${this.clipIndex}`);
		}

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: stripInternalProperties(currentDocClip) },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: stripInternalProperties(restoredDocClip) }
		});

		context.propagateTimingChanges(this.trackIndex, this.clipIndex);

		return CommandSuccess();
	}
}
