import type { Edit } from "@core/edit-session";
import type { MergeField } from "@core/merge";
import { getNestedValue } from "@core/shared/utils";
import { ShotstackEdit } from "@core/shotstack-edit";

import { MergeFieldLabel } from "./primitives";

/**
 * Interface that any toolbar must satisfy to host merge field labels.
 * All properties are available on BaseToolbar (protected/public).
 */
export interface MergeFieldLabelHost {
	container: HTMLElement | null;
	edit: Edit;
	getSelectedClipId(): string | null;
	syncState(): void;
}

/**
 * Reusable manager that scans a toolbar container for `[data-merge-path]` annotated
 * labels, replaces them with interactive MergeFieldLabel components, and keeps their
 * state synchronised with the document's merge field bindings.
 *
 * Used by RichTextToolbar, MediaToolbar, and potentially other toolbars.
 */
export class MergeFieldLabelManager {
	private labels: MergeFieldLabel[] = [];

	constructor(
		private host: MergeFieldLabelHost,
		private propertyDefaults: Record<string, string> = {}
	) {}

	/** Whether any labels were initialised. */
	get hasLabels(): boolean {
		return this.labels.length > 0;
	}

	/**
	 * Scan for all `[data-merge-path]` annotated label elements in the host container
	 * and replace them with MergeFieldLabel components that support merge field binding.
	 */
	init(): void {
		if (!this.host.container) return;

		const annotatedLabels = this.host.container.querySelectorAll<HTMLElement>("[data-merge-path]");

		for (const labelEl of annotatedLabels) {
			const propertyPath = labelEl.dataset["mergePath"];
			const namePrefix = labelEl.dataset["mergePrefix"];
			const labelText = labelEl.textContent?.trim() ?? "";

			if (propertyPath && namePrefix) {
				const mergeLabel = new MergeFieldLabel({
					label: labelText,
					propertyPath,
					namePrefix
				});

				// Replace the original label element with the MergeFieldLabel.
				// Preserve the original CSS class so labels in different panels keep their styling.
				const mountPoint = document.createElement("div");
				mountPoint.className = labelEl.className;
				labelEl.replaceWith(mountPoint);
				mergeLabel.mount(mountPoint);

				this.wireBindCallback(mergeLabel, propertyPath);
				this.wireClearCallback(mergeLabel, propertyPath);

				this.labels.push(mergeLabel);
			}
		}
	}

	/**
	 * Sync all merge field label states with current clip bindings.
	 * Call from the host toolbar's syncState().
	 */
	sync(): void {
		const shotstackEdit = this.getShotstackEdit();
		if (!shotstackEdit) return;

		const allFields = shotstackEdit.mergeFields.getAll();

		const clipId = this.getSelectedClipId();
		if (!clipId) return;

		for (const label of this.labels) {
			const propertyPath = label.getPropertyPath();

			// Compute which fields are type-compatible with this property
			const compatibleNames = this.getCompatibleFieldNames(allFields, propertyPath, clipId);
			label.setFields(allFields, compatibleNames);

			const fieldName = shotstackEdit.getMergeFieldForProperty(clipId, propertyPath);

			if (fieldName) {
				label.setState(true, fieldName);
				this.setControlDisabled(label, true);
			} else {
				label.setState(false);
				this.setControlDisabled(label, false);
			}
		}
	}

	/** Dispose all labels. */
	dispose(): void {
		for (const label of this.labels) {
			label.dispose();
		}
		this.labels = [];
	}

	// ─── Private ───────────────────────────────────────────────────────────

	private getShotstackEdit(): ShotstackEdit | null {
		if (this.host.edit && "mergeFields" in this.host.edit) {
			return this.host.edit as ShotstackEdit;
		}
		return null;
	}

	/** Resolve the stable clipId for the currently selected clip. */
	private getSelectedClipId(): string | null {
		return this.host.getSelectedClipId();
	}

	private wireBindCallback(mergeLabel: MergeFieldLabel, propertyPath: string): void {
		mergeLabel.onBind((nameOrPrefix: string) => {
			const shotstackEdit = this.getShotstackEdit();
			if (!shotstackEdit) return;

			const clipId = this.getSelectedClipId();
			if (!clipId) return;

			const existingField = shotstackEdit.mergeFields.get(nameOrPrefix);

			let fieldName: string;
			let value: string;

			if (existingField) {
				// Guard: reject binding if field value is incompatible with property type.
				if (!shotstackEdit.isValueCompatibleWithClipProperty(clipId, propertyPath, existingField.defaultValue)) {
					return;
				}

				fieldName = existingField.name;
				value = existingField.defaultValue;
			} else {
				fieldName = shotstackEdit.mergeFields.generateUniqueName(nameOrPrefix);

				const resolvedClip = this.host.edit.getResolvedClipById(clipId);
				const currentValue = resolvedClip ? getNestedValue(resolvedClip, propertyPath) : null;
				value = currentValue != null ? String(currentValue) : (this.propertyDefaults[propertyPath] ?? "0");
			}

			shotstackEdit.applyMergeField(clipId, propertyPath, fieldName, value).then(() => {
				this.host.syncState();
			});
		});
	}

	private wireClearCallback(mergeLabel: MergeFieldLabel, propertyPath: string): void {
		mergeLabel.onClear(() => {
			const shotstackEdit = this.getShotstackEdit();
			if (!shotstackEdit) return;

			const clipId = this.getSelectedClipId();
			if (!clipId) return;

			const boundFieldName = shotstackEdit.getMergeFieldForProperty(clipId, propertyPath);
			const field = boundFieldName ? shotstackEdit.mergeFields.get(boundFieldName) : null;
			const restoreValue = field?.defaultValue ?? "";

			shotstackEdit.removeMergeField(clipId, propertyPath, restoreValue).then(() => {
				this.host.syncState();
			});
		});
	}

	/**
	 * Get the set of field names whose default values are type-compatible with a property.
	 * Incompatible fields will be greyed out in the dropdown.
	 */
	private getCompatibleFieldNames(fields: MergeField[], propertyPath: string, clipId: string): Set<string> {
		const shotstackEdit = this.getShotstackEdit();
		const compatible = new Set<string>();
		for (const field of fields) {
			if (!shotstackEdit || shotstackEdit.isValueCompatibleWithClipProperty(clipId, propertyPath, field.defaultValue)) {
				compatible.add(field.name);
			}
		}
		return compatible;
	}

	private setControlDisabled(label: MergeFieldLabel, disabled: boolean): void {
		const wrapper = label.getContainer()?.parentElement;
		if (!wrapper) return;

		const section = wrapper.closest(".ss-toolbar-popup-section, .ss-font-color-section");
		if (!section) return;

		const row = section.querySelector(".ss-toolbar-popup-row, .ss-font-color-opacity-row");
		const controlContainer = row ?? section;

		controlContainer.querySelectorAll<HTMLInputElement>("input").forEach(input => {
			if (wrapper.contains(input)) return;
			input.disabled = disabled; // eslint-disable-line no-param-reassign -- DOM manipulation
		});

		if (row) {
			row.classList.toggle("ss-toolbar-popup-row--disabled", disabled);
		}
	}
}
