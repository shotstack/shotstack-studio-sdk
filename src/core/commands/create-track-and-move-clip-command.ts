import { EditEvent } from "@core/events/edit-events";
import { type Seconds } from "@core/timing/types";

import { AddTrackCommand } from "./add-track-command";
import { MoveClipCommand } from "./move-clip-command";
import type { EditCommand, CommandContext } from "./types";

/**
 * Compound command that creates a new track and moves a clip to it atomically.
 * This ensures that both operations are treated as a single undo/redo action.
 */
export class CreateTrackAndMoveClipCommand implements EditCommand {
	name = "createTrackAndMoveClip";

	private addTrackCommand: AddTrackCommand;
	private moveClipCommand: MoveClipCommand;
	private wasExecuted = false;

	constructor(
		private readonly insertionIndex: number,
		private readonly fromTrackIndex: number,
		private readonly fromClipIndex: number,
		private readonly newStart: Seconds
	) {
		// Create the track at the insertion index
		this.addTrackCommand = new AddTrackCommand(insertionIndex);

		// Pre-calculate adjusted source track index
		// After adding a track at insertionIndex, all tracks at or above that index shift down
		const adjustedFromTrackIndex = fromTrackIndex >= insertionIndex ? fromTrackIndex + 1 : fromTrackIndex;

		// Move the clip to the newly created track
		// The new track will be at insertionIndex after insertion
		this.moveClipCommand = new MoveClipCommand(adjustedFromTrackIndex, fromClipIndex, insertionIndex, newStart);
	}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("CreateTrackAndMoveClipCommand.execute: context is required");

		let addTrackExecuted = false;

		try {
			// Execute both commands in sequence
			this.addTrackCommand.execute(context);
			addTrackExecuted = true;

			this.moveClipCommand.execute(context);
			this.wasExecuted = true;
		} catch (executeError) {
			// Attempt partial rollback: only undo addTrack if it succeeded but moveClip failed
			if (addTrackExecuted && !this.wasExecuted) {
				try {
					this.addTrackCommand.undo(context);
				} catch (undoError) {
					// If rollback fails, throw a compound error with both failures
					throw new Error(
						`CreateTrackAndMoveClipCommand: execute failed (${executeError instanceof Error ? executeError.message : String(executeError)}) ` +
							`and rollback also failed (${undoError instanceof Error ? undoError.message : String(undoError)}). State may be corrupted.`
					);
				}
			}
			throw executeError;
		}
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("CreateTrackAndMoveClipCommand.undo: context is required");
		if (!this.wasExecuted) return;

		// Undo in reverse order
		await this.moveClipCommand.undo(context);
		this.addTrackCommand.undo(context);
		this.wasExecuted = false;

		context.emitEvent(EditEvent.TrackRemoved, {
			trackIndex: this.insertionIndex
		});
	}

	dispose(): void {
		this.addTrackCommand.dispose?.();
		this.moveClipCommand.dispose?.();
	}
}
