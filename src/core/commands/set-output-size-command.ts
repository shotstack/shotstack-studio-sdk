import type { EditCommand, CommandContext } from "./types";

export class SetOutputSizeCommand implements EditCommand {
	name = "setOutputSize";
	private previousSize?: { width: number; height: number };

	constructor(
		private width: number,
		private height: number
	) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputSizeCommand requires context");
		this.previousSize = context.getOutputSize();
		context.setOutputSize(this.width, this.height);
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputSizeCommand requires context");
		if (!this.previousSize) return;
		context.setOutputSize(this.previousSize.width, this.previousSize.height);
	}
}
