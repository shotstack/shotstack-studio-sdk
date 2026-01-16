import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

export class SetOutputAspectRatioCommand implements EditCommand {
	readonly name = "setOutputAspectRatio";
	private previousAspectRatio?: string;

	constructor(private aspectRatio: string) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputAspectRatioCommand requires context");
		this.previousAspectRatio = context.getOutputAspectRatio();
		context.setOutputAspectRatio(this.aspectRatio);
		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputAspectRatioCommand requires context");
		if (this.previousAspectRatio === undefined) return CommandNoop("No previous aspect ratio stored");
		context.setOutputAspectRatio(this.previousAspectRatio);
		return CommandSuccess();
	}

	dispose(): void {
		this.previousAspectRatio = undefined;
	}
}
