import type { Track } from "@schemas";

import { AddTrackCommand } from "./add-track-command";
import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Atomic compound command that adds multiple tracks to the document.
 */
export class AddTracksCommand implements EditCommand {
	readonly name = "addTracks";

	private readonly subCommands: AddTrackCommand[];
	private executedCount = 0;

	constructor(insertionIndex: number, tracks: Track[]) {
		// Reverse iteration so first source track ends up at insertionIndex.
		this.subCommands = [];
		for (let i = tracks.length - 1; i >= 0; i -= 1) {
			this.subCommands.push(new AddTrackCommand(insertionIndex, tracks[i]));
		}
	}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("AddTracksCommand.execute: context is required");

		try {
			for (const cmd of this.subCommands) {
				cmd.execute(context);
				this.executedCount += 1;
			}
		} catch (executeError) {
			// Roll back any sub-commands that succeeded before the failure.
			for (let i = this.executedCount - 1; i >= 0; i -= 1) {
				try {
					this.subCommands[i].undo(context);
				} catch (undoError) {
					throw new Error(
						`AddTracksCommand: execute failed at sub-command ${this.executedCount} ` +
							`(${executeError instanceof Error ? executeError.message : String(executeError)}) ` +
							`and rollback failed at sub-command ${i} ` +
							`(${undoError instanceof Error ? undoError.message : String(undoError)}). State may be corrupted.`
					);
				}
			}
			this.executedCount = 0;
			throw executeError;
		}

		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("AddTracksCommand.undo: context is required");
		if (this.executedCount === 0) return CommandNoop("Command was not executed");

		// Undo in reverse order — last-inserted track is removed first.
		for (let i = this.executedCount - 1; i >= 0; i -= 1) {
			this.subCommands[i].undo(context);
		}
		this.executedCount = 0;

		return CommandSuccess();
	}

	dispose(): void {
		for (const cmd of this.subCommands) cmd.dispose?.();
	}
}
