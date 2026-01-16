import type { Destination } from "@schemas";

import type { EditCommand, CommandContext } from "./types";

export class SetOutputDestinationsCommand implements EditCommand {
	name = "setOutputDestinations";
	private previousDestinations?: Destination[];

	constructor(private destinations: Destination[]) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputDestinationsCommand requires context");
		this.previousDestinations = context.getOutputDestinations();
		context.setOutputDestinations(this.destinations);
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("SetOutputDestinationsCommand requires context");
		if (this.previousDestinations === undefined) return;
		context.setOutputDestinations(this.previousDestinations);
	}
}
