import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import type { TimingIntent } from "@core/timing/types";

import { DeleteTrackCommand } from "./delete-track-command";
import type { EditCommand, CommandContext } from "./types";

export class MoveClipCommand implements EditCommand {
	name = "moveClip";
	private player?: Player;
	private originalTrackIndex: number;
	private originalClipIndex: number;
	private originalStart?: number;
	private originalTimingIntent?: TimingIntent;
	private deleteTrackCommand?: DeleteTrackCommand;
	private sourceTrackWasDeleted = false;

	constructor(
		private fromTrackIndex: number,
		private fromClipIndex: number,
		private toTrackIndex: number,
		private newStart: number
	) {
		this.originalTrackIndex = fromTrackIndex;
		this.originalClipIndex = fromClipIndex;
	}

	execute(context?: CommandContext): void {
		if (!context) return;

		// Get the player by indices
		const tracks = context.getTracks();

		if (this.fromTrackIndex < 0 || this.fromTrackIndex >= tracks.length) {
			console.warn(`Invalid source track index: ${this.fromTrackIndex}`);
			return;
		}

		const fromTrack = tracks[this.fromTrackIndex];
		if (this.fromClipIndex < 0 || this.fromClipIndex >= fromTrack.length) {
			console.warn(`Invalid clip index: ${this.fromClipIndex}`);
			return;
		}

		// Get the clip to move
		this.player = fromTrack[this.fromClipIndex];
		this.originalStart = this.player.clipConfiguration.start;

		// Store original timing intent for undo
		this.originalTimingIntent = this.player.getTimingIntent();

		// If moving to a different track
		if (this.fromTrackIndex !== this.toTrackIndex) {
			// Validate destination track
			if (this.toTrackIndex < 0 || this.toTrackIndex >= tracks.length) {
				console.warn(`Invalid destination track index: ${this.toTrackIndex}`);
				return;
			}

			// Remove from current track
			fromTrack.splice(this.fromClipIndex, 1);

			// Update the player's layer
			this.player.layer = this.toTrackIndex + 1;

			// Add to new track at the correct position (sorted by start time)
			const toTrack = tracks[this.toTrackIndex];

			// Find the correct insertion point based on start time
			let insertIndex = 0;
			for (let i = 0; i < toTrack.length; i += 1) {
				const clip = toTrack[i];
				const clipStart = clip.getStart() / 1000; // Use resolved start time in seconds
				if (this.newStart < clipStart) {
					break;
				}
				insertIndex += 1;
			}

			// Insert at the correct position
			toTrack.splice(insertIndex, 0, this.player);

			// Store the new clip index for undo
			this.originalClipIndex = insertIndex;

			// Check if source track is now empty and delete it
			if (fromTrack.length === 0) {
				this.deleteTrackCommand = new DeleteTrackCommand(this.fromTrackIndex);
				this.deleteTrackCommand.execute(context);
				this.sourceTrackWasDeleted = true;

				// Adjust destination track index if it was after the deleted track
				if (this.toTrackIndex > this.fromTrackIndex) {
					this.toTrackIndex -= 1;
					this.player.layer = this.toTrackIndex + 1;
				}
			}
		} else {
			// Same track - need to reorder if position changed
			const track = fromTrack;

			// Remove from current position
			track.splice(this.fromClipIndex, 1);

			// Find new insertion point based on start time
			let insertIndex = 0;
			for (let i = 0; i < track.length; i += 1) {
				const clip = track[i];
				const clipStart = clip.getStart() / 1000;
				if (this.newStart < clipStart) {
					break;
				}
				insertIndex += 1;
			}

			// Insert at correct position
			track.splice(insertIndex, 0, this.player);

			// Store new index
			this.originalClipIndex = insertIndex;
		}

		// Update the clip position
		this.player.clipConfiguration.start = this.newStart;

		// Update resolved timing to match the new position
		this.player.setResolvedTiming({
			start: this.newStart * 1000,
			length: this.player.getLength()
		});

		// Update timing intent to match new position
		this.player.setTimingIntent({
			start: this.newStart,
			length: this.player.getTimingIntent().length
		});

		// If timing intent changed from "end" to fixed, untrack from endLengthClips Set
		if (this.originalTimingIntent?.length === "end" && this.player.getTimingIntent().length !== "end") {
			context.untrackEndLengthClip(this.player);
		}

		// Move the player container to the new track container
		context.movePlayerToTrackContainer(this.player, this.fromTrackIndex, this.toTrackIndex);

		// Reconfigure and redraw the player
		this.player.reconfigureAfterRestore();
		this.player.draw();

		// Update total duration and emit event
		context.updateDuration();

		// If we moved tracks, we need to update all clips in both tracks
		if (this.fromTrackIndex !== this.toTrackIndex && !this.sourceTrackWasDeleted) {
			// Force all clips in the affected tracks to redraw (skip if source was deleted)
			const sourceTrack = tracks[this.fromTrackIndex];
			const destTrack = tracks[this.toTrackIndex];

			[...sourceTrack, ...destTrack].forEach(clip => {
				if (clip && clip !== this.player) {
					clip.draw();
				}
			});
		} else if (this.sourceTrackWasDeleted) {
			// Only redraw destination track clips
			const destTrack = tracks[this.toTrackIndex];
			destTrack?.forEach(clip => {
				if (clip && clip !== this.player) {
					clip.draw();
				}
			});
		}

		// Propagate timing changes to dependent clips
		// Need to propagate on both source and destination tracks if they differ
		if (this.fromTrackIndex !== this.toTrackIndex && !this.sourceTrackWasDeleted) {
			context.propagateTimingChanges(this.fromTrackIndex, this.fromClipIndex - 1);
		}
		context.propagateTimingChanges(this.toTrackIndex, this.originalClipIndex);

		// Emit events AFTER all changes complete to avoid partial rebuilds
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: {
				clip: { ...this.player.clipConfiguration, start: this.originalStart },
				trackIndex: this.fromTrackIndex,
				clipIndex: this.fromClipIndex
			},
			current: {
				clip: this.player.clipConfiguration,
				trackIndex: this.toTrackIndex,
				clipIndex: this.originalClipIndex
			}
		});

		// Re-select the moved clip at its new position
		context.setSelectedClip(this.player);
		context.emitEvent(EditEvent.ClipSelected, {
			clip: this.player.clipConfiguration,
			trackIndex: this.toTrackIndex,
			clipIndex: this.originalClipIndex
		});
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context || !this.player || this.originalStart === undefined) return;

		// If source track was deleted, recreate it first
		if (this.sourceTrackWasDeleted && this.deleteTrackCommand) {
			await this.deleteTrackCommand.undo(context);
			this.sourceTrackWasDeleted = false;

			// Re-adjust track indices that were modified during execute
			if (this.toTrackIndex >= this.fromTrackIndex) {
				this.toTrackIndex += 1;
				this.player.layer = this.toTrackIndex + 1;
			}
		}

		const tracks = context.getTracks();

		// If we moved tracks, move it back
		if (this.fromTrackIndex !== this.toTrackIndex) {
			// Remove from current track
			const currentTrack = tracks[this.toTrackIndex];
			const clipIndex = currentTrack.indexOf(this.player);
			if (clipIndex !== -1) {
				currentTrack.splice(clipIndex, 1);
			}

			// Restore original layer
			this.player.layer = this.fromTrackIndex + 1;

			// Add back to original track at original position
			const originalTrack = tracks[this.fromTrackIndex];
			originalTrack.splice(this.fromClipIndex, 0, this.player);
		} else {
			// Same track - need to reorder back to original position
			const track = tracks[this.fromTrackIndex];
			const currentIndex = track.indexOf(this.player);
			if (currentIndex !== -1) {
				track.splice(currentIndex, 1);
			}

			// Insert at original position
			track.splice(this.fromClipIndex, 0, this.player);
		}

		// Restore original position
		this.player.clipConfiguration.start = this.originalStart;

		// Restore original timing intent
		if (this.originalTimingIntent) {
			this.player.setTimingIntent(this.originalTimingIntent);
			// Update resolved timing to match
			this.player.setResolvedTiming({
				start: typeof this.originalTimingIntent.start === "number" ? this.originalTimingIntent.start * 1000 : this.player.getStart(),
				length: typeof this.originalTimingIntent.length === "number" ? this.originalTimingIntent.length * 1000 : this.player.getLength()
			});

			// If restoring "end" length, re-track in endLengthClips Set
			if (this.originalTimingIntent.length === "end") {
				context.trackEndLengthClip(this.player);
			}
		}

		// Move the player container back to the original track container if needed
		context.movePlayerToTrackContainer(this.player, this.toTrackIndex, this.fromTrackIndex);

		// Reconfigure and redraw the player
		this.player.reconfigureAfterRestore();
		this.player.draw();

		context.updateDuration();

		// Propagate timing changes on both tracks
		if (this.fromTrackIndex !== this.toTrackIndex) {
			context.propagateTimingChanges(this.toTrackIndex, this.originalClipIndex - 1);
		}
		context.propagateTimingChanges(this.fromTrackIndex, this.fromClipIndex);

		// Emit events AFTER all changes complete to avoid partial rebuilds
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: {
				clip: { ...this.player.clipConfiguration, start: this.newStart },
				trackIndex: this.toTrackIndex,
				clipIndex: this.originalClipIndex
			},
			current: {
				clip: this.player.clipConfiguration,
				trackIndex: this.fromTrackIndex,
				clipIndex: this.fromClipIndex
			}
		});

		// Re-select the clip at its restored position
		context.setSelectedClip(this.player);
		context.emitEvent(EditEvent.ClipSelected, {
			clip: this.player.clipConfiguration,
			trackIndex: this.fromTrackIndex,
			clipIndex: this.fromClipIndex
		});
	}
}
