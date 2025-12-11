import type { Player } from "@canvas/players/player";

import type { EditCommand, CommandContext } from "./types";

export class DeleteClipCommand implements EditCommand {
	name = "deleteClip";
	private deletedClip?: Player;

	constructor(
		private trackIdx: number,
		private clipIdx: number
	) {}

	execute(context?: CommandContext): void {
		if (!context) return; // For backward compatibility
		const clips = context.getClips();
		const trackClips = clips.filter((c: Player) => c.layer === this.trackIdx + 1);
		this.deletedClip = trackClips[this.clipIdx];

		if (this.deletedClip) {
			context.queueDisposeClip(this.deletedClip);
			context.disposeClips();
			context.updateDuration();

			// Propagate timing changes to clips that were after the deleted clip
			// Use clipIdx - 1 because the clip at clipIdx no longer exists
			context.propagateTimingChanges(this.trackIdx, this.clipIdx - 1);

			// Emit event so luma masking and other listeners can update
			context.emitEvent("clip:deleted", {
				trackIndex: this.trackIdx,
				clipIndex: this.clipIdx
			});
		}
	}

	undo(context?: CommandContext): void {
		if (!context || !this.deletedClip) return;
		context.undeleteClip(this.trackIdx, this.deletedClip);

		// Propagate timing changes after restoring the clip
		context.propagateTimingChanges(this.trackIdx, this.clipIdx);

		// Emit event so luma masking can rebuild after restore
		context.emitEvent("clip:restored", {
			trackIndex: this.trackIdx,
			clipIndex: this.clipIdx
		});
	}
}
