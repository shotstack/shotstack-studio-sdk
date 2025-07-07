import type { Player } from "@canvas/players/player";

import type { EditCommand, CommandContext } from "./types";

export class ClearSelectionCommand implements EditCommand {
	public readonly name = "ClearSelection";
	private previousSelection: { player: Player; trackIndex: number; clipIndex: number } | null = null;

	public execute(context: CommandContext): void {
		// Find and store current selection for undo
		const currentSelection = context.getSelectedClip();
		if (currentSelection) {
			const indices = context.findClipIndices(currentSelection);
			if (indices) {
				this.previousSelection = {
					player: currentSelection,
					trackIndex: indices.trackIndex,
					clipIndex: indices.clipIndex
				};
			}
		}

		// Clear selection
		context.setSelectedClip(null);

		// Emit clear event
		context.emitEvent("selection:cleared", {});
	}

	public undo(context: CommandContext): void {
		if (this.previousSelection) {
			// Restore previous selection
			const player = context.getClipAt(this.previousSelection.trackIndex, this.previousSelection.clipIndex);
			if (player) {
				context.setSelectedClip(player);
				context.emitEvent("clip:selected", {
					clip: player.clipConfiguration,
					trackIndex: this.previousSelection.trackIndex,
					clipIndex: this.previousSelection.clipIndex
				});
			}
		}
	}
}
