import { EditEvent } from "@core/events/edit-events";

import type { EditCommand, CommandContext } from "./types";

/**
 * Document-only command that adds a new empty track.
 *
 * Flow: Document mutation → resolve() → Reconciler syncs track containers and player layers
 */
export class AddTrackCommand implements EditCommand {
	name = "addTrack";

	constructor(private trackIdx: number) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("AddTrackCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("AddTrackCommand.execute: document is required");

		// Document-only mutation
		doc.addTrack(this.trackIdx);

		// Reconciler handles track container creation and player layer updates
		context.resolve();

		context.updateDuration();

		context.emitEvent(EditEvent.TrackAdded, {
			trackIndex: this.trackIdx,
			totalTracks: doc.getTrackCount()
		});
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("AddTrackCommand.undo: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("AddTrackCommand.undo: document is required");

		// Document-only mutation
		doc.removeTrack(this.trackIdx);

		// Reconciler handles track container removal and player layer updates
		context.resolve();

		context.updateDuration();
	}

	dispose(): void {
		// No resources to release
	}
}
