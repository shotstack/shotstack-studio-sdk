import type { EditCommand, CommandContext } from "./types";

export class SetTimelineBackgroundCommand implements EditCommand {
	name = "setTimelineBackground";
	private previousColor?: string;

	constructor(private color: string) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("SetTimelineBackgroundCommand requires context");
		this.previousColor = context.getTimelineBackground();
		context.setTimelineBackground(this.color);
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("SetTimelineBackgroundCommand requires context");
		if (this.previousColor === undefined) return;
		context.setTimelineBackground(this.previousColor);
	}
}
