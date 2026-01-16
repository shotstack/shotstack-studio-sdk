import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

export class SetOutputFormatCommand implements EditCommand {
	readonly name = "setOutputFormat";
	private previousFormat?: string;

	constructor(private format: string) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputFormatCommand requires context");
		this.previousFormat = context.getOutputFormat();
		context.setOutputFormat(this.format);
		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputFormatCommand requires context");
		if (this.previousFormat === undefined) return CommandNoop("No previous format stored");
		context.setOutputFormat(this.previousFormat);
		return CommandSuccess();
	}

	dispose(): void {
		this.previousFormat = undefined;
	}
}
