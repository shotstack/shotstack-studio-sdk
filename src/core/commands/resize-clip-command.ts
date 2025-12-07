import type { Player } from "@canvas/players/player";
import type { TimingIntent } from "@core/timing/types";

import type { EditCommand, CommandContext } from "./types";

export class ResizeClipCommand implements EditCommand {
	name = "resizeClip";
	private originalLength?: number;
	private originalTimingIntent?: TimingIntent;
	private player?: Player;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private newLength: number
	) {}

	execute(context?: CommandContext): void {
		if (!context) return;

		// Get the specific track
		const track = context.getTrack(this.trackIndex);
		if (!track) {
			console.warn(`Invalid track index: ${this.trackIndex}`);
			return;
		}

		if (this.clipIndex < 0 || this.clipIndex >= track.length) {
			console.warn(`Invalid clip index: ${this.clipIndex} for track ${this.trackIndex}`);
			return;
		}

		this.player = track[this.clipIndex];
		this.originalLength = this.player.clipConfiguration.length;

		// Store original timing intent for undo
		this.originalTimingIntent = this.player.getTimingIntent();

		// Convert to fixed timing when manually resized
		this.player.convertToFixedTiming();

		this.player.clipConfiguration.length = this.newLength;

		// Update resolved timing
		this.player.setResolvedTiming({
			start: this.player.getStart(),
			length: this.newLength * 1000
		});

		this.player.reconfigureAfterRestore();
		this.player.draw();

		context.updateDuration();
		context.emitEvent("clip:updated", {
			previous: { clip: { ...this.player.clipConfiguration, length: this.originalLength }, trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: this.player.clipConfiguration, trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});

		// Propagate timing changes to dependent clips
		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}

	undo(context?: CommandContext): void {
		if (!context || !this.player || this.originalLength === undefined) return;

		this.player.clipConfiguration.length = this.originalLength;

		// Restore original timing intent
		if (this.originalTimingIntent) {
			this.player.setTimingIntent(this.originalTimingIntent);
			// Update resolved timing to match
			this.player.setResolvedTiming({
				start: this.player.getStart(),
				length: typeof this.originalTimingIntent.length === "number" ? this.originalTimingIntent.length * 1000 : this.player.getLength()
			});
		}

		this.player.reconfigureAfterRestore();
		this.player.draw();

		context.updateDuration();
		context.emitEvent("clip:updated", {
			previous: { clip: { ...this.player.clipConfiguration, length: this.newLength }, trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: this.player.clipConfiguration, trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});

		// Propagate timing changes
		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}
}
