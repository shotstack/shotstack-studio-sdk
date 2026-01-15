import { EditEvent } from "@core/events/edit-events";
import type { Seconds, TimingIntent } from "@core/timing/types";
import type { ResolvedClip } from "@schemas";

import { DeleteTrackCommand } from "./delete-track-command";
import type { EditCommand, CommandContext } from "./types";

/**
 * Document-only command that moves a clip to a different track and/or position.
 *
 * Flow: Document mutation → resolve() → Reconciler updates Player layer and position
 */
export class MoveClipCommand implements EditCommand {
	name = "moveClip";

	private clipId: string | null = null;
	private originalStart?: Seconds;
	private originalTimingIntent?: TimingIntent;
	private previousClipConfig?: ResolvedClip;
	private deleteTrackCommand?: DeleteTrackCommand;
	private sourceTrackWasDeleted = false;
	/** Effective destination track index, adjusted if source track was deleted */
	private effectiveToTrackIndex: number;
	/** The final clip index after moving (for events and undo) */
	private newClipIndex = 0;

	constructor(
		private readonly fromTrackIndex: number,
		private readonly fromClipIndex: number,
		private readonly toTrackIndex: number,
		private readonly newStart: Seconds
	) {
		this.effectiveToTrackIndex = toTrackIndex;
	}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("MoveClipCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("MoveClipCommand.execute: document is required");

		// Get the player to store state for undo and events
		const player = context.getClipAt(this.fromTrackIndex, this.fromClipIndex);
		if (!player) {
			throw new Error(`MoveClipCommand.execute: invalid clip at ${this.fromTrackIndex}/${this.fromClipIndex}`);
		}

		// Store for undo
		this.clipId = player.clipId;
		this.previousClipConfig = structuredClone(player.clipConfiguration);
		this.originalStart = player.clipConfiguration.start as Seconds;
		this.originalTimingIntent = player.getTimingIntent();

		// Determine effective destination track index
		this.effectiveToTrackIndex = this.toTrackIndex;

		// Document-only mutations - always use moveClip since it handles reordering by start time
		doc.moveClip(this.fromTrackIndex, this.fromClipIndex, this.toTrackIndex, { start: this.newStart });

		if (this.fromTrackIndex !== this.toTrackIndex) {
			// Cross-track move: check if source track is now empty and should be deleted
			const sourceTrackClips = doc.getClipsInTrack(this.fromTrackIndex);
			if (sourceTrackClips.length === 0) {
				// Source track is empty - delete it
				// Note: DeleteTrackCommand is already document-only
				this.deleteTrackCommand = new DeleteTrackCommand(this.fromTrackIndex);
				this.deleteTrackCommand.execute(context);
				this.sourceTrackWasDeleted = true;

				// Adjust effective destination track index if it was after the deleted track
				if (this.toTrackIndex > this.fromTrackIndex) {
					this.effectiveToTrackIndex = this.toTrackIndex - 1;
				}
			}
		}

		// Handle timing intent changes
		if (this.originalTimingIntent?.length === "end") {
			// When moving a clip, it loses the "end" intent and gets a fixed start
			context.untrackEndLengthClip(player);
		}

		// Reconciler handles player layer update, container move, timing update
		context.resolve();

		// Find the new clip index after move (for events)
		const clipInfo = this.clipId ? doc.getClipById(this.clipId) : null;
		this.newClipIndex = clipInfo?.clipIndex ?? 0;

		context.updateDuration();

		// Propagate timing changes to dependent clips
		if (this.fromTrackIndex !== this.toTrackIndex && !this.sourceTrackWasDeleted) {
			context.propagateTimingChanges(this.fromTrackIndex, this.fromClipIndex - 1);
		}
		context.propagateTimingChanges(this.effectiveToTrackIndex, this.newClipIndex);

		// Get updated player for events (may have different reference after reconciliation)
		const updatedPlayer = this.clipId ? context.getPlayerByClipId(this.clipId) : player;
		const currentConfig = updatedPlayer?.clipConfiguration ?? player.clipConfiguration;

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: {
				clip: this.previousClipConfig,
				trackIndex: this.fromTrackIndex,
				clipIndex: this.fromClipIndex
			},
			current: {
				clip: currentConfig,
				trackIndex: this.effectiveToTrackIndex,
				clipIndex: this.newClipIndex
			}
		});

		// Re-select the moved clip at its new position
		if (updatedPlayer) {
			context.setSelectedClip(updatedPlayer);
			context.emitEvent(EditEvent.ClipSelected, {
				clip: currentConfig,
				trackIndex: this.effectiveToTrackIndex,
				clipIndex: this.newClipIndex
			});
		}
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("MoveClipCommand.undo: context is required");
		if (!this.clipId || this.originalStart === undefined) return;

		const doc = context.getDocument();
		if (!doc) throw new Error("MoveClipCommand.undo: document is required");

		// If source track was deleted, recreate it first
		if (this.sourceTrackWasDeleted && this.deleteTrackCommand) {
			await this.deleteTrackCommand.undo(context);
			this.sourceTrackWasDeleted = false;

			// Restore effective track index now that the deleted track is back
			if (this.toTrackIndex > this.fromTrackIndex) {
				this.effectiveToTrackIndex = this.toTrackIndex;
			}
		}

		// Get player before document changes for events
		const player = context.getPlayerByClipId(this.clipId);
		const currentConfig = player ? structuredClone(player.clipConfiguration) : undefined;

		// Find current clip position in document
		const clipInfo = doc.getClipById(this.clipId);
		if (!clipInfo) {
			throw new Error(`MoveClipCommand.undo: clip ${this.clipId} not found in document`);
		}

		// Document-only mutations: move back to original position (always use moveClip for reordering)
		doc.moveClip(clipInfo.trackIndex, clipInfo.clipIndex, this.fromTrackIndex, {
			start: this.originalTimingIntent?.start ?? this.originalStart
		});

		// Restore "end" tracking if original intent had it
		if (player && this.originalTimingIntent?.length === "end") {
			context.trackEndLengthClip(player);
		}

		// Reconciler handles player layer update, container move, timing update
		context.resolve();

		context.updateDuration();

		// Propagate timing changes on both tracks
		if (this.fromTrackIndex !== this.effectiveToTrackIndex) {
			context.propagateTimingChanges(this.effectiveToTrackIndex, this.newClipIndex - 1);
		}
		context.propagateTimingChanges(this.fromTrackIndex, this.fromClipIndex);

		// Get updated player for events
		const updatedPlayer = context.getPlayerByClipId(this.clipId);
		const restoredConfig = updatedPlayer?.clipConfiguration ?? this.previousClipConfig;

		if (this.previousClipConfig) {
			context.emitEvent(EditEvent.ClipUpdated, {
				previous: {
					clip: currentConfig ?? this.previousClipConfig,
					trackIndex: this.effectiveToTrackIndex,
					clipIndex: this.newClipIndex
				},
				current: {
					clip: restoredConfig ?? this.previousClipConfig,
					trackIndex: this.fromTrackIndex,
					clipIndex: this.fromClipIndex
				}
			});
		}

		// Re-select the clip at its restored position
		if (updatedPlayer && restoredConfig) {
			context.setSelectedClip(updatedPlayer);
			context.emitEvent(EditEvent.ClipSelected, {
				clip: restoredConfig,
				trackIndex: this.fromTrackIndex,
				clipIndex: this.fromClipIndex
			});
		}

		// Reset effective track index for potential re-execute
		this.effectiveToTrackIndex = this.toTrackIndex;
	}

	dispose(): void {
		this.clipId = null;
		this.deleteTrackCommand = undefined;
	}
}
