import { SetMergeFieldCommand } from "./commands/set-merge-field-command";
import { Edit } from "./edit-session";
import { EditEvent } from "./events/edit-events";
import { parseFontFamily } from "./fonts/font-config";
import type { MergeFieldService } from "./merge";
import { ClipSchema, type Clip, type RichTextAsset, type TextAsset } from "./schemas";
import { getNestedValue, setNestedValue } from "./shared/utils";

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
			src: svgMarkup
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
 * This class is for Shotstack products only.
 * External SDK consumers should use the base `Edit` class.
 */
export class ShotstackEdit extends Edit {
	// Recursion guard for merge field updates (prevents stack overflow)
	private isUpdatingMergeFields = false;

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
	 */
	public applyMergeField(clipId: string, propertyPath: string, fieldName: string, value: string, originalValue?: string): Promise<void> {
		const resolvedClip = this.getResolvedClipById(clipId);
		const currentValue = resolvedClip ? getNestedValue(resolvedClip, propertyPath) : null;
		const previousValue = originalValue ?? (currentValue != null ? String(currentValue) : "");

		// Check if there's already a merge field on this property
		const templateClip = this.getTemplateClipById(clipId);
		const templateValue = templateClip ? getNestedValue(templateClip, propertyPath) : null;
		const previousFieldName = typeof templateValue === "string" ? this.mergeFieldService.extractFieldName(templateValue) : null;

		const command = new SetMergeFieldCommand(clipId, propertyPath, fieldName, previousFieldName, previousValue, value);
		return this.executeCommand(command);
	}

	/**
	 * Remove a merge field from a clip property, restoring the original value.
	 */
	public removeMergeField(clipId: string, propertyPath: string, restoreValue: string): Promise<void> {
		const currentFieldName = this.getMergeFieldForProperty(clipId, propertyPath);
		if (!currentFieldName) return Promise.resolve();

		const command = new SetMergeFieldCommand(clipId, propertyPath, null, currentFieldName, restoreValue, restoreValue);
		return this.executeCommand(command);
	}

	/**
	 * Get the merge field name for a clip property, if any.
	 */
	public getMergeFieldForProperty(clipId: string, propertyPath: string): string | null {
		const templateClip = this.getTemplateClipById(clipId);
		if (!templateClip) return null;

		const value = getNestedValue(templateClip, propertyPath);
		if (typeof value === "string") return this.mergeFieldService.extractFieldName(value);
		return null;
	}

	/**
	 * Update the placeholder value of a merge field.
	 */
	public updateMergeFieldValueLive(fieldName: string, newValue: string): void {
		// Recursion guard: prevent stack overflow from event cascades
		if (this.isUpdatingMergeFields) return;

		this.isUpdatingMergeFields = true;
		try {
			// Update the field in the registry
			const field = this.mergeFieldService.get(fieldName);
			if (!field) return;
			this.mergeFieldService.register({ ...field, defaultValue: newValue }, { silent: true });

			// Update document bindings with new resolved values
			for (const [, player] of this.getPlayerMap()) {
				this.updateMergeFieldBindings(player, fieldName, newValue);
			}

			// Document-first: resolve() triggers reconciler which updates players
			this.resolve();

			// Notify timeline so clip bars redraw (e.g., when start/length changed)
			this.getInternalEvents().emit(EditEvent.TimelineUpdated, { current: this.getEdit() });
		} finally {
			this.isUpdatingMergeFields = false;
		}
	}

	/**
	 * Check if a merge field is used for asset.src in any clip.
	 * Used by UI to determine if URL validation should be applied.
	 */
	public isSrcMergeField(fieldName: string): boolean {
		for (const [clipId, player] of this.getPlayerMap()) {
			if (player.clipId) {
				const templateClip = this.getTemplateClipById(clipId);
				if (templateClip) {
					const assetType = (templateClip.asset as { type?: string })?.type;
					const isUrlBasedAsset = assetType === "image" || assetType === "video" || assetType === "audio";
					if (isUrlBasedAsset) {
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
	 * Check if a value is type-compatible with all properties a merge field is bound to.
	 * Temporarily swaps the field value, resolves each bound clip, and validates
	 * against ClipSchema — the same Zod schema used at load time.
	 */
	public validateMergeFieldValue(fieldName: string, value: string): string | null {
		const document = this.getDocument();
		if (!document) return null;

		const field = this.mergeFieldService.get(fieldName);
		if (!field) return null;

		// Temporarily swap the field value for resolution
		const savedValue = field.defaultValue;
		this.mergeFieldService.register({ ...field, defaultValue: value }, { silent: true });

		try {
			for (const clipId of document.getClipIdsWithBindings()) {
				const bindings = document.getClipBindings(clipId);
				if (bindings && this.clipUsesField(bindings, fieldName)) {
					const lookup = document.getClipById(clipId);
					if (lookup) {
						// Build a validation clip by resolving bindings directly.
						// Each binding has a placeholder (e.g. "{{ START }}") — resolve it
						// using the merge field service (which has the candidate value swapped in)
						// and set the raw string on the clip. ClipSchema's z.preprocess handles
						// type coercion (string → number, etc.) during safeParse.
						const clipForValidation = structuredClone(lookup.clip) as Record<string, unknown>;
						for (const [path, binding] of bindings) {
							const resolved = this.mergeFieldService.resolve(binding.placeholder);
							setNestedValue(clipForValidation, path, resolved);
						}

						delete clipForValidation["id"];
						const result = ClipSchema.safeParse(clipForValidation);
						if (!result.success) {
							return result.error.issues[0]?.message ?? "Invalid value";
						}
					}
				}
			}
			return null;
		} finally {
			this.mergeFieldService.register({ ...field, defaultValue: savedValue }, { silent: true });
		}
	}

	/**
	 * Check if a value is compatible with a specific clip property via Zod schema validation.
	 * Used by the merge field label manager to filter compatible fields in dropdowns.
	 */
	public isValueCompatibleWithClipProperty(clipId: string, propertyPath: string, value: string): boolean {
		const clip = this.getResolvedClipById(clipId);
		if (!clip) return true;

		const testClip = structuredClone(clip) as Record<string, unknown>;
		setNestedValue(testClip, propertyPath, value);
		delete testClip["id"];
		return ClipSchema.safeParse(testClip).success;
	}

	/** Check if any binding in a clip references the given field name. */
	private clipUsesField(bindings: Map<string, { placeholder: string }>, fieldName: string): boolean {
		for (const [, binding] of bindings) {
			if (this.mergeFieldService.extractFieldName(binding.placeholder) === fieldName) return true;
		}
		return false;
	}

	/**
	 * Remove a merge field globally from all clips and the registry.
	 */
	public async deleteMergeFieldGlobally(fieldName: string): Promise<void> {
		const field = this.mergeFieldService.get(fieldName);
		if (!field) return;

		const template = this.mergeFieldService.createTemplate(fieldName);
		const restoreValue = field.defaultValue;

		// Find and restore all clips using this merge field
		for (const [clipId] of this.getPlayerMap()) {
			const templateClip = this.getTemplateClipById(clipId);
			if (templateClip) {
				await this.restoreMergeFieldInClip(clipId, templateClip, template, restoreValue); // eslint-disable-line no-await-in-loop
			}
		}

		// Remove from registry
		// remove() emits mergefield:changed on success; this handles the case where
		// the field was already removed from the registry by restoreMergeFieldInClip
		const removedFromRegistry = this.mergeFieldService.remove(fieldName);
		if (!removedFromRegistry) {
			this.getInternalEvents().emit(EditEvent.MergeFieldChanged, { fields: this.mergeFieldService.getAll() });
		}
	}

	// ─── Text Conversion API ───────────────────────────────────────────────────

	/**
	 * Convert all text assets and log the resulting template JSON to console.
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
			wordSpacing: 0,
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

	/**
	 * Helper: Update merge field bindings and document clip data for a player.
	 * Must update both bindings and clip data because the resolver reads clip data directly.
	 */
	private updateMergeFieldBindings(player: ReturnType<typeof this.getPlayerClip>, fieldName: string, _newValue: string): void {
		if (!player) return;

		const { clipId } = player;
		if (!clipId) return;

		const document = this.getDocument();
		if (!document) return;

		// Read bindings from document (source of truth)
		const bindings = document.getClipBindings(clipId);
		if (!bindings) return;

		// Get document clip by ID (stable lookup)
		const clipLookup = document.getClipById(clipId);

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

				// Also update document clip data (resolver reads clip data, not bindings).
				// Use numeric-first coercion (matching the resolver strategy) because the
				// document clip may still hold a string placeholder like "{{ OPACITY }}".
				if (clipLookup) {
					const trimmed = typeof newResolvedValue === "string" ? newResolvedValue.trim() : "";
					const num = trimmed.length > 0 ? Number(newResolvedValue) : NaN;
					const typedValue = Number.isFinite(num) ? num : newResolvedValue;
					setNestedValue(clipLookup.clip as Record<string, unknown>, path, typedValue);
				}
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
	private async restoreMergeFieldInClip(
		clipId: string,
		templateClip: unknown,
		template: string,
		restoreValue: string,
		path: string = ""
	): Promise<void> {
		if (!templateClip || typeof templateClip !== "object") return;

		for (const key of Object.keys(templateClip as Record<string, unknown>)) {
			const value = (templateClip as Record<string, unknown>)[key];
			const propertyPath = path ? `${path}.${key}` : key;

			if (typeof value === "string") {
				const extractedField = this.mergeFieldService.extractFieldName(value);
				const templateFieldName = this.mergeFieldService.extractFieldName(template);
				if (extractedField && templateFieldName && extractedField === templateFieldName) {
					const substitutedValue = value.replace(new RegExp(`\\{\\{\\s*${extractedField}\\s*\\}\\}`, "gi"), restoreValue);
					await this.removeMergeField(clipId, propertyPath, substitutedValue); // eslint-disable-line no-await-in-loop
				}
			} else if (typeof value === "object" && value !== null) {
				await this.restoreMergeFieldInClip(clipId, value, template, restoreValue, propertyPath); // eslint-disable-line no-await-in-loop
			}
		}
	}
}
