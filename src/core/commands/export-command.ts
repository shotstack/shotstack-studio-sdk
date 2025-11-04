import type { Player } from "@canvas/players/player";

import type { EditCommand, CommandContext } from "./types";

export class ExportCommand implements EditCommand {
	readonly name = "export";
	private clips: Player[] = [];
	private tracks: Player[][] = [];

	execute(context: CommandContext): void {
		this.clips = context.getClips();
		this.tracks = context.getTracks();
	}

	getClips(): ReadonlyArray<Player> {
		return this.clips;
	}

	getTracks(): ReadonlyArray<ReadonlyArray<Player>> {
		return this.tracks;
	}
}
