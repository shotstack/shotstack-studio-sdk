import { EditEvent } from "@core/events/edit-events";
import type { Clip } from "@schemas";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Deletes a track and all its clips.
 */
export class DeleteTrackCommand implements EditCommand {
	readonly name = "deleteTrack";
	private deletedClips: Clip[] = [];

	constructor(private trackIdx: number) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("DeleteTrackCommand.execute: context is required");

		const document = context.getDocument();
		if (!document) throw new Error("DeleteTrackCommand: no document");

		if (document.getTrackCount() <= 1) {
			return CommandNoop("Cannot delete the last track");
		}

		// Save clips for undo
		const track = document.getTrack(this.trackIdx);
		if (track) {
			this.deletedClips = track.clips.map(c => structuredClone(c));
		}

		// Document mutation - remove track (and all its clips)
		document.removeTrack(this.trackIdx);

		// Resolve triggers reconciler:
		// - Disposes orphaned Players (clips on deleted track)
		// - Updates remaining Players' layers (clips below move up)
		context.resolve();

		context.updateDuration();

		context.emitEvent(EditEvent.TrackRemoved, { trackIndex: this.trackIdx });

		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("DeleteTrackCommand.undo: context is required");

		const document = context.getDocument();
		if (!document) throw new Error("DeleteTrackCommand.undo: no document");

		// Document mutation - add track back at original position
		document.addTrack(this.trackIdx);

		// Add all clips back to the restored track
		for (let i = 0; i < this.deletedClips.length; i += 1) {
			document.addClip(this.trackIdx, this.deletedClips[i], i);
		}

		// Resolve triggers reconciler:
		// - Creates Players for restored clips
		// - Updates remaining Players' layers (clips below move down)
		context.resolve();

		context.updateDuration();

		context.emitEvent(EditEvent.TrackAdded, { trackIndex: this.trackIdx, totalTracks: document.getTrackCount() });

		return CommandSuccess();
	}

	dispose(): void {
		this.deletedClips = [];
	}
}
