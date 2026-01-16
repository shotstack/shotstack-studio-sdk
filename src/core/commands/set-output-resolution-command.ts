import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

export class SetOutputResolutionCommand implements EditCommand {
	readonly name = "setOutputResolution";
	private previousResolution?: string;

	constructor(private resolution: string) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputResolutionCommand requires context");
		this.previousResolution = context.getOutputResolution();
		context.setOutputResolution(this.resolution);
		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputResolutionCommand requires context");
		if (this.previousResolution === undefined) return CommandNoop("No previous resolution stored");
		context.setOutputResolution(this.previousResolution);
		return CommandSuccess();
	}

	dispose(): void {
		this.previousResolution = undefined;
	}
}
