import type { EditCommand, CommandContext } from "./types";

export class SetOutputAspectRatioCommand implements EditCommand {
	name = "setOutputAspectRatio";
	private previousAspectRatio?: string;

	constructor(private aspectRatio: string) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputAspectRatioCommand requires context");
		this.previousAspectRatio = context.getOutputAspectRatio();
		context.setOutputAspectRatio(this.aspectRatio);
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputAspectRatioCommand requires context");
		if (this.previousAspectRatio === undefined) return;
		context.setOutputAspectRatio(this.previousAspectRatio);
	}
}
