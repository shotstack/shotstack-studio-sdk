import type { MergeFieldBinding } from "@core/edit-document";
import { EditEvent } from "@core/events/edit-events";
import { deepMerge } from "@core/shared/utils";
import type { ResolvedClip } from "@schemas";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess } from "./types";

/**
 * Command to apply or remove a merge field on a clip property.
 */
export class SetMergeFieldCommand implements EditCommand {
	readonly name = "setMergeField";

	private storedPreviousValue: string;
	private storedNewValue: string;
	private storedPreviousBinding: MergeFieldBinding | undefined;

	constructor(
		private clipId: string,
		private propertyPath: string,
		private fieldName: string | null,
		private previousFieldName: string | null,
		previousValue: string,
		newValue: string,
		private trackIndex: number,
		private clipIndex: number
	) {
		this.storedPreviousValue = previousValue;
		this.storedNewValue = newValue;
	}

	/**
	 * Build a partial asset update from a property path and value.
	 * Converts "asset.src" → { src: value }
	 * Converts "asset.font.family" → { font: { family: value } }
	 */
	private buildPartialAssetUpdate(propertyPath: string, value: string): Record<string, unknown> {
		if (!propertyPath.startsWith("asset.")) {
			return {};
		}

		const assetProperty = propertyPath.slice(6); // Remove "asset." prefix
		const parts = assetProperty.split(".");

		if (parts.length === 1) {
			return { [parts[0]]: value };
		}

		// Build nested object: { font: { family: value } }
		let result: Record<string, unknown> = { [parts[parts.length - 1]]: value };
		for (let i = parts.length - 2; i >= 0; i -= 1) {
			result = { [parts[i]]: result };
		}
		return result;
	}

	/**
	 * Get the full merged asset with the update applied.
	 * Uses deep merge to preserve all existing asset properties.
	 */
	private getMergedAsset(context: CommandContext, partialUpdate: Record<string, unknown>): ResolvedClip["asset"] {
		const document = context.getDocument();
		const currentClip = document?.getClip(this.trackIndex, this.clipIndex);
		const currentAsset = currentClip?.asset ?? {};

		// Deep merge to preserve type, width, height, etc.
		return deepMerge(currentAsset, partialUpdate) as ResolvedClip["asset"];
	}

	async execute(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("SetMergeFieldCommand.execute: context is required");

		const mergeFields = context.getMergeFields();

		// Save previous binding for undo (from document - source of truth)
		this.storedPreviousBinding = context.getClipBinding(this.clipId, this.propertyPath);

		// 1. Update bindings (document = source of truth)
		if (this.fieldName) {
			const binding: MergeFieldBinding = {
				placeholder: mergeFields.createTemplate(this.fieldName),
				resolvedValue: this.storedNewValue
			};
			context.setClipBinding(this.clipId, this.propertyPath, binding);
		} else {
			// Removing merge field
			context.removeClipBinding(this.clipId, this.propertyPath);
		}

		// 2. Register/update merge field (silent to prevent duplicate reload)
		if (this.fieldName) {
			mergeFields.register({ name: this.fieldName, defaultValue: this.storedNewValue }, { silent: true });
		} else if (this.previousFieldName) {
			mergeFields.remove(this.previousFieldName, { silent: true });
		}

		// 3. Update document asset with resolved value (deep merge to preserve type, etc.)
		const partialUpdate = this.buildPartialAssetUpdate(this.propertyPath, this.storedNewValue);
		const mergedAsset = this.getMergedAsset(context, partialUpdate);
		context.documentUpdateClip(this.trackIndex, this.clipIndex, { asset: mergedAsset });

		// 4. Resolve → Reconciler handles player updates (reloadAsset, reconfigure, draw)
		context.resolve();

		// 5. Emit event
		context.emitEvent(EditEvent.MergeFieldApplied, {
			propertyPath: this.propertyPath,
			fieldName: this.fieldName ?? "",
			trackIndex: this.trackIndex,
			clipIndex: this.clipIndex
		});

		return CommandSuccess();
	}

	async undo(context?: CommandContext): Promise<CommandResult> {
		if (!context) throw new Error("SetMergeFieldCommand.undo: context is required");

		const mergeFields = context.getMergeFields();

		// 1. Restore previous binding (document = source of truth)
		if (this.storedPreviousBinding) {
			context.setClipBinding(this.clipId, this.propertyPath, this.storedPreviousBinding);
		} else {
			context.removeClipBinding(this.clipId, this.propertyPath);
		}

		// 2. Re-register previous field (silent)
		if (this.previousFieldName) {
			mergeFields.register({ name: this.previousFieldName, defaultValue: this.storedPreviousValue }, { silent: true });
		}

		// 3. Restore document asset with previous value (deep merge to preserve type, etc.)
		const partialUpdate = this.buildPartialAssetUpdate(this.propertyPath, this.storedPreviousValue);
		const mergedAsset = this.getMergedAsset(context, partialUpdate);
		context.documentUpdateClip(this.trackIndex, this.clipIndex, { asset: mergedAsset });

		// 4. Resolve → Reconciler handles player updates
		context.resolve();

		// 5. Emit event
		context.emitEvent(EditEvent.MergeFieldRemoved, {
			propertyPath: this.propertyPath,
			fieldName: this.previousFieldName,
			trackIndex: this.trackIndex,
			clipIndex: this.clipIndex
		});

		return CommandSuccess();
	}

	dispose(): void {
		this.storedPreviousBinding = undefined;
	}
}
