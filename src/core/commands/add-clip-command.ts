import type { Player } from "@canvas/players/player";
import { ClipSchema } from "@schemas/clip";
import type { z } from "zod";

import type { EditCommand, CommandContext } from "./types";

type ClipType = z.infer<typeof ClipSchema>;

export class AddClipCommand implements EditCommand {
	name = "addClip";
	private addedPlayer?: Player;

	constructor(
		private trackIdx: number,
		private clip: ClipType
	) {}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) return; // For backward compatibility
		const validatedClip = ClipSchema.parse(this.clip);
		const clipPlayer = context.createPlayerFromAssetType(validatedClip);
		clipPlayer.layer = this.trackIdx + 1;
		await context.addPlayer(this.trackIdx, clipPlayer);
		context.updateDuration();

		this.addedPlayer = clipPlayer;
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context || !this.addedPlayer) return;
		context.queueDisposeClip(this.addedPlayer);
		context.updateDuration();
	}
}
