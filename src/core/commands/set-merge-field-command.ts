import type { MergeFieldBinding } from "@core/edit-document";
import { EditEvent } from "@core/events/edit-events";
import { setNestedValue } from "@core/shared/utils";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess } from "./types";

/**
 * Command to apply or remove a merge field on a clip property.
 *
 * Supports both asset-level paths (e.g. "asset.font.color") and
 * clip-level paths (e.g. "opacity", "scale").
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
		newValue: string
	) {
		this.storedPreviousValue = previousValue;
		this.storedNewValue = newValue;
	}

	/**
	 * Write a value to the document clip at this command's property path.
	 * When storing a placeholder (raw=true), the string is written as-is.
	 * When storing a resolved value (raw=false), it is coerced to match
	 * the existing property's type (e.g. string "5" → number 5).
	 */
	private updateDocumentClip(context: CommandContext, value: string, raw: boolean): void {
		const document = context.getDocument();
		if (!document) return;
		const lookup = document.getClipById(this.clipId);
		if (!lookup) return;
		const clip = lookup.clip as Record<string, unknown>;
		if (raw) {
			setNestedValue(clip, this.propertyPath, value);
		} else {
			const trimmed = typeof value === "string" ? value.trim() : "";
			const num = trimmed.length > 0 ? Number(value) : NaN;
			setNestedValue(clip, this.propertyPath, Number.isFinite(num) ? num : value);
		}
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

		// 3. Update document with placeholder (not resolved value)
		// This matches how templates are loaded - placeholders stored in document, resolved at runtime
		if (this.fieldName) {
			const placeholder = mergeFields.createTemplate(this.fieldName);
			this.updateDocumentClip(context, placeholder, true);
		} else {
			// No merge field - store resolved value with type coercion
			this.updateDocumentClip(context, this.storedNewValue, false);
		}

		// 4. Resolve → Reconciler handles player updates (reloadAsset, reconfigure, draw)
		context.resolve();

		// 5. Emit canonical merge field event
		context.emitEvent(EditEvent.MergeFieldChanged, { fields: mergeFields.getAll() });

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

		// 3. Restore document with previous value
		// If there was a previous binding, store the placeholder; otherwise store resolved value
		if (this.storedPreviousBinding) {
			this.updateDocumentClip(context, this.storedPreviousBinding.placeholder, true);
		} else {
			this.updateDocumentClip(context, this.storedPreviousValue, false);
		}

		// 4. Resolve → Reconciler handles player updates
		context.resolve();

		// 5. Emit canonical merge field event
		context.emitEvent(EditEvent.MergeFieldChanged, { fields: mergeFields.getAll() });

		return CommandSuccess();
	}

	dispose(): void {
		this.storedPreviousBinding = undefined;
	}
}
