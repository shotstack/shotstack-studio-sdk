import type { Edit } from "@core/edit";
import * as pixi from "pixi.js";

type EditCommand = { execute(): void | Promise<void>; name: string };

export class DeleteTrackCommand implements EditCommand {
	name = "deleteTrack";

	constructor(
		private edit: Edit,
		private trackIdx: number
	) {}

	execute(): void {
		const clips = this.edit.getClipsForCommand();
		const tracks = this.edit.getTracksForCommand();

		// Mark track clips for disposal
		clips.forEach((clip, index) => {
			if (clip.layer === this.trackIdx + 1) {
				clips[index].shouldDispose = true;
			}
		});
		this.edit.disposeClipsForCommand();

		tracks.splice(this.trackIdx, 1);

		// Move affected clips down one layer
		const remainingClips = this.edit.getClipsForCommand();
		const container = this.edit.getContainerForCommand();

		remainingClips.forEach((clip, index) => {
			if (clip.layer > this.trackIdx + 1) {
				const oldContainer = container.getChildByLabel(`shotstack-track-${100000 - clip.layer * 100}`, false);
				oldContainer?.removeChild(clip.getContainer());
				remainingClips[index].layer -= 1;

				const zIndex = 100000 - remainingClips[index].layer * 100;
				let trackContainer = container.getChildByLabel(`shotstack-track-${zIndex}`, false);
				if (!trackContainer) {
					trackContainer = new pixi.Container({ label: `shotstack-track-${zIndex}`, zIndex });
					container.addChild(trackContainer);
				}
				trackContainer.addChild(remainingClips[index].getContainer());
			}
		});

		this.edit.updateTotalDurationForCommand();
	}
}
