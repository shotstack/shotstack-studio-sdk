import { executeTextToRichTextConversion } from "./commands/convert-text-to-rich-text-command";
import { SetMergeFieldCommand } from "./commands/set-merge-field-command";
import { Edit } from "./edit-session";
import type { MergeFieldService } from "./merge";
import { getNestedValue } from "./shared/utils";

/**
 * Extended Edit with Shotstack-specific capabilities.
 *
 * @internal This class is for Shotstack products only.
 * External SDK consumers should use the base `Edit` class.
 *
 * Features:
 * - Merge field management (template variables like {{ NAME }})
 * - Text-to-RichText asset conversion
 * - Future Shotstack-specific functionality
 *
 * @example
 * ```typescript
 * import { ShotstackEdit } from '@shotstack/studio-sdk/internal';
 *
 * const edit = new ShotstackEdit(template);
 * await edit.load();
 *
 * // Register merge fields
 * edit.mergeFields.register({ name: 'TITLE', defaultValue: 'Hello World' });
 *
 * // Convert legacy text assets
 * await edit.convertAllTextToRichText();
 * ```
 */
export class ShotstackEdit extends Edit {
	// ─── Merge Field API ───────────────────────────────────────────────────────

	/**
	 * Merge field service for managing dynamic content placeholders.
	 * Use this to register, update, and query merge fields in templates.
	 */
	public get mergeFields(): MergeFieldService {
		return this.mergeFieldService;
	}

	/**
	 * Apply a merge field to a clip property.
	 * The property value will be wrapped in {{ FIELD }} placeholder syntax.
	 *
	 * @param trackIndex - Track index of the clip
	 * @param clipIndex - Clip index within the track
	 * @param propertyPath - Dot-notation path to property (e.g., "asset.text", "asset.src")
	 * @param fieldName - Name of the merge field (e.g., "TITLE", "PRODUCT_IMAGE")
	 * @param value - The resolved value to apply
	 * @param originalValue - Optional: the original value before merge field (for undo)
	 */
	public applyMergeField(
		trackIndex: number,
		clipIndex: number,
		propertyPath: string,
		fieldName: string,
		value: string,
		originalValue?: string
	): void {
		const player = this.getPlayerClip(trackIndex, clipIndex);
		if (!player) return;

		// Get current value from player for undo
		const currentValue = getNestedValue(player.clipConfiguration, propertyPath);
		const previousValue = originalValue ?? (typeof currentValue === "string" ? currentValue : "");

		// Check if there's already a merge field on this property
		const templateClip = this.getTemplateClip(trackIndex, clipIndex);
		const templateValue = templateClip ? getNestedValue(templateClip, propertyPath) : null;
		const previousFieldName = typeof templateValue === "string" ? this.mergeFieldService.extractFieldName(templateValue) : null;

		const command = new SetMergeFieldCommand(player, propertyPath, fieldName, previousFieldName, previousValue, value, trackIndex, clipIndex);
		this.executeCommand(command);
	}

	/**
	 * Remove a merge field from a clip property, restoring the original value.
	 *
	 * @param trackIndex - Track index
	 * @param clipIndex - Clip index within the track
	 * @param propertyPath - Dot-notation path to property (e.g., "asset.src")
	 * @param restoreValue - The value to restore (original pre-merge-field value)
	 */
	public removeMergeField(trackIndex: number, clipIndex: number, propertyPath: string, restoreValue: string): void {
		const player = this.getPlayerClip(trackIndex, clipIndex);
		if (!player) return;

		// Get current merge field name
		const templateClip = this.getTemplateClip(trackIndex, clipIndex);
		const templateValue = templateClip ? getNestedValue(templateClip, propertyPath) : null;
		const currentFieldName = typeof templateValue === "string" ? this.mergeFieldService.extractFieldName(templateValue) : null;

		if (!currentFieldName) return; // No merge field to remove

		const command = new SetMergeFieldCommand(
			player,
			propertyPath,
			null, // Removing merge field
			currentFieldName,
			restoreValue,
			restoreValue, // New value is the restore value
			trackIndex,
			clipIndex
		);
		this.executeCommand(command);
	}

	/**
	 * Get the merge field name for a clip property, if any.
	 *
	 * @returns The field name if a merge field is applied, null otherwise
	 */
	public getMergeFieldForProperty(trackIndex: number, clipIndex: number, propertyPath: string): string | null {
		const templateClip = this.getTemplateClip(trackIndex, clipIndex);
		if (!templateClip) return null;

		const value = getNestedValue(templateClip, propertyPath);
		return typeof value === "string" ? this.mergeFieldService.extractFieldName(value) : null;
	}

	/**
	 * Update the value of a merge field. Updates all clips using this field in-place.
	 * This does NOT use the command pattern (no undo) - it's for live preview updates.
	 */
	public updateMergeFieldValueLive(fieldName: string, newValue: string): void {
		// Update the field in the service
		const field = this.mergeFieldService.get(fieldName);
		if (!field) return;
		this.mergeFieldService.register({ ...field, defaultValue: newValue }, { silent: true });

		// Find and update all clips using this field
		const tracks = this.getTracks();
		for (let trackIdx = 0; trackIdx < tracks.length; trackIdx += 1) {
			for (let clipIdx = 0; clipIdx < tracks[trackIdx].length; clipIdx += 1) {
				const player = tracks[trackIdx][clipIdx];
				const templateClip = this.getTemplateClip(trackIdx, clipIdx);
				if (templateClip) {
					// Update clipConfiguration with new resolved value (for rendering)
					this.updateMergeFieldInObject(player.clipConfiguration, templateClip, fieldName, newValue);

					// Also update the binding's resolvedValue so getExportableClip() can match correctly
					this.updateMergeFieldBindings(player, fieldName, newValue);
				}
			}
		}
	}

	/**
	 * Redraw all clips that use a specific merge field.
	 * Call this after updateMergeFieldValueLive() to refresh the canvas.
	 * Handles both text redraws and asset reloads for URL changes.
	 */
	public redrawMergeFieldClips(fieldName: string): void {
		const tracks = this.getTracks();
		for (const track of tracks) {
			for (const player of track) {
				const indices = this.findClipIndices(player);
				if (indices) {
					const templateClip = this.getTemplateClip(indices.trackIndex, indices.clipIndex);
					if (templateClip) {
						// Check if this clip uses the merge field and where
						const usageInfo = this.getMergeFieldUsage(templateClip, fieldName);
						if (usageInfo.used) {
							// If the merge field is used for asset.src, reload the asset
							if (usageInfo.isSrcField) {
								player.reloadAsset();
							}
							player.reconfigureAfterRestore();
							player.draw();
						}
					}
				}
			}
		}
	}

	/**
	 * Check if a merge field is used for asset.src in any clip.
	 * Used by UI to determine if URL validation should be applied.
	 */
	public isSrcMergeField(fieldName: string): boolean {
		const tracks = this.getTracks();
		for (const track of tracks) {
			for (const player of track) {
				const indices = this.findClipIndices(player);
				if (indices) {
					const templateClip = this.getTemplateClip(indices.trackIndex, indices.clipIndex);
					if (templateClip) {
						const usageInfo = this.getMergeFieldUsage(templateClip, fieldName);
						if (usageInfo.used && usageInfo.isSrcField) {
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	/**
	 * Remove a merge field globally from all clips and the registry.
	 * Restores all affected clip properties to the merge field's default value.
	 *
	 * @param fieldName - The merge field name to remove
	 */
	public deleteMergeFieldGlobally(fieldName: string): void {
		const field = this.mergeFieldService.get(fieldName);
		if (!field) return;

		const template = this.mergeFieldService.createTemplate(fieldName);
		const restoreValue = field.defaultValue;

		// Find and restore all clips using this merge field
		const tracks = this.getTracks();
		for (let trackIdx = 0; trackIdx < tracks.length; trackIdx += 1) {
			for (let clipIdx = 0; clipIdx < tracks[trackIdx].length; clipIdx += 1) {
				const templateClip = this.getTemplateClip(trackIdx, clipIdx);
				if (templateClip) {
					// Find properties with this template and restore them
					this.restoreMergeFieldInClip(trackIdx, clipIdx, templateClip, template, restoreValue);
				}
			}
		}

		// Remove from registry
		this.mergeFieldService.remove(fieldName);
	}

	// ─── Text Conversion API ───────────────────────────────────────────────────

	/**
	 * Convert a TextAsset clip to a RichTextAsset clip.
	 * This is a one-way conversion that preserves styling.
	 * Width/height properties are moved to clip.fit.
	 * Not added to undo history (one-way upgrade).
	 *
	 * @param trackIndex - Track index of the text clip
	 * @param clipIndex - Clip index of the text clip
	 */
	public async convertTextToRichText(trackIndex: number, clipIndex: number): Promise<void> {
		const player = this.getClipAt(trackIndex, clipIndex);
		if (!player?.clipConfiguration?.asset) return;

		const asset = player.clipConfiguration.asset as { type?: string };
		if (asset.type !== "text") return;

		// Execute directly (NOT via executeCommand - no undo for one-way upgrade)
		const context = this.createCommandContext();
		await executeTextToRichTextConversion(trackIndex, clipIndex, context);

		this.emitEditChanged("ConvertTextToRichText");

		// Re-select the clip to trigger toolbar switch
		this.selectClip(trackIndex, clipIndex);
	}

	/**
	 * Convert all TextAsset clips to RichTextAsset clips.
	 * Skips text assets with empty text (used as shapes).
	 * One-way conversion, not added to undo history.
	 *
	 * @returns Number of clips converted
	 */
	public async convertAllTextToRichText(): Promise<number> {
		const trackCount = this.getTrackCount();
		let converted = 0;

		// Iterate backwards to avoid index shifting issues when clips are replaced
		for (let trackIdx = 0; trackIdx < trackCount; trackIdx += 1) {
			const clipCount = this.getClipCountInTrack(trackIdx);
			for (let clipIdx = clipCount - 1; clipIdx >= 0; clipIdx -= 1) {
				const player = this.getClipAt(trackIdx, clipIdx);
				const asset = player?.clipConfiguration?.asset as { type?: string; text?: string };

				// Only convert text assets with non-empty text
				// Empty text assets are used as shapes and need different handling
				if (asset?.type === "text" && asset.text && asset.text.trim() !== "") {
					await this.convertTextToRichText(trackIdx, clipIdx);
					converted += 1;
				}
			}
		}

		return converted;
	}

	// ─── Private Helpers ───────────────────────────────────────────────────────

	/** Helper: Update merge field binding resolvedValues for a player */
	private updateMergeFieldBindings(player: ReturnType<typeof this.getPlayerClip>, fieldName: string, _newValue: string): void {
		if (!player) return;
		for (const [path, binding] of player.getMergeFieldBindings()) {
			// Check if this binding's placeholder contains this field
			const extractedField = this.mergeFieldService.extractFieldName(binding.placeholder);
			if (extractedField === fieldName) {
				// Recompute the resolved value from the placeholder with the new field value
				const newResolvedValue = this.mergeFieldService.resolve(binding.placeholder);
				player.setMergeFieldBinding(path, {
					placeholder: binding.placeholder,
					resolvedValue: newResolvedValue
				});
			}
		}
	}

	/** Helper: Update merge field occurrences in an object */
	private updateMergeFieldInObject(target: unknown, template: unknown, fieldName: string, newValue: string): void {
		if (!target || !template || typeof target !== "object" || typeof template !== "object") return;

		for (const key of Object.keys(template as Record<string, unknown>)) {
			const templateVal = (template as Record<string, unknown>)[key];
			const targetObj = target as Record<string, unknown>;

			if (typeof templateVal === "string") {
				const extractedField = this.mergeFieldService.extractFieldName(templateVal);
				if (extractedField === fieldName) {
					// Replace {{ FIELD }} with newValue in the resolved clipConfiguration
					targetObj[key] = templateVal.replace(new RegExp(`\\{\\{\\s*${fieldName}\\s*\\}\\}`, "gi"), newValue);
				}
			} else if (templateVal && typeof templateVal === "object") {
				this.updateMergeFieldInObject(targetObj[key], templateVal, fieldName, newValue);
			}
		}
	}

	/** Helper: Check if and how a clip uses a specific merge field */
	private getMergeFieldUsage(clip: unknown, fieldName: string, path: string = ""): { used: boolean; isSrcField: boolean } {
		if (!clip || typeof clip !== "object") return { used: false, isSrcField: false };

		for (const [key, value] of Object.entries(clip as Record<string, unknown>)) {
			const currentPath = path ? `${path}.${key}` : key;

			if (typeof value === "string") {
				const extractedField = this.mergeFieldService.extractFieldName(value);
				if (extractedField === fieldName) {
					// Check if this is an asset.src property
					const isSrcField = currentPath === "asset.src" || currentPath.endsWith(".src");
					return { used: true, isSrcField };
				}
			} else if (typeof value === "object" && value !== null) {
				const nested = this.getMergeFieldUsage(value, fieldName, currentPath);
				if (nested.used) return nested;
			}
		}
		return { used: false, isSrcField: false };
	}

	/**
	 * Helper: Find and restore merge field occurrences in a clip
	 */
	private restoreMergeFieldInClip(
		trackIdx: number,
		clipIdx: number,
		templateClip: unknown,
		template: string,
		restoreValue: string,
		path: string = ""
	): void {
		if (!templateClip || typeof templateClip !== "object") return;

		for (const key of Object.keys(templateClip as Record<string, unknown>)) {
			const value = (templateClip as Record<string, unknown>)[key];
			const propertyPath = path ? `${path}.${key}` : key;

			if (typeof value === "string") {
				const extractedField = this.mergeFieldService.extractFieldName(value);
				const templateFieldName = this.mergeFieldService.extractFieldName(template);
				if (extractedField && templateFieldName && extractedField === templateFieldName) {
					// Apply proper substitution - replace {{ FIELD }} with restoreValue, preserving surrounding text
					const substitutedValue = value.replace(new RegExp(`\\{\\{\\s*${extractedField}\\s*\\}\\}`, "gi"), restoreValue);
					this.removeMergeField(trackIdx, clipIdx, propertyPath, substitutedValue);
				}
			} else if (typeof value === "object" && value !== null) {
				// Recurse into nested objects
				this.restoreMergeFieldInClip(trackIdx, clipIdx, value, template, restoreValue, propertyPath);
			}
		}
	}
}
