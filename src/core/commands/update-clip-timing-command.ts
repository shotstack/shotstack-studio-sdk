import { EditEvent } from "@core/events/edit-events";
import { type Seconds, type TimingIntent, sec } from "@core/timing/types";
import type { ResolvedClip } from "@schemas";

import type { CommandContext, EditCommand } from "./types";

/**
 * Command parameters for timing updates.
 * Values in milliseconds (for UI convenience).
 */
export interface TimingUpdateParams {
	start?: number | "auto";
	length?: number | "auto" | "end";
}

/**
 * Document-only command to update a clip's timing.
 * Supports manual values, "auto", and "end" modes.
 *
 * Flow: Document mutation → resolve() → Reconciler updates Player
 */
export class UpdateClipTimingCommand implements EditCommand {
	public readonly name = "UpdateClipTiming";

	private originalIntent?: TimingIntent;
	private previousClipConfig?: ResolvedClip;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private params: TimingUpdateParams
	) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("UpdateClipTimingCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("UpdateClipTimingCommand.execute: document is required");

		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) {
			console.warn(`Invalid clip at ${this.trackIndex}/${this.clipIndex}`);
			return;
		}

		// Store for undo
		this.previousClipConfig = structuredClone(player.clipConfiguration);
		this.originalIntent = player.getTimingIntent();

		// Build document updates from params (convert ms to seconds)
		const updates: Partial<{ start: Seconds | "auto"; length: Seconds | "auto" | "end" }> = {};

		if (this.params.start !== undefined) {
			updates.start = this.params.start === "auto" ? "auto" : sec(this.params.start / 1000);
		}

		if (this.params.length !== undefined) {
			if (this.params.length === "auto" || this.params.length === "end") {
				updates.length = this.params.length;
			} else {
				updates.length = sec(this.params.length / 1000);
			}
		}

		// Document-only mutation
		doc.updateClip(this.trackIndex, this.clipIndex, updates);

		// Reconciler handles player updates
		context.resolve();

		// Handle "auto" length async resolution
		if (updates.length === "auto") {
			context.resolveClipAutoLength(player).then(() => {
				context.updateDuration();
				context.propagateTimingChanges(this.trackIndex, this.clipIndex);
			});
		}

		// Handle "end" length tracking
		if (updates.length === "end") {
			context.trackEndLengthClip(player);
		} else if (updates.length !== undefined && this.originalIntent?.length === "end") {
			// Changing from "end" to something else → untrack
			context.untrackEndLengthClip(player);
		}

		context.updateDuration();

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.previousClipConfig },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: player.clipConfiguration }
		});

		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("UpdateClipTimingCommand.undo: context is required");
		if (!this.originalIntent) throw new Error("UpdateClipTimingCommand.undo: no original intent");

		const doc = context.getDocument();
		if (!doc) throw new Error("UpdateClipTimingCommand.undo: document is required");

		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) throw new Error("UpdateClipTimingCommand.undo: player not found");

		const currentConfig = structuredClone(player.clipConfiguration);

		// Document-only mutation - restore original timing
		doc.updateClip(this.trackIndex, this.clipIndex, {
			start: this.originalIntent.start,
			length: this.originalIntent.length
		});

		// Reconciler handles player updates
		context.resolve();

		// Handle "auto" length async resolution
		if (this.originalIntent.length === "auto") {
			context.resolveClipAutoLength(player).then(() => {
				context.updateDuration();
				context.propagateTimingChanges(this.trackIndex, this.clipIndex);
			});
		}

		// Handle "end" length tracking restoration
		if (this.originalIntent.length === "end") {
			context.trackEndLengthClip(player);
		}

		context.updateDuration();

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: currentConfig },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: player.clipConfiguration }
		});

		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}
}
