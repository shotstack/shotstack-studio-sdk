import type { MergeFieldBinding } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import { getNestedValue } from "@core/shared/utils";
import type { ResolvedClip } from "@schemas";

import type { EditCommand, CommandContext } from "./types";

type ClipType = ResolvedClip;

export interface SetUpdatedClipOptions {
	trackIndex?: number;
	clipIndex?: number;
}

/**
 * Command to update a clip's full configuration.
 *
 * Flow: Document mutation → resolve() → Reconciler updates Player
 *
 * Note: Merge field binding management is still on players until Phase 4 (document-based bindings).
 */
export class SetUpdatedClipCommand implements EditCommand {
	name = "setUpdatedClip";

	private clipId: string | null = null;
	private storedInitialConfig: ClipType | null = null;
	private storedFinalConfig: ClipType | null = null;
	private storedInitialBindings: Map<string, MergeFieldBinding> = new Map();
	private trackIndex: number;
	private clipIndex: number;

	constructor(
		private initialClipConfig: ClipType | null,
		private finalClipConfig: ClipType | null,
		options?: SetUpdatedClipOptions
	) {
		this.trackIndex = options?.trackIndex ?? -1;
		this.clipIndex = options?.clipIndex ?? -1;
	}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("SetUpdatedClipCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("SetUpdatedClipCommand.execute: document is required");

		// Get player to determine indices if not provided
		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) {
			console.warn(`Invalid clip at ${this.trackIndex}/${this.clipIndex}`);
			return;
		}

		// Store for undo
		this.clipId = player.clipId;
		this.storedInitialConfig = this.initialClipConfig ? structuredClone(this.initialClipConfig) : structuredClone(player.clipConfiguration);
		this.storedFinalConfig = this.finalClipConfig ? structuredClone(this.finalClipConfig) : structuredClone(player.clipConfiguration);

		// Save bindings before modification (for undo) - binding management stays until Phase 4
		this.storedInitialBindings = new Map(player.getMergeFieldBindings());

		// Use provided indices or calculate from player
		const trackIndex = this.trackIndex >= 0 ? this.trackIndex : player.layer - 1;
		const clipIndex = this.clipIndex >= 0 ? this.clipIndex : context.getTracks()[trackIndex]?.indexOf(player) ?? -1;

		// Update document with full configuration (all clip properties, not just timing/asset)
		if (this.storedFinalConfig) {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars -- id is internal, don't update it
			const { id: unusedId, ...clipUpdates } = this.storedFinalConfig as ResolvedClip & { id?: string };
			doc.updateClip(trackIndex, clipIndex, clipUpdates);
		}

		// Reconciler handles player updates
		context.resolve();

		// Detect broken bindings - if value changed from resolvedValue, remove the binding
		// Note: This binding logic stays on players until Phase 4 (document-based bindings)
		for (const [path, { resolvedValue }] of this.storedInitialBindings) {
			const currentValue = getNestedValue(player.clipConfiguration, path);
			if (currentValue !== resolvedValue) {
				player.removeMergeFieldBinding(path);
			}
		}

		// Check if asset src changed
		const previousAsset = this.storedInitialConfig?.asset as { src?: string } | undefined;
		const currentAsset = this.storedFinalConfig?.asset as { src?: string } | undefined;

		if (previousAsset?.src !== currentAsset?.src) {
			// Asset changed - if clip has "auto" length, re-resolve it
			const intent = player.getTimingIntent();
			if (intent.length === "auto") {
				await context.resolveClipAutoLength(player);
			}
		}

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: this.storedInitialConfig, trackIndex, clipIndex },
			current: { clip: this.storedFinalConfig ?? player.clipConfiguration, trackIndex, clipIndex }
		});
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("SetUpdatedClipCommand.undo: context is required");
		if (!this.storedInitialConfig) return;

		const doc = context.getDocument();
		if (!doc) throw new Error("SetUpdatedClipCommand.undo: document is required");

		// Get player by ID or indices
		const player = this.clipId
			? context.getPlayerByClipId(this.clipId)
			: context.getClipAt(this.trackIndex, this.clipIndex);

		if (!player) return;

		const currentConfig = structuredClone(player.clipConfiguration);

		// Use provided indices or calculate from player
		const trackIndex = this.trackIndex >= 0 ? this.trackIndex : player.layer - 1;
		const clipIndex = this.clipIndex >= 0 ? this.clipIndex : context.getTracks()[trackIndex]?.indexOf(player) ?? -1;

		// Update document with full initial configuration (all clip properties)
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- id is internal, don't update it
		const { id: unusedId, ...clipUpdates } = this.storedInitialConfig as ResolvedClip & { id?: string };
		doc.updateClip(trackIndex, clipIndex, clipUpdates);

		// Reconciler handles player updates
		context.resolve();

		// Restore saved bindings to both document and player (parallel storage)
		if (this.clipId) {
			// Document binding (source of truth)
			const docBindings = new Map(this.storedInitialBindings);
			if (docBindings.size > 0) {
				const document = context.getDocument();
				document?.setClipBindingsForClip(this.clipId, docBindings);
			} else {
				context.getDocument()?.clearClipBindings(this.clipId);
			}
		}
		// Player binding (parallel storage during migration)
		player.setInitialBindings(this.storedInitialBindings);

		// Check if asset src changed (reverse direction)
		const previousAsset = this.storedFinalConfig?.asset as { src?: string } | undefined;
		const currentAsset = this.storedInitialConfig?.asset as { src?: string } | undefined;

		if (previousAsset?.src !== currentAsset?.src) {
			// Asset changed - if clip has "auto" length, re-resolve it
			const intent = player.getTimingIntent();
			if (intent.length === "auto") {
				await context.resolveClipAutoLength(player);
			}
		}

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: currentConfig, trackIndex, clipIndex },
			current: { clip: this.storedInitialConfig, trackIndex, clipIndex }
		});
	}
}
