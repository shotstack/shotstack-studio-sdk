import type { Edit } from "@core/edit";
import type { TrackSchema } from "@schemas/track";
import * as pixi from "pixi.js";
import type { z } from "zod";

type TrackType = z.infer<typeof TrackSchema>;
interface EditCommand { execute(): void | Promise<void>; name: string; }

export class AddTrackCommand implements EditCommand {
	name = "addTrack";

	constructor(
		private edit: Edit,
		private trackIdx: number,
		private track: TrackType
	) {}

	execute(): void {
		const tracks = this.edit.getTracksForCommand();
		const clips = this.edit.getClipsForCommand();
		tracks.splice(this.trackIdx, 0, []);

		const affectedClips = clips.filter(clip => clip.layer >= this.trackIdx + 1);
		const container = this.edit.getContainerForCommand();

		// Remove from old containers and update layers
		clips.forEach((clip, index) => {
			if (clip.layer >= this.trackIdx + 1) {
				const oldContainer = container.getChildByLabel(`shotstack-track-${100000 - clip.layer * 100}`, false);
				oldContainer?.removeChild(clip.getContainer());
				clips[index].layer += 1;
			}
		});

		// Re-add clips to new containers
		affectedClips.forEach(clip => {
			const zIndex = 100000 - clip.layer * 100;
			let trackContainer = container.getChildByLabel(`shotstack-track-${zIndex}`, false);
			if (!trackContainer) {
				trackContainer = new pixi.Container({ label: `shotstack-track-${zIndex}`, zIndex });
				container.addChild(trackContainer);
			}
			trackContainer.addChild(clip.getContainer());
		});

		this.track?.clips?.forEach(clip => this.edit.addClip(this.trackIdx, clip));
		this.edit.updateTotalDurationForCommand();
	}
}