import type { ResolvedClip } from "@schemas/clip";
import * as pixi from "pixi.js";

import type { EditCommand, CommandContext } from "./types";

type ClipType = ResolvedClip;

export class DeleteTrackCommand implements EditCommand {
	name = "deleteTrack";
	private deletedClips: Array<{ config: ClipType }> = [];

	constructor(private trackIdx: number) {}

	execute(context?: CommandContext): void {
		if (!context) return;
		const clips = context.getClips();
		const tracks = context.getTracks();

		this.deletedClips = clips.filter(c => c.layer === this.trackIdx + 1).map(c => ({ config: structuredClone(c.clipConfiguration) }));

		clips.forEach((clip, index) => {
			if (clip.layer === this.trackIdx + 1) {
				clips[index].shouldDispose = true;
			}
		});
		context.disposeClips();

		tracks.splice(this.trackIdx, 1);

		// Sync originalEdit - remove the track at same index
		context.removeOriginalEditTrack(this.trackIdx);

		const remainingClips = context.getClips();
		const container = context.getContainer();

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

		context.updateDuration();
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) return;
		const tracks = context.getTracks();
		const clips = context.getClips();

		tracks.splice(this.trackIdx, 0, []);

		// Sync originalEdit - re-insert the track at same index
		context.insertOriginalEditTrack(this.trackIdx);

		clips.forEach((clip, index) => {
			if (clip.layer >= this.trackIdx + 1) {
				clips[index].layer += 1;
			}
		});

		for (const { config } of this.deletedClips) {
			const player = context.createPlayerFromAssetType(config);
			player.layer = this.trackIdx + 1;
			await context.addPlayer(this.trackIdx, player);
		}
		context.updateDuration();
	}
}
