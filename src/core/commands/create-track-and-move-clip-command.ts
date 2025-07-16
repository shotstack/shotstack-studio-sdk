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
		
		// Move the clip to the newly created track
		// Note: After adding a track at insertionIndex, all tracks at insertionIndex and above shift down
		// So the new track will be at insertionIndex, and we want to move the clip there
		this.moveClipCommand = new MoveClipCommand(
			fromTrackIndex >= insertionIndex ? fromTrackIndex + 1 : fromTrackIndex, // Adjust source if affected by track insertion
			fromClipIndex,
			insertionIndex, // Target is the newly created track
			newStart
		);
	}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) return;

		try {
			console.log('CreateTrackAndMoveClipCommand: Starting execution', {
				insertionIndex: this.insertionIndex,
				fromTrackIndex: this.fromTrackIndex,
				fromClipIndex: this.fromClipIndex
			});

			// First, create the new track
			console.log('CreateTrackAndMoveClipCommand: Creating track at index', this.insertionIndex);
			this.addTrackCommand.execute(context);

			// Then move the clip to the new track
			// We need to adjust the source track index if it was affected by the track insertion
			const adjustedFromTrackIndex = this.fromTrackIndex >= this.insertionIndex 
				? this.fromTrackIndex + 1 
				: this.fromTrackIndex;

			console.log('CreateTrackAndMoveClipCommand: Moving clip', {
				from: { trackIndex: adjustedFromTrackIndex, clipIndex: this.fromClipIndex },
				to: { trackIndex: this.insertionIndex, start: this.newStart },
				originalFromTrack: this.fromTrackIndex,
				adjustedFromTrack: adjustedFromTrackIndex
			});

			// Update the move command with the adjusted source track index
			this.moveClipCommand = new MoveClipCommand(
				adjustedFromTrackIndex,
				this.fromClipIndex,
				this.insertionIndex,
				this.newStart
			);

			this.moveClipCommand.execute(context);
			this.wasExecuted = true;

			// Emit a compound event for both operations
			context.emitEvent("track:created-and-clip:moved", {
				trackInsertionIndex: this.insertionIndex,
				clipMove: {
					from: { trackIndex: this.fromTrackIndex, clipIndex: this.fromClipIndex },
					to: { trackIndex: this.insertionIndex, start: this.newStart }
				}
			});
		} catch (error) {
			// If anything goes wrong, try to clean up
			console.error("Failed to execute CreateTrackAndMoveClipCommand:", error);
			
			// Try to undo what we've done so far
			if (this.wasExecuted) {
				try {
					this.undo(context);
				} catch (undoError) {
					console.error("Failed to undo after CreateTrackAndMoveClipCommand error:", undoError);
				}
			}
			
			throw error; // Re-throw the original error
		}
	}

	undo(context?: CommandContext): void {
		if (!context || !this.wasExecuted) return;

		try {
			// Undo in reverse order: first undo the clip move, then remove the track
			this.moveClipCommand.undo(context);
			this.addTrackCommand.undo(context);

			this.wasExecuted = false;

			// Emit undo event
			context.emitEvent("track:created-and-clip:moved:undone", {
				trackInsertionIndex: this.insertionIndex,
				clipMove: {
					from: { trackIndex: this.fromTrackIndex, clipIndex: this.fromClipIndex },
					to: { trackIndex: this.insertionIndex, start: this.newStart }
				}
			});
		} catch (error) {
			console.error("Failed to undo CreateTrackAndMoveClipCommand:", error);
			throw error;
		}
	}
}