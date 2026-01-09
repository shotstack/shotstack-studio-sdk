import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import { type Seconds, type TimingIntent, sec } from "@core/timing/types";

import { commitTimingChange } from "./helpers/commit-timing-change";
import type { EditCommand, CommandContext } from "./types";

export class ResizeClipCommand implements EditCommand {
	name = "resizeClip";
	private originalLength?: Seconds;
	private originalTimingIntent?: TimingIntent;
	private player?: Player;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private newLength: Seconds
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
		this.originalLength = sec(this.player.clipConfiguration.length);

		// Store original timing intent for undo
		this.originalTimingIntent = this.player.getTimingIntent();

		const currentStart = this.player.getStart();
		commitTimingChange(context, this.trackIndex, this.clipIndex, {
			start: currentStart,
			length: this.newLength
		});

		this.player.draw();

		context.updateDuration();
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: { ...this.player.clipConfiguration, length: this.originalLength }, trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: this.player.clipConfiguration, trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});

		// Propagate timing changes to dependent clips
		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}

	undo(context?: CommandContext): void {
		if (!context) {
			throw new Error("ResizeClipCommand.undo: No context provided");
		}
		if (!this.player) {
			throw new Error("ResizeClipCommand.undo: No player - was execute() called?");
		}
		if (this.originalLength === undefined) {
			throw new Error("ResizeClipCommand.undo: No original length - was execute() called?");
		}

		// Single mutation path: restore original timing intent
		if (this.originalTimingIntent) {
			commitTimingChange(context, this.trackIndex, this.clipIndex, {
				start: this.originalTimingIntent.start,
				length: this.originalTimingIntent.length
			});
		}

		this.player.draw();

		context.updateDuration();
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: { ...this.player.clipConfiguration, length: this.newLength }, trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: this.player.clipConfiguration, trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});

		// Propagate timing changes
		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}
}
