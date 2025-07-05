import type { Player } from "@canvas/players/player";
import type { Edit } from "@core/edit";

interface EditCommand {
	execute(): void | Promise<void>;
	name: string;
}

export class DeleteClipCommand implements EditCommand {
	name = "deleteClip";

	constructor(
		private edit: Edit,
		private trackIdx: number,
		private clipIdx: number
	) {}

	execute(): void {
		const clips = this.edit.getClipsForCommand();
		const trackClips = clips.filter((c: Player) => c.layer === this.trackIdx + 1);
		const clipToDelete = trackClips[this.clipIdx];

		if (clipToDelete) {
			this.edit.queueDisposeClipForCommand(clipToDelete);
			this.edit.updateTotalDurationForCommand();
		}
	}
}