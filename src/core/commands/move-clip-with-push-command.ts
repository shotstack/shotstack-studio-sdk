import type { Player } from "@canvas/players/player";

import type { EditCommand, CommandContext } from "./types";
import { MoveClipCommand } from "./move-clip-command";

/**
 * Command to move a clip while pushing other clips forward to make room.
 * Used when dropping a clip would overlap with existing clips and there's
 * no space available before them.
 */
export class MoveClipWithPushCommand implements EditCommand {
	name = "moveClipWithPush";
	private moveCommand: MoveClipCommand;
	private pushedClips: Array<{ player: Player; originalStart: number }> = [];

	constructor(
		private fromTrackIndex: number,
		private fromClipIndex: number,
		private toTrackIndex: number,
		private newStart: number,
		private pushOffset: number,
		private firstPushedClipIndex: number
	) {
		// The underlying move command handles the clip movement
		this.moveCommand = new MoveClipCommand(fromTrackIndex, fromClipIndex, toTrackIndex, newStart);
	}

	execute(context?: CommandContext): void {
		if (!context) return;

		const tracks = context.getTracks();
		const targetTrack = tracks[this.toTrackIndex];
		if (!targetTrack) return;

		// First, push all clips starting from firstPushedClipIndex forward
		this.pushedClips = [];
		for (let i = 0; i < targetTrack.length; i += 1) {
			const player = targetTrack[i];
			const clipStart = player.clipConfiguration.start;

			// Push clips that start at or after the first pushed clip
			// Also need to exclude the clip we're moving if it's on the same track
			const isMovingClip = this.fromTrackIndex === this.toTrackIndex && i === this.fromClipIndex;
			if (!isMovingClip && i >= this.firstPushedClipIndex) {
				// Store original position for undo
				this.pushedClips.push({ player, originalStart: clipStart });

				// Push forward
				const newClipStart = clipStart + this.pushOffset;
				player.clipConfiguration.start = newClipStart;
				player.setResolvedTiming({
					start: newClipStart * 1000,
					length: player.getLength()
				});
				player.setTimingIntent({
					start: newClipStart,
					length: player.getTimingIntent().length
				});
				player.reconfigureAfterRestore();
				player.draw();
			}
		}

		// Now execute the move command to place the dragged clip
		this.moveCommand.execute(context);

		// Propagate timing changes
		context.propagateTimingChanges(this.toTrackIndex, 0);
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) return;

		// First, undo the move
		await this.moveCommand.undo(context);

		// Then restore all pushed clips to their original positions
		for (const { player, originalStart } of this.pushedClips) {
			player.clipConfiguration.start = originalStart;
			player.setResolvedTiming({
				start: originalStart * 1000,
				length: player.getLength()
			});
			player.setTimingIntent({
				start: originalStart,
				length: player.getTimingIntent().length
			});
			player.reconfigureAfterRestore();
			player.draw();
		}

		// Propagate timing changes
		context.propagateTimingChanges(this.toTrackIndex, 0);
		context.updateDuration();
	}
}
