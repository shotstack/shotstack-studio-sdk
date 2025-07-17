import * as pixi from "pixi.js";

import type { EditCommand, CommandContext } from "./types";

export class AddTrackCommand implements EditCommand {
	name = "addTrack";

	constructor(private trackIdx: number) {}

	execute(context?: CommandContext): void {
		if (!context) return;
		const tracks = context.getTracks();
		const clips = context.getClips();

		tracks.splice(this.trackIdx, 0, []);

		// Update layers for all clips that are on tracks at or after the insertion point
		// Since we're inserting a track, all tracks at or after trackIdx shift down
		clips.forEach(clip => {
			if (clip.layer > this.trackIdx) {
				// Remove from old container
				const oldZIndex = 100000 - clip.layer * 100;
				const oldContainer = context.getContainer().getChildByLabel(`shotstack-track-${oldZIndex}`, false);
				if (oldContainer) {
					oldContainer.removeChild(clip.getContainer());
				}

				// Update layer (track index + 1)
				// eslint-disable-next-line no-param-reassign
				clip.layer += 1;

				// Add to new container
				const newZIndex = 100000 - clip.layer * 100;
				let newContainer = context.getContainer().getChildByLabel(`shotstack-track-${newZIndex}`, false);
				if (!newContainer) {
					newContainer = new pixi.Container({ label: `shotstack-track-${newZIndex}`, zIndex: newZIndex });
					context.getContainer().addChild(newContainer);
				}
				newContainer.addChild(clip.getContainer());
			}
		});
		context.updateDuration();

		// Emit track creation event to trigger timeline visual updates
		context.emitEvent("track:added", {
			trackIndex: this.trackIdx,
			totalTracks: tracks.length
		});
	}

	undo(context?: CommandContext): void {
		if (!context) return;
		const tracks = context.getTracks();
		const clips = context.getClips();
		tracks.splice(this.trackIdx, 1);
		clips.forEach((clip) => {
			if (clip.layer > this.trackIdx + 1) {
				// eslint-disable-next-line no-param-reassign
				clip.layer -= 1;
			}
		});
		context.updateDuration();
	}
}
