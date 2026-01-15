import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";

import { DeleteTrackCommand } from "./delete-track-command";
import type { EditCommand, CommandContext } from "./types";

export class DeleteClipCommand implements EditCommand {
	name = "deleteClip";
	private deletedClip?: Player;
	private deleteTrackCommand?: DeleteTrackCommand;
	private trackWasDeleted = false;

	constructor(
		private trackIdx: number,
		private clipIdx: number
	) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("DeleteClipCommand.execute: context is required");

		const track = context.getTrack(this.trackIdx);
		if (!track) {
			throw new Error(`DeleteClipCommand: invalid track index ${this.trackIdx}`);
		}
		this.deletedClip = track[this.clipIdx];
		if (!this.deletedClip) {
			throw new Error(`DeleteClipCommand: no clip at track ${this.trackIdx}, index ${this.clipIdx}`);
		}

		// Clear any error associated with this clip before deletion
		context.clearClipError(this.trackIdx, this.clipIdx);

		context.documentRemoveClip(this.trackIdx, this.clipIdx);

		context.queueDisposeClip(this.deletedClip);
		context.disposeClips();
		context.updateDuration();

		context.propagateTimingChanges(this.trackIdx, Math.max(0, this.clipIdx - 1));

		const selectedClip = context.getSelectedClip();
		if (selectedClip === this.deletedClip) {
			context.setSelectedClip(null);
			context.emitEvent(EditEvent.SelectionCleared);
		}

		if (track.length === 0) {
			this.deleteTrackCommand = new DeleteTrackCommand(this.trackIdx);
			this.deleteTrackCommand.execute(context);
			this.trackWasDeleted = true;
		}

		context.emitEvent(EditEvent.ClipDeleted, {
			trackIndex: this.trackIdx,
			clipIndex: this.clipIdx
		});
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("DeleteClipCommand.undo: context is required");
		if (!this.deletedClip) return;

		// Restore deleted track first if it was deleted
		if (this.trackWasDeleted && this.deleteTrackCommand) {
			await this.deleteTrackCommand.undo(context);
			this.trackWasDeleted = false;
		}

		context.undeleteClip(this.trackIdx, this.deletedClip);

		const exportableClip = this.deletedClip.getExportableClip();
		context.documentAddClip(this.trackIdx, exportableClip, this.clipIdx);

		// Propagate timing changes after restoring the clip
		context.propagateTimingChanges(this.trackIdx, this.clipIdx);

		// Emit event so luma masking can rebuild after restore
		context.emitEvent(EditEvent.ClipRestored, {
			trackIndex: this.trackIdx,
			clipIndex: this.clipIdx
		});
	}

	dispose(): void {
		this.deletedClip = undefined;
		this.deleteTrackCommand = undefined;
	}
}
