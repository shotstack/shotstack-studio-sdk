import { CommandSuccess, type CommandContext, type CommandResult, type EditCommand } from "./types";

// Applies several commands as one undo step; the first command's result is the outcome.
export class CompositeCommand implements EditCommand {
	readonly name: string;

	constructor(
		private readonly commands: readonly EditCommand[],
		name: string
	) {
		this.name = name;
	}

	async execute(context?: CommandContext): Promise<CommandResult> {
		let first: CommandResult | undefined;
		for (const command of this.commands) {
			const result = await command.execute(context);
			first ??= result;
		}
		return first ?? CommandSuccess();
	}

	async undo(context?: CommandContext): Promise<CommandResult> {
		for (const command of [...this.commands].reverse()) await command.undo?.(context);
		return CommandSuccess();
	}

	dispose(): void {
		this.commands.forEach(command => command.dispose?.());
	}
}
