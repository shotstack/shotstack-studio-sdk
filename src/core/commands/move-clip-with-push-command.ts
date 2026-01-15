import { type Seconds, sec } from "@core/timing/types";

import { MoveClipCommand } from "./move-clip-command";
import type { EditCommand, CommandContext } from "./types";

/**
 * Document-only command to move a clip while pushing other clips forward to make room.
 * Calculates which clips to push based on the move destination.
 *
 * Flow: Document mutations → MoveClipCommand → resolve() → Reconciler updates all Players
 */
export class MoveClipWithPushCommand implements EditCommand {
	name = "moveClipWithPush";
	private moveCommand: MoveClipCommand;
	private pushedClipIds: Array<{ clipId: string; originalStart: Seconds }> = [];

	constructor(
		private fromTrackIndex: number,
		private fromClipIndex: number,
		private toTrackIndex: number,
		private newStart: Seconds,
		private pushOffset: Seconds
	) {
		this.moveCommand = new MoveClipCommand(fromTrackIndex, fromClipIndex, toTrackIndex, newStart);
	}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("MoveClipWithPushCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("MoveClipWithPushCommand.execute: document is required");

		// Get the clip being moved to know its length
		const movingPlayer = context.getClipAt(this.fromTrackIndex, this.fromClipIndex);
		if (!movingPlayer) return;

		const movingLength = movingPlayer.clipConfiguration.length as Seconds;
		const newEnd = this.newStart + movingLength;

		// Get clips in target track from document
		const targetClips = doc.getClipsInTrack(this.toTrackIndex);
		const movingClipId = movingPlayer.clipId;

		// Find and record clips that would overlap with the new position
		this.pushedClipIds = [];
		for (const clipInfo of targetClips) {
			const clip = clipInfo as { id?: string; start: number | "auto"; length: number | "auto" | "end" };

			// Skip the clip we're moving
			if (clip.id && clip.id !== movingClipId) {
				const clipStart = typeof clip.start === "number" ? sec(clip.start) : sec(0);

				// Push clips that start within our new range
				if (clipStart >= this.newStart && clipStart < newEnd) {
					this.pushedClipIds.push({ clipId: clip.id, originalStart: clipStart });

					// Update in document
					const clipIndex = targetClips.indexOf(clipInfo);
					doc.updateClip(this.toTrackIndex, clipIndex, {
						start: sec(clipStart + this.pushOffset)
					});
				}
			}
		}

		// Execute the move (which will call resolve())
		this.moveCommand.execute(context);

		// Propagate timing changes for pushed clips
		context.propagateTimingChanges(this.toTrackIndex, 0);
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("MoveClipWithPushCommand.undo: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("MoveClipWithPushCommand.undo: document is required");

		// Undo the move first
		await this.moveCommand.undo(context);

		// Restore pushed clips to original positions in document
		for (const { clipId, originalStart } of this.pushedClipIds) {
			const clipInfo = doc.getClipById(clipId);
			if (clipInfo) {
				doc.updateClip(clipInfo.trackIndex, clipInfo.clipIndex, { start: originalStart });
			}
		}

		// Reconciler handles player updates
		context.resolve();

		context.propagateTimingChanges(this.toTrackIndex, 0);
		context.updateDuration();
	}
}
