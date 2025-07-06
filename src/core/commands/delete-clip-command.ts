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
			context.updateDuration();
		}
	}

	undo(context?: CommandContext): void {
		if (!context || !this.deletedClip) return;
		context.undeleteClip(this.trackIdx, this.deletedClip);
	}
}
