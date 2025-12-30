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
		if (!context) return; // For backward compatibility
		const clips = context.getClips();
		const tracks = context.getTracks();
		const trackClips = clips.filter((c: Player) => c.layer === this.trackIdx + 1);
		this.deletedClip = trackClips[this.clipIdx];

		// Clear any error associated with this clip before deletion
		context.clearClipError(this.trackIdx, this.clipIdx);

		if (this.deletedClip) {
			context.queueDisposeClip(this.deletedClip);
			context.disposeClips();
			context.updateDuration();

			// Propagate timing changes to clips that were after the deleted clip
			// Use clipIdx - 1 because the clip at clipIdx no longer exists
			context.propagateTimingChanges(this.trackIdx, this.clipIdx - 1);

			// Check if track is now empty and delete it (same pattern as MoveClipCommand)
			// DeleteTrackCommand emits TrackRemoved
			const track = tracks[this.trackIdx];
			if (track && track.length === 0) {
				this.deleteTrackCommand = new DeleteTrackCommand(this.trackIdx);
				this.deleteTrackCommand.execute(context);
				this.trackWasDeleted = true;
			}

			// Emit event so luma masking and other listeners can update
			context.emitEvent(EditEvent.ClipDeleted, {
				trackIndex: this.trackIdx,
				clipIndex: this.clipIdx
			});

			// Clear selection if the deleted clip was selected
			const selectedClip = context.getSelectedClip();
			if (selectedClip === this.deletedClip) {
				context.setSelectedClip(null);
				context.emitEvent(EditEvent.SelectionCleared);
			}
		}
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context || !this.deletedClip) return;

		// Restore deleted track first if it was deleted
		if (this.trackWasDeleted && this.deleteTrackCommand) {
			await this.deleteTrackCommand.undo(context);
			this.trackWasDeleted = false;
		}

		context.undeleteClip(this.trackIdx, this.deletedClip);

		// Propagate timing changes after restoring the clip
		context.propagateTimingChanges(this.trackIdx, this.clipIdx);

		// Emit event so luma masking can rebuild after restore
		context.emitEvent(EditEvent.ClipRestored, {
			trackIndex: this.trackIdx,
			clipIndex: this.clipIdx
		});
	}
}
