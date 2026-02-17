import { type Seconds } from "@core/timing/types";

import { AttachLumaCommand } from "./attach-luma-command";
import { MoveClipCommand } from "./move-clip-command";
import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Compound command that moves a clip to a different track AND attaches it as a luma mask atomically.
 */
export class MoveAndAttachLumaCommand implements EditCommand {
	readonly name = "moveAndAttachLuma";

	private moveCommand?: MoveClipCommand;
	private attachCommand?: AttachLumaCommand;
	private wasExecuted = false;

	constructor(
		private readonly fromTrackIndex: number,
		private readonly fromClipIndex: number,
		private readonly toTrackIndex: number,
		private readonly contentTrackIndex: number,
		private readonly contentClipIndex: number,
		private readonly targetStart: Seconds
	) {
		// Create move command only if track changes
		if (fromTrackIndex !== toTrackIndex) {
			this.moveCommand = new MoveClipCommand(fromTrackIndex, fromClipIndex, toTrackIndex, targetStart);
		}

		// AttachLumaCommand will be created in execute() after we have correct indices
	}

	async execute(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("MoveAndAttachLumaCommand requires context");

		// 1. Get STABLE Player references BEFORE move
		const lumaPlayer = context.getClipAt(this.fromTrackIndex, this.fromClipIndex);
		const contentPlayer = context.getClipAt(this.contentTrackIndex, this.contentClipIndex);

		if (!lumaPlayer || !contentPlayer) {
			return CommandNoop("Clips not found");
		}

		let moveExecuted = false;

		try {
			// 2. Execute move if needed (changes track)
			if (this.moveCommand) {
				await this.moveCommand.execute(context);
				moveExecuted = true;
			}

			// 3. Find NEW indices using stable Player references
			const lumaIndices = context.findClipIndices(lumaPlayer);
			const contentIndices = context.findClipIndices(contentPlayer);

			if (!lumaIndices || !contentIndices) {
				throw new Error("Failed to find clips after move");
			}

			// 4. Create attach command with CORRECT indices
			this.attachCommand = new AttachLumaCommand(lumaIndices.trackIndex, lumaIndices.clipIndex, contentIndices.trackIndex, contentIndices.clipIndex);

			// 5. Execute attach
			await this.attachCommand.execute(context);

			this.wasExecuted = true;
		} catch (executeError) {
			// Attempt partial rollback: only undo move if it succeeded but attach failed
			if (moveExecuted && !this.wasExecuted && this.moveCommand) {
				try {
					await this.moveCommand.undo(context);
				} catch (undoError) {
					// If rollback fails, throw a compound error with both failures
					throw new Error(
						`MoveAndAttachLumaCommand: execute failed (${executeError instanceof Error ? executeError.message : String(executeError)}) ` +
							`and rollback also failed (${undoError instanceof Error ? undoError.message : String(undoError)}). State may be corrupted.`
					);
				}
			}
			throw executeError;
		}

		return CommandSuccess();
	}

	async undo(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("MoveAndAttachLumaCommand.undo: context is required");
		if (!this.wasExecuted || !this.attachCommand) return CommandNoop("Command was not executed");

		// Undo in REVERSE order: attach first, then move
		await this.attachCommand.undo(context);

		if (this.moveCommand) {
			await this.moveCommand.undo(context);
		}

		this.wasExecuted = false;
		return CommandSuccess();
	}

	dispose(): void {
		this.attachCommand?.dispose?.();
		this.moveCommand?.dispose?.();
	}
}
