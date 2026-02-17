import type { Destination } from "@schemas";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

export class SetOutputDestinationsCommand implements EditCommand {
	readonly name = "setOutputDestinations";
	private previousDestinations?: Destination[];

	constructor(private destinations: Destination[]) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputDestinationsCommand requires context");
		this.previousDestinations = context.getOutputDestinations();
		context.setOutputDestinations(this.destinations);
		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("SetOutputDestinationsCommand requires context");
		if (this.previousDestinations === undefined) return CommandNoop("No previous destinations stored");
		context.setOutputDestinations(this.previousDestinations);
		return CommandSuccess();
	}

	dispose(): void {
		this.previousDestinations = undefined;
	}
}
