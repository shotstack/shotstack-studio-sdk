import type { Player } from "@canvas/players/player";

import type { EditCommand, CommandContext } from "./types";

export class MoveClipCommand implements EditCommand {
	name = "moveClip";
	private player?: Player;
	private originalTrackIndex: number;
	private originalClipIndex: number;
	private originalStart?: number;

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
		console.log('MoveClipCommand: Starting execution', {
			fromTrackIndex: this.fromTrackIndex,
			fromClipIndex: this.fromClipIndex,
			toTrackIndex: this.toTrackIndex,
			newStart: this.newStart,
			totalTracks: tracks.length,
			tracks: tracks.map((track, i) => ({ index: i, clipCount: track.length }))
		});

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
		
		console.log('MoveClipCommand: Found clip to move', {
			currentStart: this.originalStart,
			currentLayer: this.player.layer
		});

		// If moving to a different track
		if (this.fromTrackIndex !== this.toTrackIndex) {
			// Validate destination track
			if (this.toTrackIndex < 0 || this.toTrackIndex >= tracks.length) {
				console.warn(`Invalid destination track index: ${this.toTrackIndex}`);
				return;
			}

			console.log('MoveClipCommand: Cross-track move detected', {
				fromTrack: this.fromTrackIndex,
				toTrack: this.toTrackIndex
			});

			// Remove from current track
			console.log('MoveClipCommand: Before removing from source track', {
				sourceTrackClipCount: fromTrack.length
			});
			fromTrack.splice(this.fromClipIndex, 1);
			console.log('MoveClipCommand: After removing from source track', {
				sourceTrackClipCount: fromTrack.length
			});

			// Update the player's layer
			this.player.layer = this.toTrackIndex + 1;
			console.log('MoveClipCommand: Updated player layer to', this.player.layer);

			// Add to new track at the correct position (sorted by start time)
			const toTrack = tracks[this.toTrackIndex];
			console.log('MoveClipCommand: Target track info', {
				targetTrackIndex: this.toTrackIndex,
				targetTrackClipCount: toTrack.length,
				targetTrackClips: toTrack.map(clip => ({ start: clip.clipConfiguration?.start }))
			});

			// Find the correct insertion point based on start time
			let insertIndex = 0;
			for (let i = 0; i < toTrack.length; i += 1) {
				const clip = toTrack[i];
				if (clip.clipConfiguration && clip.clipConfiguration.start !== undefined) {
					if (this.newStart < clip.clipConfiguration.start) {
						break;
					}
				}
				insertIndex += 1;
			}

			// Insert at the correct position
			console.log('MoveClipCommand: Inserting clip at index', insertIndex);
			toTrack.splice(insertIndex, 0, this.player);
			console.log('MoveClipCommand: After insertion', {
				targetTrackClipCount: toTrack.length,
				insertedAtIndex: insertIndex
			});

			// Store the new clip index for undo
			this.originalClipIndex = insertIndex;
		}

		// Update the clip position
		this.player.clipConfiguration.start = this.newStart;

		// Move the player container to the new track container if needed
		context.movePlayerToTrackContainer(this.player, this.fromTrackIndex, this.toTrackIndex);

		// Reconfigure and redraw the player
		this.player.reconfigureAfterRestore();
		this.player.draw();

		// Update total duration and emit event
		context.updateDuration();

		// If we moved tracks, we need to update all clips in both tracks
		if (this.fromTrackIndex !== this.toTrackIndex) {
			// Force all clips in the affected tracks to redraw
			const sourceTrack = tracks[this.fromTrackIndex];
			const destTrack = tracks[this.toTrackIndex];

			[...sourceTrack, ...destTrack].forEach(clip => {
				if (clip && clip !== this.player) {
					clip.draw();
				}
			});
		}

		context.emitEvent("clip:updated", {
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
	}

	undo(context?: CommandContext): void {
		if (!context || !this.player || this.originalStart === undefined) return;

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
		}

		// Restore original position
		this.player.clipConfiguration.start = this.originalStart;

		// Move the player container back to the original track container if needed
		context.movePlayerToTrackContainer(this.player, this.toTrackIndex, this.fromTrackIndex);

		// Reconfigure and redraw the player
		this.player.reconfigureAfterRestore();
		this.player.draw();

		context.updateDuration();
		context.emitEvent("clip:updated", {
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
	}
}
