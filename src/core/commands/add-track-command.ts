import { EditEvent } from "@core/events/edit-events";
import type { Clip, Track } from "@schemas";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess } from "./types";

interface InternalClip extends Clip {
	id?: string;
}

/**
 * Atomic command that adds a new track (with optional clips) to the document.
 */
export class AddTrackCommand implements EditCommand {
	readonly name = "addTrack";

	private readonly trackIdx: number;
	private readonly preparedTrack?: Track;

	constructor(trackIdx: number, track?: Track) {
		this.trackIdx = trackIdx;
		if (track) {
			this.preparedTrack = {
				...track,
				clips: track.clips.map(clip => {
					const cloned = structuredClone(clip) as InternalClip;
					if (!cloned.id) cloned.id = crypto.randomUUID();
					return cloned;
				})
			};
		}
	}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("AddTrackCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("AddTrackCommand.execute: document is required");

		doc.addTrack(this.trackIdx, this.preparedTrack);

		context.resolve();
		context.updateDuration();

		context.emitEvent(EditEvent.TrackAdded, {
			trackIndex: this.trackIdx,
			totalTracks: doc.getTrackCount()
		});

		if (this.preparedTrack) {
			for (let i = 0; i < this.preparedTrack.clips.length; i += 1) {
				context.emitEvent(EditEvent.ClipAdded, {
					trackIndex: this.trackIdx,
					clipIndex: i
				});
			}
		}

		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("AddTrackCommand.undo: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("AddTrackCommand.undo: document is required");

		const trackToRemove = doc.getTrack(this.trackIdx);
		const clipCount = trackToRemove?.clips.length ?? 0;

		doc.removeTrack(this.trackIdx);

		context.resolve();
		context.updateDuration();

		for (let i = clipCount - 1; i >= 0; i -= 1) {
			context.emitEvent(EditEvent.ClipDeleted, {
				trackIndex: this.trackIdx,
				clipIndex: i
			});
		}
		context.emitEvent(EditEvent.TrackRemoved, { trackIndex: this.trackIdx });

		return CommandSuccess();
	}

	dispose(): void {
		// No resources to release
	}
}
