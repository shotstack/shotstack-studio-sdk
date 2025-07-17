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
		private insertionIndex: number,
		private fromTrackIndex: number,
		private fromClipIndex: number,
		private newStart: number
	) {
		// Create the track at the insertion index
		this.addTrackCommand = new AddTrackCommand(insertionIndex);

		// Pre-calculate adjusted source track index
		// After adding a track at insertionIndex, all tracks at or above that index shift down
		const adjustedFromTrackIndex = fromTrackIndex >= insertionIndex ? fromTrackIndex + 1 : fromTrackIndex;

		// Move the clip to the newly created track
		this.moveClipCommand = new MoveClipCommand(adjustedFromTrackIndex, fromClipIndex, insertionIndex, newStart);
	}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) return;

		try {
			// Execute both commands in sequence
			this.addTrackCommand.execute(context);
			this.moveClipCommand.execute(context);
			this.wasExecuted = true;

			// Emit compound event
			context.emitEvent("track:created-and-clip:moved", {
				trackInsertionIndex: this.insertionIndex,
				clipMove: {
					from: { trackIndex: this.fromTrackIndex, clipIndex: this.fromClipIndex },
					to: { trackIndex: this.insertionIndex, start: this.newStart }
				}
			});
		} catch (error) {
			// Clean up on error
			if (this.wasExecuted) {
				try {
					this.undo(context);
				} catch {
					// Ignore undo errors
				}
			}
			throw error;
		}
	}

	undo(context?: CommandContext): void {
		if (!context || !this.wasExecuted) return;

		// Undo in reverse order
		this.moveClipCommand.undo(context);
		this.addTrackCommand.undo(context);
		this.wasExecuted = false;

		context.emitEvent("track:created-and-clip:moved:undone", {
			trackInsertionIndex: this.insertionIndex
		});
	}
}
