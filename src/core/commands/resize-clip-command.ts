import { EditEvent } from "@core/events/edit-events";
import type { Seconds, TimingIntent } from "@core/timing/types";
import type { ResolvedClip } from "@schemas";

import type { EditCommand, CommandContext } from "./types";

/**
 * Document-only command to resize a clip's length.
 *
 * Flow: Document mutation → resolve() → Reconciler updates Player
 */
export class ResizeClipCommand implements EditCommand {
	name = "resizeClip";
	private originalIntent?: TimingIntent;
	private previousClipConfig?: ResolvedClip;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private newLength: Seconds
	) {}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("ResizeClipCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("ResizeClipCommand.execute: document is required");

		// Get current player's resolved config for undo/events
		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) {
			console.warn(`Invalid clip at ${this.trackIndex}/${this.clipIndex}`);
			return;
		}

		// Store for undo
		this.previousClipConfig = structuredClone(player.clipConfiguration);
		this.originalIntent = player.getTimingIntent();

		// Document-only mutation
		doc.updateClip(this.trackIndex, this.clipIndex, { length: this.newLength });

		// Reconciler handles player updates
		context.resolve();

		context.updateDuration();

		// Get updated config from player (now has resolved values)
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: this.previousClipConfig, trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: player.clipConfiguration, trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});

		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("ResizeClipCommand.undo: context is required");
		if (!this.originalIntent) throw new Error("ResizeClipCommand.undo: no original intent");

		const doc = context.getDocument();
		if (!doc) throw new Error("ResizeClipCommand.undo: document is required");

		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) throw new Error("ResizeClipCommand.undo: player not found");

		const currentConfig = structuredClone(player.clipConfiguration);

		// Document-only mutation - restore original length
		doc.updateClip(this.trackIndex, this.clipIndex, { length: this.originalIntent.length });

		// Reconciler handles player updates
		context.resolve();

		context.updateDuration();

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: currentConfig, trackIndex: this.trackIndex, clipIndex: this.clipIndex },
			current: { clip: player.clipConfiguration, trackIndex: this.trackIndex, clipIndex: this.clipIndex }
		});

		context.propagateTimingChanges(this.trackIndex, this.clipIndex);
	}
}
