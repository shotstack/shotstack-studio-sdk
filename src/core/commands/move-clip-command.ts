import { EditEvent } from "@core/events/edit-events";
import { stripInternalProperties } from "@core/shared/clip-utils";
import type { Seconds, TimingIntent } from "@core/timing/types";
import type { Clip } from "@schemas";

import { DeleteTrackCommand } from "./delete-track-command";
import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Document-only command that moves a clip to a different track and/or position.
 */
export class MoveClipCommand implements EditCommand {
	readonly name = "moveClip";

	private clipId: string | null = null;
	private originalStart?: Seconds;
	private originalTimingIntent?: TimingIntent;
	private previousDocClip?: Clip;
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

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("MoveClipCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("MoveClipCommand.execute: document is required");

		// Get player for ID and timing intent
		const player = context.getClipAt(this.fromTrackIndex, this.fromClipIndex);
		if (!player) {
			return CommandNoop(`Invalid clip at ${this.fromTrackIndex}/${this.fromClipIndex}`);
		}

		// Get document clip
		const docClip = doc.getClip(this.fromTrackIndex, this.fromClipIndex);
		if (!docClip) return CommandNoop(`Document clip not found at ${this.fromTrackIndex}/${this.fromClipIndex}`);

		// Store for undo and events
		this.clipId = player.clipId;
		this.previousDocClip = structuredClone(docClip);
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
				this.deleteTrackCommand = new DeleteTrackCommand(this.fromTrackIndex);
				const result = this.deleteTrackCommand.execute(context);

				// Only set sourceTrackWasDeleted if the command succeeded (not noop)
				if (result.status === "success") {
					this.sourceTrackWasDeleted = true;

					// Adjust effective destination track index if it was after the deleted track
					if (this.toTrackIndex > this.fromTrackIndex) {
						this.effectiveToTrackIndex = this.toTrackIndex - 1;
					}
				}
			}
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

		// Get document clip AFTER mutation
		const currentDocClip = doc.getClip(this.effectiveToTrackIndex, this.newClipIndex);
		if (!this.previousDocClip || !currentDocClip)
			throw new Error(`MoveClipCommand: document clip not found after mutation at ${this.effectiveToTrackIndex}/${this.newClipIndex}`);

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: {
				clip: stripInternalProperties(this.previousDocClip),
				trackIndex: this.fromTrackIndex,
				clipIndex: this.fromClipIndex
			},
			current: {
				clip: stripInternalProperties(currentDocClip),
				trackIndex: this.effectiveToTrackIndex,
				clipIndex: this.newClipIndex
			}
		});

		// Re-select the moved clip at its new position
		const updatedPlayer = this.clipId ? context.getPlayerByClipId(this.clipId) : player;
		if (updatedPlayer) {
			context.setSelectedClip(updatedPlayer);
			context.emitEvent(EditEvent.ClipSelected, {
				clip: stripInternalProperties(currentDocClip),
				trackIndex: this.effectiveToTrackIndex,
				clipIndex: this.newClipIndex
			});
		}

		return CommandSuccess();
	}

	async undo(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("MoveClipCommand.undo: context is required");
		if (!this.clipId || this.originalStart === undefined) return CommandNoop("No clip state stored");

		const doc = context.getDocument();
		if (!doc) throw new Error("MoveClipCommand.undo: document is required");

		// If source track was deleted, recreate it first
		if (this.sourceTrackWasDeleted && this.deleteTrackCommand) {
			this.deleteTrackCommand.undo(context);
			this.sourceTrackWasDeleted = false;

			// Restore effective track index now that the deleted track is back
			if (this.toTrackIndex > this.fromTrackIndex) {
				this.effectiveToTrackIndex = this.toTrackIndex;
			}
		}

		// Find current clip position in document
		const clipInfo = doc.getClipById(this.clipId);
		if (!clipInfo) return CommandNoop(`Clip ${this.clipId} not found in document`);
		const currentDocClip = structuredClone(doc.getClip(clipInfo.trackIndex, clipInfo.clipIndex));

		// Document-only mutations: move back to original position (always use moveClip for reordering)
		doc.moveClip(clipInfo.trackIndex, clipInfo.clipIndex, this.fromTrackIndex, {
			start: this.originalTimingIntent?.start ?? this.originalStart
		});

		// Reconciler handles player layer update, container move, timing update
		context.resolve();

		context.updateDuration();

		// Propagate timing changes on both tracks
		if (this.fromTrackIndex !== this.effectiveToTrackIndex) {
			context.propagateTimingChanges(this.effectiveToTrackIndex, this.newClipIndex - 1);
		}
		context.propagateTimingChanges(this.fromTrackIndex, this.fromClipIndex);

		// Get document clip AFTER undo mutation (restored state)
		const restoredDocClip = doc.getClip(this.fromTrackIndex, this.fromClipIndex);

		if (this.previousDocClip) {
			context.emitEvent(EditEvent.ClipUpdated, {
				previous: {
					clip: stripInternalProperties(currentDocClip ?? this.previousDocClip),
					trackIndex: this.effectiveToTrackIndex,
					clipIndex: this.newClipIndex
				},
				current: {
					clip: stripInternalProperties(restoredDocClip ?? this.previousDocClip),
					trackIndex: this.fromTrackIndex,
					clipIndex: this.fromClipIndex
				}
			});
		}

		// Re-select the clip at its restored position
		const updatedPlayer = context.getPlayerByClipId(this.clipId);
		if (updatedPlayer && restoredDocClip) {
			context.setSelectedClip(updatedPlayer);
			context.emitEvent(EditEvent.ClipSelected, {
				clip: stripInternalProperties(restoredDocClip),
				trackIndex: this.fromTrackIndex,
				clipIndex: this.fromClipIndex
			});
		}

		// Reset effective track index for potential re-execute
		this.effectiveToTrackIndex = this.toTrackIndex;

		return CommandSuccess();
	}

	dispose(): void {
		this.clipId = null;
		this.deleteTrackCommand = undefined;
	}
}
