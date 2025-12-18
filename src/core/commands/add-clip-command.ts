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

		// Find the clip's index in the track
		const clips = context.getClips();
		const trackClips = clips.filter(c => c.layer === clipPlayer.layer);
		const clipIndex = trackClips.findIndex(c => c === clipPlayer);

		context.updateDuration();
		context.emitEvent(EditEvent.ClipAdded, { trackIndex: this.trackIdx, clipIndex });

		this.addedPlayer = clipPlayer;
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context || !this.addedPlayer) return;

		// Find clip index before disposal
		const clips = context.getClips();
		const trackClips = clips.filter(c => c.layer === this.addedPlayer!.layer);
		const clipIndex = trackClips.findIndex(c => c === this.addedPlayer);

		context.queueDisposeClip(this.addedPlayer);
		context.updateDuration();
		context.emitEvent(EditEvent.ClipDeleted, { trackIndex: this.trackIdx, clipIndex });
	}
}
