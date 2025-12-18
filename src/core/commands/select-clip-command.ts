import { EditEvent } from "@core/events/edit-events";

import type { EditCommand, CommandContext } from "./types";

export class SelectClipCommand implements EditCommand {
	public readonly name = "SelectClip";
	private previousSelection: { trackIndex: number; clipIndex: number } | null = null;

	constructor(
		private trackIndex: number,
		private clipIndex: number
	) {}

	public execute(context: CommandContext): void {
		// Store previous selection for undo
		const currentSelection = context.getSelectedClip();
		if (currentSelection) {
			const indices = context.findClipIndices(currentSelection);
			if (indices) {
				this.previousSelection = indices;
			}
		}

		// Get the clip and select it
		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (player) {
			// Set the selected clip
			context.setSelectedClip(player);

			// Emit selection event
			context.emitEvent(EditEvent.ClipSelected, {
				clip: player.clipConfiguration,
				trackIndex: this.trackIndex,
				clipIndex: this.clipIndex
			});
		}
	}

	public undo(context: CommandContext): void {
		// Clear current selection
		context.setSelectedClip(null);

		// Restore previous selection if any
		if (this.previousSelection) {
			const player = context.getClipAt(this.previousSelection.trackIndex, this.previousSelection.clipIndex);
			if (player) {
				context.setSelectedClip(player);
				context.emitEvent(EditEvent.ClipSelected, {
					clip: player.clipConfiguration,
					trackIndex: this.previousSelection.trackIndex,
					clipIndex: this.previousSelection.clipIndex
				});
			}
		} else {
			context.emitEvent(EditEvent.SelectionCleared);
		}
	}
}
