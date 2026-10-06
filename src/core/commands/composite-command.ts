import { CommandSuccess, type CommandContext, type CommandResult, type EditCommand } from "./types";

// Applies several commands as one undo step, stopping at the first that does not succeed.
export class CompositeCommand implements EditCommand {
	readonly name: string;
	private executed: EditCommand[] = [];

	constructor(
		private readonly commands: readonly EditCommand[],
		name: string
	) {
		this.name = name;
	}

	async execute(context?: CommandContext): Promise<CommandResult> {
		this.executed = [];
		let first: CommandResult | undefined;
		for (const command of this.commands) {
			const result = await command.execute(context);
			if (result.status !== "success") return result;
			this.executed.push(command);
			first ??= result;
		}
		return first ?? CommandSuccess();
	}

	async undo(context?: CommandContext): Promise<CommandResult> {
		for (const command of [...this.executed].reverse()) await command.undo?.(context);
		return CommandSuccess();
	}

	dispose(): void {
		this.commands.forEach(command => command.dispose?.());
	}
}
