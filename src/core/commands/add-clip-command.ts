import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@schemas";

import { type AliasReferenceMap, convertAliasReferencesToValues, restoreAliasReferences } from "./alias-reference-utils";
import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

type ClipType = ResolvedClip;

/**
 * Atomic command that adds a new clip to a track.
 */
export class AddClipCommand implements EditCommand {
	readonly name = "addClip";
	private addedClipId?: string;
	private convertedReferences?: AliasReferenceMap;

	constructor(
		private trackIdx: number,
		private clip: ClipType
	) {}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("AddClipCommand.execute: context is required");

		const document = context.getDocument();
		if (!document) throw new Error("AddClipCommand.execute: no document");

		// Document mutation only - reconciler creates the Player
		const addedClip = context.documentAddClip(this.trackIdx, this.clip);

		// Store clip ID for undo
		this.addedClipId = (addedClip as { id?: string }).id;

		// Restore alias references if this is a redo (after previous undo converted them)
		if (this.convertedReferences && this.convertedReferences.size > 0) {
			restoreAliasReferences(document, this.convertedReferences);
		}

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

		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!context) throw new Error("AddClipCommand.undo: context is required");
		if (!this.addedClipId) return CommandNoop("No clip ID stored");

		const document = context.getDocument();
		if (!document) throw new Error("AddClipCommand.undo: no document");

		// Find clip index by ID (position may have changed)
		const docTrack = context.getDocumentTrack(this.trackIdx);
		const clips = docTrack?.clips as Array<{ id?: string; alias?: string }> | undefined;
		const clipIndex = clips?.findIndex(c => c.id === this.addedClipId) ?? -1;

		if (clipIndex === -1) {
			return CommandNoop(`Clip ${this.addedClipId} not found in track ${this.trackIdx}`);
		}

		// Convert alias references to resolved values before deletion
		const clipAlias = clips?.[clipIndex]?.alias;
		if (clipAlias) {
			const skipIndices = new Set([`${this.trackIdx}:${clipIndex}`]);
			this.convertedReferences = convertAliasReferencesToValues(document, context.getEditState(), clipAlias, skipIndices);
		}

		const selectedClip = context.getSelectedClip();
		if (selectedClip && selectedClip.clipId === this.addedClipId) {
			context.setSelectedClip(null);
			context.emitEvent(EditEvent.SelectionCleared);
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

		return CommandSuccess();
	}

	dispose(): void {
		this.addedClipId = undefined;
		this.convertedReferences = undefined;
	}
}
