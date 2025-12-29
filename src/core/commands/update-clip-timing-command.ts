import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import { calculateTimelineEnd, resolveAutoStart } from "@core/timing/resolver";
import { type Seconds, type TimingIntent, sec } from "@core/timing/types";

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

		// Build new timing intent
		const newIntent: TimingIntent = {
			start: this.originalIntent.start,
			length: this.originalIntent.length
		};

		// Update start if provided
		if (this.params.start !== undefined) {
			newIntent.start = this.params.start === "auto" ? "auto" : sec(this.params.start / 1000);
		}

		// Update length if provided
		if (this.params.length !== undefined) {
			if (this.params.length === "auto" || this.params.length === "end") {
				newIntent.length = this.params.length;
			} else {
				newIntent.length = sec(this.params.length / 1000);
			}
		}

		// Apply the new timing intent
		this.player.setTimingIntent(newIntent);

		// Update clip configuration to reflect the intent
		this.updateClipConfiguration(this.player, newIntent);

		// STEP 1: Resolve start FIRST (needed for correct length calculations)
		// resolveAutoStart now returns Seconds, newIntent.start is already Seconds
		const resolvedStart: Seconds = newIntent.start === "auto" ? resolveAutoStart(this.trackIndex, this.clipIndex, context.getTracks()) : newIntent.start;

		// STEP 2: Resolve length using the correct resolved start
		if (newIntent.length === "auto") {
			// Set start immediately, length will be resolved async
			this.player.setResolvedTiming({
				start: resolvedStart,
				length: this.player.getLength() // Temporary, will be updated
			});

			context.resolveClipAutoLength(this.player).then(() => {
				this.player?.reconfigureAfterRestore();
				this.player?.draw();
				context.updateDuration();
				context.propagateTimingChanges(this.trackIndex, this.clipIndex);
			});

			// Still need to reconfigure and emit event for the start change
			this.player.reconfigureAfterRestore();
			this.player.draw();
		} else if (newIntent.length === "end") {
			// Track this clip for end-length updates
			context.trackEndLengthClip(this.player);

			// Resolve based on current timeline end using correct start (all in Seconds)
			const timelineEnd = calculateTimelineEnd(context.getTracks());
			const resolvedLength = sec(Math.max(timelineEnd - resolvedStart, 0.1)); // Minimum 0.1 seconds

			this.player.setResolvedTiming({
				start: resolvedStart,
				length: resolvedLength
			});

			this.player.reconfigureAfterRestore();
			this.player.draw();
		} else {
			// Fixed length - resolve immediately (newIntent.length is already Seconds)
			context.untrackEndLengthClip(this.player);

			this.player.setResolvedTiming({
				start: resolvedStart,
				length: newIntent.length
			});

			this.player.reconfigureAfterRestore();
			this.player.draw();
		}

		context.updateDuration();
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.previousConfig as any },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.player.clipConfiguration }
		});

		// Propagate to dependent clips
		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}

	undo(context?: CommandContext): void {
		if (!context || !this.player || !this.originalIntent) return;

		// Restore original intent
		this.player.setTimingIntent(this.originalIntent);

		// Restore clip configuration
		if (this.previousConfig) {
			context.restoreClipConfiguration(this.player, this.previousConfig as any);
		}

		// Re-resolve timing based on original intent
		if (this.originalIntent.length === "auto") {
			context.resolveClipAutoLength(this.player);
		} else if (this.originalIntent.length === "end") {
			context.trackEndLengthClip(this.player);
		} else {
			context.untrackEndLengthClip(this.player);
		}

		this.player.reconfigureAfterRestore();
		this.player.draw();

		context.updateDuration();
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.player.clipConfiguration },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.previousConfig as any }
		});

		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}

	/**
	 * Update clip configuration to reflect the timing intent.
	 */
	private updateClipConfiguration(player: Player, intent: TimingIntent): void {
		const config = player.clipConfiguration;

		// Update config with explicit values (auto/end keep resolved numeric values)
		// intent.start/length are already Seconds when numeric
		if (intent.start !== "auto") {
			config.start = intent.start;
		}
		if (intent.length !== "auto" && intent.length !== "end") {
			config.length = intent.length;
		}
	}
}
