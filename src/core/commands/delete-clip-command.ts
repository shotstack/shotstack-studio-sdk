import type { MergeFieldBinding } from "@core/edit-document";
import { EditEvent } from "@core/events/edit-events";
import type { Clip } from "@schemas";

import { DeleteTrackCommand } from "./delete-track-command";
import type { EditCommand, CommandContext } from "./types";

/**
 * Deletes a clip from a track.
 *
 * Document-only: This command only mutates the document.
 * The PlayerReconciler handles Player disposal via the Resolved event.
 */
export class DeleteClipCommand implements EditCommand {
	name = "deleteClip";
	private deletedClipConfig?: Clip;
	private deletedClipId?: string;
	private deleteTrackCommand?: DeleteTrackCommand;
	private trackWasDeleted = false;
	private storedBindings?: Map<string, MergeFieldBinding>;

	constructor(
		private trackIdx: number,
		private clipIdx: number
	) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("DeleteClipCommand.execute: context is required");

		const document = context.getDocument();
		if (!document) throw new Error("DeleteClipCommand: no document");

		const clip = document.getClip(this.trackIdx, this.clipIdx);
		if (!clip) {
			throw new Error(`DeleteClipCommand: no clip at track ${this.trackIdx}, index ${this.clipIdx}`);
		}

		// Save config for undo
		this.deletedClipConfig = structuredClone(clip);
		this.deletedClipId = (clip as { id?: string }).id;

		// Save merge field bindings for undo (from document)
		if (this.deletedClipId) {
			const bindings = context.getClipBindings(this.deletedClipId);
			this.storedBindings = bindings ? new Map(bindings) : undefined;
			// Clear bindings from document (will be recreated on undo)
			document.clearClipBindings(this.deletedClipId);
		}

		// Clear any error associated with this clip before deletion
		context.clearClipError(this.trackIdx, this.clipIdx);

		// Clear selection if deleted clip was selected
		const selectedClip = context.getSelectedClip();
		if (selectedClip && this.deletedClipId && selectedClip.clipId === this.deletedClipId) {
			context.setSelectedClip(null);
			context.emitEvent(EditEvent.SelectionCleared);
		}

		// Document mutation
		context.documentRemoveClip(this.trackIdx, this.clipIdx);

		// Check if track is now empty - delete it
		const track = document.getTrack(this.trackIdx);
		if (track && track.clips.length === 0) {
			this.deleteTrackCommand = new DeleteTrackCommand(this.trackIdx);
			this.deleteTrackCommand.execute(context);
			this.trackWasDeleted = true;
		}

		// Resolve triggers reconciler → disposes orphaned Player
		context.resolve();

		context.updateDuration();

		context.emitEvent(EditEvent.ClipDeleted, {
			trackIndex: this.trackIdx,
			clipIndex: this.clipIdx
		});
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("DeleteClipCommand.undo: context is required");
		if (!this.deletedClipConfig) return;

		// Restore deleted track first if it was deleted
		if (this.trackWasDeleted && this.deleteTrackCommand) {
			this.deleteTrackCommand.undo(context);
			this.trackWasDeleted = false;
		}

		// Document mutation - add clip back at original position
		const restoredClip = context.documentAddClip(this.trackIdx, this.deletedClipConfig, this.clipIdx);

		// Restore merge field bindings to document
		const restoredClipId = (restoredClip as { id?: string }).id;
		if (restoredClipId && this.storedBindings && this.storedBindings.size > 0) {
			const document = context.getDocument();
			document?.setClipBindingsForClip(restoredClipId, this.storedBindings);
		}

		// Resolve triggers reconciler → creates Player
		context.resolve();

		// Restore bindings to player (parallel storage during migration)
		if (restoredClipId && this.storedBindings && this.storedBindings.size > 0) {
			const player = context.getPlayerByClipId(restoredClipId);
			if (player) {
				player.setInitialBindings(this.storedBindings);
			}
		}

		context.updateDuration();

		// Emit event so luma masking can rebuild after restore
		context.emitEvent(EditEvent.ClipRestored, {
			trackIndex: this.trackIdx,
			clipIndex: this.clipIdx
		});
	}

	dispose(): void {
		this.deletedClipConfig = undefined;
		this.deletedClipId = undefined;
		this.deleteTrackCommand = undefined;
		this.storedBindings = undefined;
	}
}
