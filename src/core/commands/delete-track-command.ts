import { EditEvent } from "@core/events/edit-events";
import type { Clip } from "@schemas";

import { type AliasReferenceMap, convertMultipleAliasReferences, extractAliasNames, restoreAliasReferences } from "./alias-reference-utils";
import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Deletes a track and all its clips.
 */
export class DeleteTrackCommand implements EditCommand {
	readonly name = "deleteTrack";
	private deletedClips: Clip[] = [];
	private convertedReferences?: AliasReferenceMap;

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

		// Convert alias references to resolved values before deletion
		const aliasNames = extractAliasNames(this.deletedClips);
		if (aliasNames.length > 0) {
			// Build set of clips being deleted (all clips on this track)
			const skipIndices = new Set<string>();
			for (let c = 0; c < this.deletedClips.length; c += 1) {
				skipIndices.add(`${this.trackIdx}:${c}`);
			}
			this.convertedReferences = convertMultipleAliasReferences(document, context.getEditState(), aliasNames, skipIndices);
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

		// Restore alias references that were converted to numeric values
		if (this.convertedReferences && this.convertedReferences.size > 0) {
			restoreAliasReferences(document, this.convertedReferences);
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
		this.convertedReferences = undefined;
	}
}
