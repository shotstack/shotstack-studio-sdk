import type { MergeFieldBinding } from "@core/edit-document";
import { EditEvent } from "@core/events/edit-events";
import { stripInternalProperties } from "@core/shared/clip-utils";
import { getNestedValue } from "@core/shared/utils";
import type { Clip, ResolvedClip } from "@schemas";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

type ClipType = ResolvedClip;

export interface SetUpdatedClipOptions {
	trackIndex?: number;
	clipIndex?: number;
}

/**
 * Command to update a clip's full configuration.
 */
export class SetUpdatedClipCommand implements EditCommand {
	readonly name = "setUpdatedClip";

	private clipId: string | null = null;
	private storedInitialConfig: ClipType | null = null;
	private storedFinalConfig: ClipType | null = null;
	private storedInitialBindings: Map<string, MergeFieldBinding> = new Map();
	private previousDocClip: Clip | null = null;
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

	async execute(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("SetUpdatedClipCommand.execute: context is required");

		const doc = context.getDocument();
		if (!doc) throw new Error("SetUpdatedClipCommand.execute: document is required");

		// Get player to determine indices if not provided
		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player) {
			return CommandNoop(`Invalid clip at ${this.trackIndex}/${this.clipIndex}`);
		}

		// Store for undo (only on first execute - don't overwrite on redo)
		this.clipId = player.clipId;
		if (!this.storedInitialConfig) {
			this.storedInitialConfig = this.initialClipConfig ? structuredClone(this.initialClipConfig) : structuredClone(player.clipConfiguration);
		}
		if (!this.storedFinalConfig) {
			this.storedFinalConfig = this.finalClipConfig ? structuredClone(this.finalClipConfig) : structuredClone(player.clipConfiguration);
		}

		// Capture document clip BEFORE mutation (source of truth for SDK events)
		const docClip = context.getDocumentClip(
			this.trackIndex >= 0 ? this.trackIndex : player.layer - 1,
			this.clipIndex >= 0 ? this.clipIndex : (context.getTracks()[player.layer - 1]?.indexOf(player) ?? -1)
		);
		this.previousDocClip = docClip ? structuredClone(docClip) : null;

		// Save bindings before modification (for undo) - read from document (source of truth)
		const docBindings = this.clipId ? context.getClipBindings(this.clipId) : undefined;
		this.storedInitialBindings = docBindings ? new Map(docBindings) : new Map();

		// Use provided indices or calculate from player
		const trackIndex = this.trackIndex >= 0 ? this.trackIndex : player.layer - 1;
		const clipIndex = this.clipIndex >= 0 ? this.clipIndex : (context.getTracks()[trackIndex]?.indexOf(player) ?? -1);

		// Update document with full configuration (all clip properties, not just timing/asset)
		// Use stored config if available, otherwise fallback to constructor params (handles redo for canvas drags)
		const configToApply = this.storedFinalConfig ?? this.finalClipConfig;
		if (configToApply) {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars -- id is internal, don't update it
			const { id: unusedId, ...clipUpdates } = configToApply as ResolvedClip & { id?: string };
			doc.updateClip(trackIndex, clipIndex, clipUpdates);
		}

		// Reconciler handles player updates
		context.resolve();

		// Detect broken bindings - if value changed from resolvedValue, remove the binding
		const resolvedPlayer = context.getClipAt(trackIndex, clipIndex);
		for (const [path, { resolvedValue }] of this.storedInitialBindings) {
			const currentValue = resolvedPlayer ? getNestedValue(resolvedPlayer.clipConfiguration, path) : undefined;
			if (currentValue !== resolvedValue && this.clipId) {
				context.removeClipBinding(this.clipId, path);
			}
		}

		// Check if asset src changed (fallback to constructor params for redo case)
		const initialConfig = this.storedInitialConfig ?? this.initialClipConfig;
		const finalConfig = this.storedFinalConfig ?? this.finalClipConfig;
		const previousAsset = initialConfig?.asset as { src?: string } | undefined;
		const currentAsset = finalConfig?.asset as { src?: string } | undefined;

		if (previousAsset?.src !== currentAsset?.src) {
			// Asset changed - if clip has "auto" length, re-resolve it
			const currentPlayer = context.getClipAt(trackIndex, clipIndex);
			if (currentPlayer) {
				const intent = currentPlayer.getTimingIntent();
				if (intent.length === "auto") {
					await context.resolveClipAutoLength(currentPlayer);
				}
			}
		}

		// Get document clip AFTER mutation (source of truth for SDK events)
		const currentDocClip = context.getDocumentClip(trackIndex, clipIndex);
		if (!this.previousDocClip || !currentDocClip)
			throw new Error(`SetUpdatedClipCommand: document clip not found after mutation at ${trackIndex}/${clipIndex}`);

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: stripInternalProperties(this.previousDocClip), trackIndex, clipIndex },
			current: { clip: stripInternalProperties(currentDocClip), trackIndex, clipIndex }
		});

		return CommandSuccess();
	}

	async undo(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("SetUpdatedClipCommand.undo: context is required");

		// Use stored config if execute() was called, otherwise use constructor params
		// This handles commands added to history without execution (e.g., canvas drags via commitClipUpdate)
		const configToRestore = this.storedInitialConfig ?? this.initialClipConfig;
		if (!configToRestore) return CommandNoop("No stored initial config");

		const doc = context.getDocument();
		if (!doc) throw new Error("SetUpdatedClipCommand.undo: document is required");

		// Get player by ID or indices
		const player = this.clipId ? context.getPlayerByClipId(this.clipId) : context.getClipAt(this.trackIndex, this.clipIndex);

		if (!player) return CommandNoop(`Clip not found for undo`);

		// Use provided indices or calculate from player
		const trackIndex = this.trackIndex >= 0 ? this.trackIndex : player.layer - 1;
		const clipIndex = this.clipIndex >= 0 ? this.clipIndex : (context.getTracks()[trackIndex]?.indexOf(player) ?? -1);

		// Capture document clip BEFORE undo mutation (source of truth for SDK events)
		const currentDocClip = structuredClone(context.getDocumentClip(trackIndex, clipIndex));

		// Update document with full initial configuration (all clip properties)
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- id is internal, don't update it
		const { id: unusedId, ...clipUpdates } = configToRestore as ResolvedClip & { id?: string };
		doc.updateClip(trackIndex, clipIndex, clipUpdates);

		// Reconciler handles player updates
		context.resolve();

		// Restore saved bindings (document = source of truth)
		if (this.clipId) {
			const docBindings = new Map(this.storedInitialBindings);
			if (docBindings.size > 0) {
				const document = context.getDocument();
				document?.setClipBindingsForClip(this.clipId, docBindings);
			} else {
				context.getDocument()?.clearClipBindings(this.clipId);
			}
		}

		// Check if asset src changed (reverse direction)
		// Use stored config if execute() was called, otherwise use constructor params
		const configApplied = this.storedFinalConfig ?? this.finalClipConfig;
		const previousAsset = configApplied?.asset as { src?: string } | undefined;
		const currentAsset = configToRestore?.asset as { src?: string } | undefined;

		if (previousAsset?.src !== currentAsset?.src) {
			// Asset changed - if clip has "auto" length, re-resolve it
			const currentPlayer = context.getClipAt(trackIndex, clipIndex);
			if (currentPlayer) {
				const intent = currentPlayer.getTimingIntent();
				if (intent.length === "auto") {
					await context.resolveClipAutoLength(currentPlayer);
				}
			}
		}

		// Get document clip AFTER undo mutation (restored state)
		const restoredDocClip = context.getDocumentClip(trackIndex, clipIndex);
		if (!currentDocClip || !restoredDocClip) {
			throw new Error(`SetUpdatedClipCommand: document clip not found after undo at ${trackIndex}/${clipIndex}`);
		}

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: stripInternalProperties(currentDocClip), trackIndex, clipIndex },
			current: { clip: stripInternalProperties(restoredDocClip), trackIndex, clipIndex }
		});

		return CommandSuccess();
	}

	dispose(): void {
		this.clipId = null;
		this.storedInitialConfig = null;
		this.storedFinalConfig = null;
		this.storedInitialBindings.clear();
		this.previousDocClip = null;
	}
}
