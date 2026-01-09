import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import { type TimingIntent, sec } from "@core/timing/types";

import { commitTimingChange } from "./helpers/commit-timing-change";
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
 * Updates a clip's timing intent (start and/or length).
 * Supports manual values, "auto", and "end" modes.
 */
export class UpdateClipTimingCommand implements EditCommand {
	public readonly name = "UpdateClipTiming";

	private player: Player | null = null;
	private originalIntent: TimingIntent | null = null;
	private previousConfig: object | null = null;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private params: TimingUpdateParams
	) {}

	execute(context?: CommandContext): void {
		if (!context) return;

		const track = context.getTrack(this.trackIndex);
		if (!track || this.clipIndex < 0 || this.clipIndex >= track.length) {
			console.warn(`Invalid track/clip index: ${this.trackIndex}/${this.clipIndex}`);
			return;
		}

		this.player = track[this.clipIndex];
		this.originalIntent = this.player.getTimingIntent();
		// Deep clone to preserve original state (shallow copy shares nested object references)
		this.previousConfig = JSON.parse(JSON.stringify(this.player.clipConfiguration));

		// Build new timing intent from params
		const intentUpdates: Partial<TimingIntent> = {};

		if (this.params.start !== undefined) {
			intentUpdates.start = this.params.start === "auto" ? "auto" : sec(this.params.start / 1000);
		}

		if (this.params.length !== undefined) {
			if (this.params.length === "auto" || this.params.length === "end") {
				intentUpdates.length = this.params.length;
			} else {
				intentUpdates.length = sec(this.params.length / 1000);
			}
		}

		// Single mutation path: update timing through helper
		// This handles document update, intent, end-tracking, resolution, and assertions
		commitTimingChange(context, this.trackIndex, this.clipIndex, intentUpdates);

		// Special handling for "auto" length: trigger async resolution
		// The helper used a fallback; async resolution will update with real duration
		const newIntent = this.player.getTimingIntent();
		if (newIntent.length === "auto") {
			context.resolveClipAutoLength(this.player).then(() => {
				this.player?.reconfigureAfterRestore();
				this.player?.draw();
				context.updateDuration();
				context.propagateTimingChanges(this.trackIndex, this.clipIndex);
			});
		}

		this.player.draw();
		context.updateDuration();

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.previousConfig as any },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.player.clipConfiguration }
		});

		// Propagate to dependent clips
		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}

	undo(context?: CommandContext): void {
		// Explicit errors instead of silent failures
		if (!context) {
			throw new Error("UpdateClipTimingCommand.undo: No context provided");
		}
		if (!this.player) {
			throw new Error("UpdateClipTimingCommand.undo: No player - was execute() called?");
		}
		if (!this.originalIntent) {
			throw new Error("UpdateClipTimingCommand.undo: No original intent - was execute() called?");
		}

		// Single mutation path: restore original timing intent
		commitTimingChange(context, this.trackIndex, this.clipIndex, {
			start: this.originalIntent.start,
			length: this.originalIntent.length
		});

		// Special handling for "auto" length: trigger async resolution
		if (this.originalIntent.length === "auto") {
			context.resolveClipAutoLength(this.player).then(() => {
				this.player?.reconfigureAfterRestore();
				this.player?.draw();
				context.updateDuration();
				context.propagateTimingChanges(this.trackIndex, this.clipIndex);
			});
		}

		this.player.draw();
		context.updateDuration();

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.player.clipConfiguration },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.previousConfig as any }
		});

		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}
}
