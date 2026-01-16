import type { EditCommand, CommandContext } from "./types";

export class SetOutputFormatCommand implements EditCommand {
	name = "setOutputFormat";
	private previousFormat?: string;

	constructor(private format: string) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputFormatCommand requires context");
		this.previousFormat = context.getOutputFormat();
		context.setOutputFormat(this.format);
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputFormatCommand requires context");
		if (this.previousFormat === undefined) return;
		context.setOutputFormat(this.previousFormat);
	}
}
