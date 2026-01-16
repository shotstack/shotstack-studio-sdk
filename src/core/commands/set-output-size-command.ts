import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

export class SetOutputSizeCommand implements EditCommand {
	readonly name = "setOutputSize";
	private previousSize?: { width: number; height: number };

	constructor(
		private width: number,
		private height: number
	) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputSizeCommand requires context");
		this.previousSize = context.getOutputSize();
		context.setOutputSize(this.width, this.height);
		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputSizeCommand requires context");
		if (!this.previousSize) return CommandNoop("No previous size stored");
		context.setOutputSize(this.previousSize.width, this.previousSize.height);
		return CommandSuccess();
	}

	dispose(): void {
		this.previousSize = undefined;
	}
}
