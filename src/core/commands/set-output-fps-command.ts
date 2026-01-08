import type { EditCommand, CommandContext } from "./types";

export class SetOutputFpsCommand implements EditCommand {
	name = "setOutputFps";
	private previousFps?: number;

	constructor(private fps: number) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputFpsCommand requires context");
		this.previousFps = context.getOutputFps();
		context.setOutputFps(this.fps);
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputFpsCommand requires context");
		if (this.previousFps === undefined) return;
		context.setOutputFps(this.previousFps);
	}
}
