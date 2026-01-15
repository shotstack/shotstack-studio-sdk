import type { MergeFieldBinding, Player } from "@canvas/players/player";
import type { MergeFieldBinding as DocumentMergeFieldBinding } from "@core/edit-document";
import { EditEvent } from "@core/events/edit-events";
import { setNestedValue } from "@core/shared/utils";

import type { EditCommand, CommandContext } from "./types";

/**
 * Command to apply or remove a merge field on a clip property.
 * Handles both the player binding (for export) and resolved value (for rendering) atomically.
 *
 * This command supports undo/redo and ensures:
 * - Document stores the binding (source of truth for export)
 * - Player's clipConfiguration gets the resolved value (for rendering)
 * - Player's mergeFieldBindings also track the placeholder (parallel storage during migration)
 * - Merge field registry is updated appropriately
 */
export class SetMergeFieldCommand implements EditCommand {
	name = "setMergeField";

	private clipId: string | null = null;
	private storedPreviousValue: string;
	private storedNewValue: string;
	private trackIndex: number;
	private clipIndex: number;
	private storedPreviousBinding: MergeFieldBinding | undefined;

	constructor(
		private clip: Player,
		private propertyPath: string,
		private fieldName: string | null,
		private previousFieldName: string | null,
		previousValue: string,
		newValue: string,
		trackIndex: number,
		clipIndex: number
	) {
		this.storedPreviousValue = previousValue;
		this.storedNewValue = newValue;
		this.trackIndex = trackIndex;
		this.clipIndex = clipIndex;
		// Store clip ID for robust lookup (survives player recreation)
		this.clipId = clip.clipId;
	}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("SetMergeFieldCommand.execute: context is required");

		const mergeFields = context.getMergeFields();

		// Save previous binding for undo (from document first, fallback to player)
		if (this.clipId) {
			const docBinding = context.getClipBinding(this.clipId, this.propertyPath);
			this.storedPreviousBinding = docBinding ?? this.clip.getMergeFieldBinding(this.propertyPath);
		} else {
			this.storedPreviousBinding = this.clip.getMergeFieldBinding(this.propertyPath);
		}

		// 1. Update player's clipConfiguration with resolved value
		setNestedValue(this.clip.clipConfiguration, this.propertyPath, this.storedNewValue);

		// 2. Update bindings (document = source of truth, player = parallel for compatibility)
		if (this.fieldName) {
			const binding: DocumentMergeFieldBinding = {
				placeholder: mergeFields.createTemplate(this.fieldName),
				resolvedValue: this.storedNewValue
			};
			// Document binding (source of truth)
			if (this.clipId) {
				context.setClipBinding(this.clipId, this.propertyPath, binding);
			}
			// Player binding (parallel storage during migration)
			this.clip.setMergeFieldBinding(this.propertyPath, binding);
		} else {
			// Removing merge field - remove from both
			if (this.clipId) {
				context.removeClipBinding(this.clipId, this.propertyPath);
			}
			this.clip.removeMergeFieldBinding(this.propertyPath);
		}

		// 3. Register/update merge field if applying (silent to prevent reload)
		if (this.fieldName) {
			mergeFields.register({ name: this.fieldName, defaultValue: this.storedNewValue }, { silent: true });
		} else if (this.previousFieldName) {
			// Removing merge field - remove from registry
			mergeFields.remove(this.previousFieldName, { silent: true });
		}

		// 4. Reconfigure player and reload asset if needed
		const isSrcChange = this.propertyPath === "asset.src" || this.propertyPath.endsWith(".src");
		if (isSrcChange) {
			await this.clip.reloadAsset();
		}
		this.clip.reconfigureAfterRestore();
		this.clip.draw();

		// 5. Sync to document (source of truth)
		// Merge field properties are typically on the asset, so sync the full asset
		context.documentUpdateClip(this.trackIndex, this.clipIndex, {
			asset: this.clip.clipConfiguration.asset
		});

		// 6. Emit event
		context.emitEvent(EditEvent.MergeFieldApplied, {
			propertyPath: this.propertyPath,
			fieldName: this.fieldName ?? "",
			trackIndex: this.trackIndex,
			clipIndex: this.clipIndex
		});
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) throw new Error("SetMergeFieldCommand.undo: context is required");

		const mergeFields = context.getMergeFields();

		// 1. Restore player's clipConfiguration with previous value
		setNestedValue(this.clip.clipConfiguration, this.propertyPath, this.storedPreviousValue);

		// 2. Restore previous binding (to both document and player)
		if (this.storedPreviousBinding) {
			// Document binding (source of truth)
			if (this.clipId) {
				context.setClipBinding(this.clipId, this.propertyPath, this.storedPreviousBinding);
			}
			// Player binding (parallel storage during migration)
			this.clip.setMergeFieldBinding(this.propertyPath, this.storedPreviousBinding);
		} else {
			// No previous binding - remove from both
			if (this.clipId) {
				context.removeClipBinding(this.clipId, this.propertyPath);
			}
			this.clip.removeMergeFieldBinding(this.propertyPath);
		}

		// 3. Re-register previous field or update current (silent to prevent reload)
		if (this.previousFieldName) {
			mergeFields.register({ name: this.previousFieldName, defaultValue: this.storedPreviousValue }, { silent: true });
		}
		// If we applied a new field and are undoing, we could remove it
		// But we keep it for now to allow redo

		// 4. Reconfigure player and reload asset if needed
		const isSrcChange = this.propertyPath === "asset.src" || this.propertyPath.endsWith(".src");
		if (isSrcChange) {
			await this.clip.reloadAsset();
		}
		this.clip.reconfigureAfterRestore();
		this.clip.draw();

		// 5. Sync restored value to document (source of truth)
		context.documentUpdateClip(this.trackIndex, this.clipIndex, {
			asset: this.clip.clipConfiguration.asset
		});

		// 6. Emit event
		context.emitEvent(EditEvent.MergeFieldRemoved, {
			propertyPath: this.propertyPath,
			fieldName: this.previousFieldName,
			trackIndex: this.trackIndex,
			clipIndex: this.clipIndex
		});
	}
}
