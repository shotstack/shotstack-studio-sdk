import type { Player } from "@canvas/players/player";

import type { EditCommand, CommandContext } from "./types";

export class UpdateClipPositionCommand implements EditCommand {
	name = "updateClipPosition";
	private originalStart?: number;
	private player?: Player;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private newStart: number
	) {}

	execute(context?: CommandContext): void {
		if (!context) return;

		// Get the player by indices
		const tracks = context.getTracks();
		if (this.trackIndex < 0 || this.trackIndex >= tracks.length) {
			console.warn(`Invalid track index: ${this.trackIndex}`);
			return;
		}

		const track = tracks[this.trackIndex];
		if (this.clipIndex < 0 || this.clipIndex >= track.length) {
			console.warn(`Invalid clip index: ${this.clipIndex}`);
			return;
		}

		this.player = track[this.clipIndex];
		this.originalStart = this.player.clipConfiguration.start;

		// Update the clip position
		this.player.clipConfiguration.start = this.newStart;
		this.player.reconfigureAfterRestore();
		this.player.draw();

		// Update total duration and emit event
		context.updateDuration();
		context.emitEvent("clip:updated", {
			previous: { clip: { ...this.player.clipConfiguration, start: this.originalStart }, trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: this.player.clipConfiguration, trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});
	}

	undo(context?: CommandContext): void {
		if (!context || !this.player || this.originalStart === undefined) return;

		this.player.clipConfiguration.start = this.originalStart;
		this.player.reconfigureAfterRestore();
		this.player.draw();

		context.updateDuration();
		context.emitEvent("clip:updated", {
			previous: { clip: { ...this.player.clipConfiguration, start: this.newStart }, trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: this.player.clipConfiguration, trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});
	}
}
