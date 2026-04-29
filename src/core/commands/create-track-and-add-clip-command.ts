import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@schemas";

import { AddClipCommand } from "./add-clip-command";
import { AddTrackCommand } from "./add-track-command";
import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Compound command that creates a new track and adds a clip to it atomically.
 */
export class CreateTrackAndAddClipCommand implements EditCommand {
	readonly name = "createTrackAndAddClip";

	private addTrackCommand: AddTrackCommand;
	private addClipCommand: AddClipCommand;
	private wasExecuted = false;

	constructor(
		private readonly insertionIndex: number,
		clip: ResolvedClip
	) {
		this.addTrackCommand = new AddTrackCommand(insertionIndex);
		this.addClipCommand = new AddClipCommand(insertionIndex, clip);
	}

	async execute(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("CreateTrackAndAddClipCommand.execute: context is required");

		let addTrackExecuted = false;

		try {
			this.addTrackCommand.execute(context);
			addTrackExecuted = true;

			this.addClipCommand.execute(context);
			this.wasExecuted = true;
		} catch (executeError) {
			// Partial rollback if the track was created but the clip failed to add.
			if (addTrackExecuted && !this.wasExecuted) {
				try {
					this.addTrackCommand.undo(context);
				} catch (undoError) {
					throw new Error(
						`CreateTrackAndAddClipCommand: execute failed (${executeError instanceof Error ? executeError.message : String(executeError)}) ` +
							`and rollback also failed (${undoError instanceof Error ? undoError.message : String(undoError)}). State may be corrupted.`
					);
				}
			}
			throw executeError;
		}

		return CommandSuccess();
	}

	async undo(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("CreateTrackAndAddClipCommand.undo: context is required");
		if (!this.wasExecuted) return CommandNoop("Command was not executed");

		// Reverse order: remove the clip first, then the now-empty track.
		this.addClipCommand.undo(context);
		this.addTrackCommand.undo(context);
		this.wasExecuted = false;

		context.emitEvent(EditEvent.TrackRemoved, {
			trackIndex: this.insertionIndex
		});

		return CommandSuccess();
	}

	dispose(): void {
		this.addTrackCommand.dispose?.();
		this.addClipCommand.dispose?.();
	}
}
