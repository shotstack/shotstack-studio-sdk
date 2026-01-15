import { SetMergeFieldCommand } from "./commands/set-merge-field-command";
import { Edit } from "./edit-session";
import { parseFontFamily } from "./fonts/font-config";
import type { MergeFieldService } from "./merge";
import type { Clip, RichTextAsset, TextAsset } from "./schemas";
import { getNestedValue } from "./shared/utils";

/**
 * Type guard for empty TextAsset (used as shape).
 */
function isEmptyTextAsset(asset: unknown): asset is TextAsset {
	if (typeof asset !== "object" || asset === null) return false;
	const a = asset as { type?: string; text?: string };
	return a.type === "text" && (!a.text || a.text.trim() === "");
}

/**
 * Escape a string for use in XML/SVG attribute values.
 */
function escapeXmlAttr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * Build raw SVG markup from empty text asset properties.
 */
function buildSvgMarkup(textAsset: TextAsset): string {
	const width = textAsset.width ?? 100;
	const height = textAsset.height ?? 100;
	const fillColor = escapeXmlAttr(textAsset.background?.color ?? "#000000");
	const fillOpacity = textAsset.background?.opacity ?? 1;
	const borderRadius = textAsset.background?.borderRadius ?? 0;

	const rectAttrs: string[] = [`width="${width}"`, `height="${height}"`, `fill="${fillColor}"`];

	if (fillOpacity !== 1) {
		rectAttrs.push(`fill-opacity="${fillOpacity}"`);
	}

	if (borderRadius > 0) {
		rectAttrs.push(`rx="${borderRadius}"`, `ry="${borderRadius}"`);
	}

	if (textAsset.stroke?.width && textAsset.stroke.width > 0) {
		const strokeColor = escapeXmlAttr(textAsset.stroke.color ?? "#000000");
		rectAttrs.push(`stroke="${strokeColor}"`);
		rectAttrs.push(`stroke-width="${textAsset.stroke.width}"`);
	}

	return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect ${rectAttrs.join(" ")}/></svg>`;
}

/**
 * Convert an empty TextAsset clip to an SvgAsset clip (on raw JSON).
 */
function convertEmptyTextClipToSvg(clip: Clip): Clip {
	const textAsset = clip.asset as TextAsset;
	const svgMarkup = buildSvgMarkup(textAsset);

	// Build new clip with SVG asset
	const newClip: Clip = {
		...clip,
		asset: {
			type: "svg",
			src: svgMarkup,
			opacity: 1
		}
	};

	// Move width/height from asset to clip level
	if (textAsset.width !== undefined && newClip.width === undefined) {
		newClip.width = textAsset.width;
	}
	if (textAsset.height !== undefined && newClip.height === undefined) {
		newClip.height = textAsset.height;
	}

	return newClip;
}

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
		if (!player?.clipId) return;

		// Get current value from player for undo
		const currentValue = getNestedValue(player.clipConfiguration, propertyPath);
		const previousValue = originalValue ?? (typeof currentValue === "string" ? currentValue : "");

		// Check if there's already a merge field on this property
		const templateClip = this.getTemplateClip(trackIndex, clipIndex);
		const templateValue = templateClip ? getNestedValue(templateClip, propertyPath) : null;
		const previousFieldName = typeof templateValue === "string" ? this.mergeFieldService.extractFieldName(templateValue) : null;

		const command = new SetMergeFieldCommand(player.clipId, propertyPath, fieldName, previousFieldName, previousValue, value, trackIndex, clipIndex);
		this.executeCommand(command);
	}

	/**
	 * Remove a merge field from a clip property, restoring the original value.
	 *
	 * @param trackIndex - Track index
	 * @param clipIndex - Clip index within the track
	 * @param propertyPath - Dot-notation path to property (e.g., "asset.src")
	 * @param restoreValue - The value to restore (original pre-merge-field value)
	 * @returns Promise that resolves when the command completes
	 */
	public removeMergeField(
		trackIndex: number,
		clipIndex: number,
		propertyPath: string,
		restoreValue: string
	): void | Promise<void> {
		const player = this.getPlayerClip(trackIndex, clipIndex);
		if (!player?.clipId) return;

		// Get current merge field name
		const templateClip = this.getTemplateClip(trackIndex, clipIndex);
		const templateValue = templateClip ? getNestedValue(templateClip, propertyPath) : null;
		const currentFieldName = typeof templateValue === "string" ? this.mergeFieldService.extractFieldName(templateValue) : null;

		if (!currentFieldName) return; // No merge field to remove

		const command = new SetMergeFieldCommand(
			player.clipId,
			propertyPath,
			null, // Removing merge field
			currentFieldName,
			restoreValue,
			restoreValue, // New value is the restore value
			trackIndex,
			clipIndex
		);
		return this.executeCommand(command);
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
	 * Convert all text assets and log the resulting template JSON to console.
	 *
	 * This performs a pure JSON transformation (no live player updates):
	 * - Text assets with content → RichText assets
	 * - Empty text assets (shapes) → SVG assets
	 *
	 * The converted template is logged to console for manual copying.
	 *
	 * @returns Conversion counts
	 */
	public async convertAllTextAssets(): Promise<{ richText: number; svg: number }> {
		const document = this.getDocument();
		if (!document) {
			console.error("No document available for conversion");
			return { richText: 0, svg: 0 };
		}

		// Deep clone the current document state (preserves "auto"/"end" keywords)
		const template = JSON.parse(JSON.stringify(document.toJSON())) as { timeline?: { tracks?: { clips?: Clip[] }[] } };

		let richTextCount = 0;
		let svgCount = 0;

		// Transform tracks
		const tracks = template.timeline?.tracks;
		if (tracks) {
			for (const track of tracks) {
				if (track.clips) {
					for (let clipIdx = 0; clipIdx < track.clips.length; clipIdx += 1) {
						const clip = track.clips[clipIdx];
						const asset = clip.asset as { type?: string; text?: string } | undefined;

						if (asset?.type === "text") {
							if (isEmptyTextAsset(asset)) {
								// Convert empty text to SVG
								track.clips[clipIdx] = convertEmptyTextClipToSvg(clip);
								svgCount += 1;
							} else {
								// Convert text with content to rich-text
								track.clips[clipIdx] = this.convertTextClipToRichText(clip);
								richTextCount += 1;
							}
						}
					}
				}
			}
		}

		// Note: We skip strict Zod validation here because templates contain
		// merge field placeholders (e.g., "{{ FONT_COLOR_1 }}") that don't pass
		// strict schema validation until resolved at runtime.

		// Log the converted template to console
		console.log("CONVERTED TEMPLATE - Copy the JSON below:");
		console.log(JSON.stringify(template, null, "\t"));

		return { richText: richTextCount, svg: svgCount };
	}

	/**
	 * Map TextAsset vertical alignment to RichTextAsset vertical alignment.
	 * TextAsset uses "center", RichTextAsset uses "middle".
	 */
	private mapVerticalAlign(textAlign: string | undefined): "top" | "middle" | "bottom" {
		if (textAlign === "center") return "middle";
		if (textAlign === "top" || textAlign === "bottom") return textAlign;
		return "middle"; // default
	}

	/**
	 * Convert a text clip to rich-text format (pure JSON transformation).
	 */
	private convertTextClipToRichText(clip: Clip): Clip {
		const textAsset = clip.asset as TextAsset;

		// Extract weight from font family suffix (e.g., "Montserrat ExtraBold" → 800)
		const fontFamily = textAsset.font?.family ?? "Open Sans";
		const { fontWeight } = parseFontFamily(fontFamily);

		// Build font object
		const font: RichTextAsset["font"] = {
			family: fontFamily,
			size: typeof textAsset.font?.size === "string" ? Number(textAsset.font.size) : (textAsset.font?.size ?? 32),
			weight: textAsset.font?.weight ?? fontWeight,
			color: textAsset.font?.color ?? "#ffffff",
			opacity: textAsset.font?.opacity ?? 1
		};

		// Nest stroke inside font if present
		if (textAsset.stroke?.width && textAsset.stroke.width > 0) {
			font.stroke = {
				width: textAsset.stroke.width,
				color: textAsset.stroke.color ?? "#000000",
				opacity: 1
			};
		}

		// Build style object
		const style: RichTextAsset["style"] = {
			letterSpacing: 0,
			lineHeight: textAsset.font?.lineHeight ?? 1.2,
			textTransform: "none",
			textDecoration: "none"
		};

		// Build the RichTextAsset
		const richTextAsset: RichTextAsset = {
			type: "rich-text",
			text: textAsset.text ?? "",
			font,
			style,
			align: {
				horizontal: textAsset.alignment?.horizontal ?? "center",
				vertical: this.mapVerticalAlign(textAsset.alignment?.vertical)
			}
		};

		// Map background
		if (textAsset.background) {
			richTextAsset.background = {
				color: textAsset.background.color,
				opacity: textAsset.background.opacity ?? 1,
				borderRadius: textAsset.background.borderRadius ?? 0
			};

			// Extract padding from background to top-level
			if (textAsset.background.padding) {
				richTextAsset.padding = textAsset.background.padding;
			}
		}

		// Map animation
		if (textAsset.animation) {
			richTextAsset.animation = {
				preset: textAsset.animation.preset,
				duration: textAsset.animation.duration
			};
		}

		// Warn if ellipsis is dropped
		if (textAsset.ellipsis !== undefined) {
			console.warn("TextAsset ellipsis property not supported in RichTextAsset, value dropped");
		}

		const newClip: Clip = {
			...clip,
			asset: richTextAsset
		};

		// Move width/height to clip level
		if (textAsset.width !== undefined && newClip.width === undefined) {
			newClip.width = textAsset.width;
		}
		if (textAsset.height !== undefined && newClip.height === undefined) {
			newClip.height = textAsset.height;
		}

		return newClip;
	}

	// ─── Private Helpers ───────────────────────────────────────────────────────

	/** Helper: Update merge field binding resolvedValues for a player */
	private updateMergeFieldBindings(player: ReturnType<typeof this.getPlayerClip>, fieldName: string, _newValue: string): void {
		if (!player) return;

		const clipId = player.clipId;
		if (!clipId) return;

		const document = this.getDocument();
		if (!document) return;

		// Read bindings from document (source of truth)
		const bindings = document.getClipBindings(clipId);
		if (!bindings) return;

		for (const [path, binding] of bindings) {
			// Check if this binding's placeholder contains this field
			const extractedField = this.mergeFieldService.extractFieldName(binding.placeholder);
			if (extractedField === fieldName) {
				// Recompute the resolved value from the placeholder with the new field value
				const newResolvedValue = this.mergeFieldService.resolve(binding.placeholder);
				const updatedBinding = {
					placeholder: binding.placeholder,
					resolvedValue: newResolvedValue
				};

				// Update document binding
				document.setClipBinding(clipId, path, updatedBinding);
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
