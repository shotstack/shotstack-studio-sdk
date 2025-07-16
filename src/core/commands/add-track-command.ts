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
		

		const affectedClips = clips.filter(clip => clip.layer >= this.trackIdx + 1);
		const container = context.getContainer();

		clips.forEach((clip, index) => {
			if (clip.layer >= this.trackIdx + 1) {
				const oldContainer = container.getChildByLabel(`shotstack-track-${100000 - clip.layer * 100}`, false);
				oldContainer?.removeChild(clip.getContainer());
				clips[index].layer += 1;
			}
		});

		affectedClips.forEach(clip => {
			const zIndex = 100000 - clip.layer * 100;
			let trackContainer = container.getChildByLabel(`shotstack-track-${zIndex}`, false);
			if (!trackContainer) {
				trackContainer = new pixi.Container({ label: `shotstack-track-${zIndex}`, zIndex });
				container.addChild(trackContainer);
			}
			trackContainer.addChild(clip.getContainer());
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
		clips.forEach((clip, index) => {
			if (clip.layer > this.trackIdx + 1) {
				clips[index].layer -= 1;
			}
		});
		context.updateDuration();
	}
}
