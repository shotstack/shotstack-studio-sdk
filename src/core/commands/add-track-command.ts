import { EditEvent } from "@core/events/edit-events";
import * as pixi from "pixi.js";

import type { EditCommand, CommandContext } from "./types";

/**
 * Atomic command that adds a new track with at least one clip.
 */
export class AddTrackCommand implements EditCommand {
	name = "addTrack";

	constructor(private trackIdx: number) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("AddTrackCommand.execute: context is required");
		const tracks = context.getTracks();
		const clips = context.getClips();

		tracks.splice(this.trackIdx, 0, []);

		const doc = context.getDocument();
		if (!doc) {
			throw new Error(`AddTrackCommand.execute: Document not initialized - cannot sync track ${this.trackIdx}`);
		}
		doc.addTrack(this.trackIdx);

		clips.forEach(clip => {
			if (clip.layer > this.trackIdx) {
				const oldZIndex = 100000 - clip.layer * 100;
				const oldContainer = context.getContainer().getChildByLabel(`shotstack-track-${oldZIndex}`, false);
				if (oldContainer) {
					oldContainer.removeChild(clip.getContainer());
				}

				// eslint-disable-next-line no-param-reassign
				clip.layer += 1;

				const newZIndex = 100000 - clip.layer * 100;
				let newContainer = context.getContainer().getChildByLabel(`shotstack-track-${newZIndex}`, false);
				if (!newContainer) {
					newContainer = new pixi.Container({ label: `shotstack-track-${newZIndex}`, zIndex: newZIndex });
					context.getContainer().addChild(newContainer);
				}
				newContainer.addChild(clip.getContainer());
			}
		});

		context.getContainer().sortDirty = true;
		context.updateDuration();

		context.emitEvent(EditEvent.TrackAdded, {
			trackIndex: this.trackIdx,
			totalTracks: tracks.length
		});
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("AddTrackCommand.undo: context is required");
		const tracks = context.getTracks();
		const clips = context.getClips();

		tracks.splice(this.trackIdx, 1);

		const doc = context.getDocument();
		if (!doc) {
			throw new Error(`AddTrackCommand.undo: Document not initialized - cannot sync track ${this.trackIdx}`);
		}
		doc.removeTrack(this.trackIdx);

		clips.forEach(clip => {
			if (clip.layer > this.trackIdx) {
				const oldZIndex = 100000 - clip.layer * 100;
				const oldContainer = context.getContainer().getChildByLabel(`shotstack-track-${oldZIndex}`, false);
				if (oldContainer) {
					oldContainer.removeChild(clip.getContainer());
				}

				// eslint-disable-next-line no-param-reassign
				clip.layer -= 1;

				const newZIndex = 100000 - clip.layer * 100;
				let newContainer = context.getContainer().getChildByLabel(`shotstack-track-${newZIndex}`, false);
				if (!newContainer) {
					newContainer = new pixi.Container({ label: `shotstack-track-${newZIndex}`, zIndex: newZIndex });
					context.getContainer().addChild(newContainer);
				}
				newContainer.addChild(clip.getContainer());
			}
		});

		context.getContainer().sortDirty = true;
		context.updateDuration();
	}

	dispose(): void {
		// No resources to release
	}
}
