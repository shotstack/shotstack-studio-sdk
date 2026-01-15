import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@schemas";

import type { EditCommand, CommandContext } from "./types";

type ClipType = ResolvedClip;

/**
 * Atomic command that adds a new clip to a track.
 */
export class AddClipCommand implements EditCommand {
	name = "addClip";
	private addedPlayer?: Player;

	constructor(
		private trackIdx: number,
		private clip: ClipType
	) {}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("AddClipCommand.execute: context is required");

		const clipPlayer = context.createPlayerFromAssetType(this.clip);
		clipPlayer.layer = this.trackIdx + 1;

		try {
			await context.addPlayer(this.trackIdx, clipPlayer);
		} catch (error) {
			context.queueDisposeClip(clipPlayer);
			context.emitEvent(EditEvent.ClipLoadFailed, {
				trackIndex: this.trackIdx,
				clipIndex: -1,
				error: error instanceof Error ? error.message : String(error),
				assetType: (this.clip.asset as { type?: string }).type ?? "unknown"
			});
			throw error;
		}

		const clips = context.getClips();
		const trackClips = clips.filter(c => c.layer === clipPlayer.layer);
		const clipIndex = trackClips.findIndex(c => c === clipPlayer);

		context.documentAddClip(this.trackIdx, this.clip, clipIndex);

		context.updateDuration();
		context.emitEvent(EditEvent.ClipAdded, { trackIndex: this.trackIdx, clipIndex });

		this.addedPlayer = clipPlayer;
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("AddClipCommand.undo: context is required");
		if (!this.addedPlayer) return;

		const clips = context.getClips();
		const trackClips = clips.filter(c => c.layer === this.addedPlayer!.layer);
		const clipIndex = trackClips.findIndex(c => c === this.addedPlayer);

		context.documentRemoveClip(this.trackIdx, clipIndex);

		context.queueDisposeClip(this.addedPlayer);
		this.addedPlayer = undefined;

		context.updateDuration();
		context.emitEvent(EditEvent.ClipDeleted, { trackIndex: this.trackIdx, clipIndex });
	}

	dispose(): void {
		this.addedPlayer = undefined;
	}
}
