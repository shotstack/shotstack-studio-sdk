import type { Player } from "@canvas/players/player";
import type { Edit } from "@core/edit";

type EditCommand = { execute(): void | Promise<void>; name: string };

export class SetUpdatedClipCommand implements EditCommand {
	name = "setUpdatedClip";

	constructor(
		private edit: Edit,
		private clip: Player,
		private initialClipConfig: any
	) {}

	execute(): void {
		this.edit.setUpdatedClipForCommand(this.clip);

		const trackIndex = this.clip.layer - 1;
		const clips = this.edit.getClipsForCommand();
		const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
		const clipIndex = clipsByTrack.indexOf(this.clip);

		this.edit.events.emit("clip:updated", {
			previous: { clip: this.initialClipConfig, trackIndex, clipIndex },
			current: { clip: this.clip.clipConfiguration, trackIndex, clipIndex }
		});
	}
}
