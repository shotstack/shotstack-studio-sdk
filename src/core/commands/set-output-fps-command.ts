import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

export class SetOutputFpsCommand implements EditCommand {
	readonly name = "setOutputFps";
	private previousFps?: number;

	constructor(private fps: number) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputFpsCommand requires context");
		this.previousFps = context.getOutputFps();
		context.setOutputFps(this.fps);
		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputFpsCommand requires context");
		if (this.previousFps === undefined) return CommandNoop("No previous FPS stored");
		context.setOutputFps(this.previousFps);
		return CommandSuccess();
	}

	dispose(): void {
		this.previousFps = undefined;
	}
}
