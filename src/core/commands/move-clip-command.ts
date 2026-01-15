import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import { type Seconds, type TimingIntent, sec } from "@core/timing/types";

import { DeleteTrackCommand } from "./delete-track-command";
import type { EditCommand, CommandContext } from "./types";

export class MoveClipCommand implements EditCommand {
	name = "moveClip";
	private player?: Player;
	private originalTrackIndex: number;
	private originalToTrackIndex: number;
	private originalClipIndex: number;
	private originalStart?: Seconds;
	private originalTimingIntent?: TimingIntent;
	private deleteTrackCommand?: DeleteTrackCommand;
	private sourceTrackWasDeleted = false;
	/** Effective destination track index, adjusted if source track was deleted */
	private effectiveToTrackIndex: number;

	constructor(
		private readonly fromTrackIndex: number,
		private readonly fromClipIndex: number,
		private readonly toTrackIndex: number,
		private readonly newStart: Seconds
	) {
		this.originalTrackIndex = fromTrackIndex;
		this.originalToTrackIndex = toTrackIndex;
		this.originalClipIndex = fromClipIndex;
		this.effectiveToTrackIndex = toTrackIndex;
	}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("MoveClipCommand.execute: context is required");

		// Get the player by indices
		const tracks = context.getTracks();
		const document = context.getDocument();

		if (this.fromTrackIndex < 0 || this.fromTrackIndex >= tracks.length) {
			throw new Error(`MoveClipCommand.execute: invalid source track index ${this.fromTrackIndex}`);
		}

		const fromTrack = tracks[this.fromTrackIndex];
		if (this.fromClipIndex < 0 || this.fromClipIndex >= fromTrack.length) {
			throw new Error(`MoveClipCommand.execute: invalid clip index ${this.fromClipIndex}`);
		}

		// Get the clip to move
		this.player = fromTrack[this.fromClipIndex];
		this.originalStart = sec(this.player.clipConfiguration.start);

		// Store original timing intent for undo
		this.originalTimingIntent = this.player.getTimingIntent();

		// If moving to a different track
		if (this.fromTrackIndex !== this.toTrackIndex) {
			// Validate destination track
			if (this.toTrackIndex < 0 || this.toTrackIndex >= tracks.length) {
				throw new Error(`MoveClipCommand.execute: invalid destination track index ${this.toTrackIndex}`);
			}

			// Remove from current track
			fromTrack.splice(this.fromClipIndex, 1);

			// Update the player's layer
			this.player.layer = this.effectiveToTrackIndex + 1;

			// Add to new track at the correct position (sorted by start time)
			const toTrack = tracks[this.effectiveToTrackIndex];

			// Find the correct insertion point based on start time
			let insertIndex = 0;
			for (let i = 0; i < toTrack.length; i += 1) {
				const clip = toTrack[i];
				const clipStart = clip.getStart(); // getStart() now returns Seconds
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

				// Adjust effective destination track index if it was after the deleted track
				if (this.toTrackIndex > this.fromTrackIndex) {
					this.effectiveToTrackIndex = this.toTrackIndex - 1;
					this.player.layer = this.effectiveToTrackIndex + 1;
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
				const clipStart = clip.getStart();
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

		this.player.setResolvedTiming({
			start: this.newStart,
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

		if (document) {
			if (this.originalTrackIndex !== this.originalToTrackIndex) {
				const sourceDocTrackIdx = this.sourceTrackWasDeleted ? -1 : this.fromTrackIndex;
				if (sourceDocTrackIdx >= 0) {
					document.removeClip(sourceDocTrackIdx, this.fromClipIndex);
				}
				const exportableClip = this.player.getExportableClip();
				document.addClip(this.effectiveToTrackIndex, exportableClip, this.originalClipIndex);
			} else {
				// Same-track move: update at original position, then reorder to match player array
				context.documentUpdateClip(this.effectiveToTrackIndex, this.fromClipIndex, {
					start: this.newStart
				});
				// Reorder document clip to match player array ordering
				if (this.fromClipIndex !== this.originalClipIndex) {
					const clip = document.removeClip(this.effectiveToTrackIndex, this.fromClipIndex);
					if (clip) {
						document.addClip(this.effectiveToTrackIndex, clip, this.originalClipIndex);
					}
				}
			}
		}

		// Move the player container to the new track container
		context.movePlayerToTrackContainer(this.player, this.fromTrackIndex, this.effectiveToTrackIndex);

		// Reconfigure and redraw the player
		this.player.reconfigureAfterRestore();
		this.player.draw();

		// Update total duration and emit event
		context.updateDuration();

		// If we moved tracks, we need to update all clips in both tracks
		if (this.fromTrackIndex !== this.toTrackIndex && !this.sourceTrackWasDeleted) {
			// Force all clips in the affected tracks to redraw (skip if source was deleted)
			const sourceTrack = tracks[this.fromTrackIndex];
			const destTrack = tracks[this.effectiveToTrackIndex];

			[...sourceTrack, ...destTrack].forEach(clip => {
				if (clip && clip !== this.player) {
					clip.draw();
				}
			});
		} else if (this.sourceTrackWasDeleted) {
			// Only redraw destination track clips
			const destTrack = tracks[this.effectiveToTrackIndex];
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
		context.propagateTimingChanges(this.effectiveToTrackIndex, this.originalClipIndex);

		// Emit events AFTER all changes complete to avoid partial rebuilds
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: {
				clip: { ...this.player.clipConfiguration, start: this.originalStart },
				trackIndex: this.fromTrackIndex,
				clipIndex: this.fromClipIndex
			},
			current: {
				clip: this.player.clipConfiguration,
				trackIndex: this.effectiveToTrackIndex,
				clipIndex: this.originalClipIndex
			}
		});

		// Re-select the moved clip at its new position
		context.setSelectedClip(this.player);
		context.emitEvent(EditEvent.ClipSelected, {
			clip: this.player.clipConfiguration,
			trackIndex: this.effectiveToTrackIndex,
			clipIndex: this.originalClipIndex
		});
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("MoveClipCommand.undo: context is required");
		if (!this.player || this.originalStart === undefined) return;

		// If source track was deleted, recreate it first
		if (this.sourceTrackWasDeleted && this.deleteTrackCommand) {
			await this.deleteTrackCommand.undo(context);
			this.sourceTrackWasDeleted = false;

			// Restore effective track index now that the deleted track is back
			// The effectiveToTrackIndex needs to shift back up if it was adjusted
			if (this.toTrackIndex > this.fromTrackIndex) {
				this.effectiveToTrackIndex = this.toTrackIndex;
				this.player.layer = this.effectiveToTrackIndex + 1;
			}
		}

		const tracks = context.getTracks();

		// If we moved tracks, move it back
		if (this.fromTrackIndex !== this.toTrackIndex) {
			// Remove from current track
			const currentTrack = tracks[this.effectiveToTrackIndex];
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

		if (this.originalTimingIntent) {
			this.player.setTimingIntent(this.originalTimingIntent);
			// Update resolved timing to match (now in Seconds)
			this.player.setResolvedTiming({
				start: typeof this.originalTimingIntent.start === "number" ? this.originalTimingIntent.start : this.player.getStart(),
				length: typeof this.originalTimingIntent.length === "number" ? this.originalTimingIntent.length : this.player.getLength()
			});

			// If restoring "end" length, re-track in endLengthClips Set
			if (this.originalTimingIntent.length === "end") {
				context.trackEndLengthClip(this.player);
			}
		}

		const document = context.getDocument();
		if (document) {
			if (this.fromTrackIndex !== this.toTrackIndex) {
				const destTrack = tracks[this.effectiveToTrackIndex];
				const currentDocIdx = destTrack ? this.originalClipIndex : -1;
				if (currentDocIdx >= 0) {
					document.removeClip(this.effectiveToTrackIndex, currentDocIdx);
				}
				const exportableClip = this.player.getExportableClip();
				document.addClip(this.fromTrackIndex, exportableClip, this.fromClipIndex);
			} else {
				context.documentUpdateClip(this.fromTrackIndex, this.fromClipIndex, {
					start: this.originalTimingIntent?.start ?? this.originalStart
				});
			}
		}

		// Move the player container back to the original track container if needed
		context.movePlayerToTrackContainer(this.player, this.effectiveToTrackIndex, this.fromTrackIndex);

		// Reconfigure and redraw the player
		this.player.reconfigureAfterRestore();
		this.player.draw();

		context.updateDuration();

		// Propagate timing changes on both tracks
		if (this.fromTrackIndex !== this.toTrackIndex) {
			context.propagateTimingChanges(this.effectiveToTrackIndex, this.originalClipIndex - 1);
		}
		context.propagateTimingChanges(this.fromTrackIndex, this.fromClipIndex);

		// Emit events AFTER all changes complete to avoid partial rebuilds
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: {
				clip: { ...this.player.clipConfiguration, start: this.newStart },
				trackIndex: this.effectiveToTrackIndex,
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

		// Reset effective track index for potential re-execute
		this.effectiveToTrackIndex = this.toTrackIndex;
	}

	dispose(): void {
		this.player = undefined;
		this.deleteTrackCommand = undefined;
	}
}
