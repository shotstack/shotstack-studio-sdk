import type { Player } from "@canvas/players/player";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess } from "./types";

export class ExportCommand implements EditCommand {
	readonly name = "export";
	private clips: Player[] = [];
	private tracks: Player[][] = [];

	execute(context: CommandContext): CommandResult {
		this.clips = context.getClips();
		this.tracks = context.getTracks();
		return CommandSuccess();
	}

	getClips(): ReadonlyArray<Player> {
		return this.clips;
	}

	getTracks(): ReadonlyArray<ReadonlyArray<Player>> {
		return this.tracks;
	}

	dispose(): void {
		this.clips = [];
		this.tracks = [];
	}
}
