import { type Seconds } from "@core/timing/types";

import { CreateTrackAndMoveClipCommand } from "./create-track-and-move-clip-command";
import { DetachLumaCommand } from "./detach-luma-command";
import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Compound command that creates a track, moves a luma clip to it, and detaches it atomically.
 */
export class CreateTrackMoveAndDetachLumaCommand implements EditCommand {
	readonly name = "createTrackMoveAndDetachLuma";

	private createTrackAndMoveCommand: CreateTrackAndMoveClipCommand;
	private detachCommand: DetachLumaCommand;
	private wasExecuted = false;

	constructor(
		private readonly insertionIndex: number,
		private readonly fromTrackIndex: number,
		private readonly fromClipIndex: number,
		private readonly newStart: Seconds,
		private readonly targetAssetType: "image" | "video"
	) {
		// Create track and move (clip will end up at insertionIndex)
		this.createTrackAndMoveCommand = new CreateTrackAndMoveClipCommand(insertionIndex, fromTrackIndex, fromClipIndex, newStart);

		// After move, clip will be at index 0 on the new track (insertionIndex)
		this.detachCommand = new DetachLumaCommand(insertionIndex, 0, targetAssetType);
	}

	async execute(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("CreateTrackMoveAndDetachLumaCommand requires context");

		let createMoveExecuted = false;

		try {
			// 1. Execute create track + move
			await this.createTrackAndMoveCommand.execute(context);
			createMoveExecuted = true;

			// 2. Execute detach (transform back to original type)
			await this.detachCommand.execute(context);

			this.wasExecuted = true;
		} catch (executeError) {
			// Attempt partial rollback
			if (createMoveExecuted && !this.wasExecuted) {
				try {
					await this.createTrackAndMoveCommand.undo(context);
				} catch (undoError) {
					throw new Error(
						`CreateTrackMoveAndDetachLumaCommand: execute failed (${executeError instanceof Error ? executeError.message : String(executeError)}) ` +
							`and rollback failed (${undoError instanceof Error ? undoError.message : String(undoError)})`
					);
				}
			}
			throw executeError;
		}

		return CommandSuccess();
	}

	async undo(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("CreateTrackMoveAndDetachLumaCommand.undo: context is required");
		if (!this.wasExecuted) return CommandNoop("Command was not executed");

		// Undo in REVERSE order
		await this.detachCommand.undo(context);
		await this.createTrackAndMoveCommand.undo(context);

		this.wasExecuted = false;
		return CommandSuccess();
	}

	dispose(): void {
		this.detachCommand.dispose?.();
		this.createTrackAndMoveCommand.dispose?.();
	}
}
