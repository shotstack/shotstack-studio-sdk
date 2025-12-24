import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import { calculateTimelineEnd } from "@core/timing/resolver";
import { type Seconds, type TimingIntent, ms, sec, toMs } from "@core/timing/types";

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
		this.previousConfig = { ...this.player.clipConfiguration };

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

		// If length is "auto", resolve it
		if (newIntent.length === "auto") {
			context.resolveClipAutoLength(this.player).then(() => {
				this.player?.reconfigureAfterRestore();
				this.player?.draw();
				context.updateDuration();
				context.propagateTimingChanges(this.trackIndex, this.clipIndex);
			});
		} else if (newIntent.length === "end") {
			// Track this clip for end-length updates
			context.trackEndLengthClip(this.player);
			// Resolve immediately based on current timeline end
			const timelineEnd = calculateTimelineEnd(context.getTracks());
			const resolvedLength = ms(Math.max(timelineEnd - this.player.getStart(), 100)); // Minimum 100ms
			this.player.setResolvedTiming({
				start: this.player.getStart(),
				length: resolvedLength
			});
		} else {
			// Fixed length - resolve immediately
			context.untrackEndLengthClip(this.player);
			this.player.setResolvedTiming({
				start: typeof newIntent.start === "number" ? toMs(newIntent.start) : this.player.getStart(),
				length: toMs(newIntent.length as Seconds)
			});
		}

		// Handle start timing
		if (newIntent.start !== "auto") {
			this.player.setResolvedTiming({
				start: toMs(newIntent.start),
				length: this.player.getLength()
			});
		}

		this.player.reconfigureAfterRestore();
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
		if (intent.start !== "auto") {
			config.start = intent.start as number;
		}
		if (intent.length !== "auto" && intent.length !== "end") {
			config.length = intent.length as number;
		}
	}
}
