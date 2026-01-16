import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

export class SetTimelineBackgroundCommand implements EditCommand {
	readonly name = "setTimelineBackground";
	private previousColor?: string;

	constructor(private color: string) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetTimelineBackgroundCommand requires context");
		this.previousColor = context.getTimelineBackground();
		context.setTimelineBackground(this.color);
		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetTimelineBackgroundCommand requires context");
		if (this.previousColor === undefined) return CommandNoop("No previous color stored");
		context.setTimelineBackground(this.previousColor);
		return CommandSuccess();
	}

	dispose(): void {
		this.previousColor = undefined;
	}
}
