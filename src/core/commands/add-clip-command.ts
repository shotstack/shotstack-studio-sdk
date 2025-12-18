import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@schemas/clip";

import type { EditCommand, CommandContext } from "./types";

type ClipType = ResolvedClip;

export class AddClipCommand implements EditCommand {
	name = "addClip";
	private addedPlayer?: Player;

	constructor(
		private trackIdx: number,
		private clip: ClipType
	) {}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) return; // For backward compatibility
		const clipPlayer = context.createPlayerFromAssetType(this.clip);
		clipPlayer.layer = this.trackIdx + 1;
		await context.addPlayer(this.trackIdx, clipPlayer);

		context.updateDuration();
		context.emitEvent(EditEvent.TimelineUpdated, { current: context.getEditState() });

		this.addedPlayer = clipPlayer;
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context || !this.addedPlayer) return;
		context.queueDisposeClip(this.addedPlayer);

		context.updateDuration();
		context.emitEvent(EditEvent.TimelineUpdated, { current: context.getEditState() });
	}
}
