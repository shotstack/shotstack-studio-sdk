import type { Player } from "@canvas/players/player";

import type { EditCommand, CommandContext } from "./types";
import { MoveClipCommand } from "./move-clip-command";

/**
 * Command to move a clip while pushing other clips forward to make room.
 * Self-contained: calculates which clips to push based on the move destination.
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
		private pushOffset: number
	) {
		this.moveCommand = new MoveClipCommand(fromTrackIndex, fromClipIndex, toTrackIndex, newStart);
	}

	execute(context?: CommandContext): void {
		if (!context) return;

		const tracks = context.getTracks();
		const targetTrack = tracks[this.toTrackIndex];
		const sourceTrack = tracks[this.fromTrackIndex];
		if (!targetTrack || !sourceTrack) return;

		// Get the clip being moved to know its length
		const movingClip = sourceTrack[this.fromClipIndex];
		if (!movingClip) return;

		const newEnd = this.newStart + movingClip.clipConfiguration.length;

		// Find and push clips that would overlap with the new position
		this.pushedClips = [];
		for (const player of targetTrack) {
			// Skip the clip we're moving
			if (player === movingClip) continue;

			const clipStart = player.clipConfiguration.start;
			// Push clips that start before our new end position and would overlap
			if (clipStart >= this.newStart && clipStart < newEnd) {
				this.pushedClips.push({ player, originalStart: clipStart });
				this.pushClip(player, clipStart + this.pushOffset);
			}
		}

		// Execute the move
		this.moveCommand.execute(context);
		context.propagateTimingChanges(this.toTrackIndex, 0);
	}

	private pushClip(player: Player, newStart: number): void {
		player.clipConfiguration.start = newStart;
		player.setResolvedTiming({ start: newStart * 1000, length: player.getLength() });
		player.setTimingIntent({ start: newStart, length: player.getTimingIntent().length });
		player.reconfigureAfterRestore();
		player.draw();
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) return;

		await this.moveCommand.undo(context);

		// Restore pushed clips
		for (const { player, originalStart } of this.pushedClips) {
			this.pushClip(player, originalStart);
		}

		context.propagateTimingChanges(this.toTrackIndex, 0);
		context.updateDuration();
	}
}
