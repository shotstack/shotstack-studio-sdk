import type { MergeFieldBinding } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@schemas";
import * as pixi from "pixi.js";

import type { EditCommand, CommandContext } from "./types";

type ClipType = ResolvedClip;

export class DeleteTrackCommand implements EditCommand {
	name = "deleteTrack";
	private deletedClips: Array<{ config: ClipType; bindings: Map<string, MergeFieldBinding> }> = [];

	constructor(private trackIdx: number) {}

	execute(context?: CommandContext): void {
		if (!context) return;
		const clips = context.getClips();
		const tracks = context.getTracks();

		// Save config and bindings for undo
		this.deletedClips = clips
			.filter(c => c.layer === this.trackIdx + 1)
			.map(c => ({
				config: structuredClone(c.clipConfiguration),
				bindings: new Map(c.getMergeFieldBindings())
			}));

		clips.forEach((clip, index) => {
			if (clip.layer === this.trackIdx + 1) {
				clips[index].shouldDispose = true;
			}
		});
		context.disposeClips();

		tracks.splice(this.trackIdx, 1);

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

		context.emitEvent(EditEvent.TrackRemoved, { trackIndex: this.trackIdx });
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) return;
		const tracks = context.getTracks();
		const clips = context.getClips();

		tracks.splice(this.trackIdx, 0, []);

		clips.forEach((clip, index) => {
			if (clip.layer >= this.trackIdx + 1) {
				clips[index].layer += 1;
			}
		});

		for (const { config, bindings } of this.deletedClips) {
			const player = context.createPlayerFromAssetType(config);
			player.layer = this.trackIdx + 1;
			// Restore merge field bindings
			if (bindings.size > 0) {
				player.setInitialBindings(bindings);
			}
			await context.addPlayer(this.trackIdx, player);
		}
		context.updateDuration();
	}
}
