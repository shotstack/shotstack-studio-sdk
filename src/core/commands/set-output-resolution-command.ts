import type { EditCommand, CommandContext } from "./types";

export class SetOutputResolutionCommand implements EditCommand {
	name = "setOutputResolution";
	private previousResolution?: string;

	constructor(private resolution: string) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputResolutionCommand requires context");
		this.previousResolution = context.getOutputResolution();
		context.setOutputResolution(this.resolution);
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputResolutionCommand requires context");
		if (this.previousResolution === undefined) return;
		context.setOutputResolution(this.previousResolution);
	}
}
