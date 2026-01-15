import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@schemas";

import type { EditCommand, CommandContext } from "./types";

type ClipType = ResolvedClip;

/**
 * Atomic command that adds a new clip to a track.
 *
 * Document-only: This command only mutates the document.
 * The PlayerReconciler handles Player creation via the Resolved event.
 */
export class AddClipCommand implements EditCommand {
	name = "addClip";
	private addedClipId?: string;

	constructor(
		private trackIdx: number,
		private clip: ClipType
	) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("AddClipCommand.execute: context is required");

		// Document mutation only - reconciler creates the Player
		const addedClip = context.documentAddClip(this.trackIdx, this.clip);

		// Store clip ID for undo
		this.addedClipId = (addedClip as { id?: string }).id;

		// Resolve triggers reconciler → creates Player (must happen before duration calc)
		context.resolve();

		context.updateDuration();

		// Get clip index from document for event
		const docTrack = context.getDocumentTrack(this.trackIdx);
		const clips = docTrack?.clips as Array<{ id?: string }> | undefined;
		const clipIndex = clips?.findIndex(c => c.id === this.addedClipId) ?? -1;

		context.emitEvent(EditEvent.ClipAdded, {
			trackIndex: this.trackIdx,
			clipIndex
		});
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("AddClipCommand.undo: context is required");
		if (!this.addedClipId) return;

		// Find clip index by ID (position may have changed)
		const docTrack = context.getDocumentTrack(this.trackIdx);
		const clips = docTrack?.clips as Array<{ id?: string }> | undefined;
		const clipIndex = clips?.findIndex(c => c.id === this.addedClipId) ?? -1;

		if (clipIndex === -1) {
			console.warn(`AddClipCommand.undo: clip ${this.addedClipId} not found in track ${this.trackIdx}`);
			return;
		}

		// Document mutation only - reconciler disposes the Player
		context.documentRemoveClip(this.trackIdx, clipIndex);

		// Resolve triggers reconciler → disposes orphaned Player (before duration calc)
		context.resolve();

		context.updateDuration();

		context.emitEvent(EditEvent.ClipDeleted, {
			trackIndex: this.trackIdx,
			clipIndex
		});
	}

	dispose(): void {
		this.addedClipId = undefined;
	}
}
