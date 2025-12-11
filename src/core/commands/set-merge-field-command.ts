import type { Player } from "@canvas/players/player";
import { setNestedValue } from "@core/shared/utils";

import type { EditCommand, CommandContext } from "./types";

/**
 * Command to apply or remove a merge field on a clip property.
 * Handles both the template (for export) and resolved value (for rendering) atomically.
 *
 * This command supports undo/redo and ensures:
 * - Player's clipConfiguration gets the resolved value (for rendering)
 * - Template edit (originalEdit) gets the {{ FIELD }} template (for export)
 * - Merge field registry is updated appropriately
 */
export class SetMergeFieldCommand implements EditCommand {
	name = "setMergeField";

	private storedPreviousValue: string;
	private storedNewValue: string;
	private trackIndex: number;
	private clipIndex: number;

	constructor(
		private clip: Player,
		private propertyPath: string,
		private fieldName: string | null,
		private previousFieldName: string | null,
		private previousValue: string,
		private newValue: string,
		trackIndex: number,
		clipIndex: number
	) {
		this.storedPreviousValue = previousValue;
		this.storedNewValue = newValue;
		this.trackIndex = trackIndex;
		this.clipIndex = clipIndex;
	}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) return;

		const mergeFields = context.getMergeFields();

		// 1. Update player's clipConfiguration with resolved value
		setNestedValue(this.clip.clipConfiguration, this.propertyPath, this.storedNewValue);

		// 2. Update template edit with template or raw value
		const templateValue = this.fieldName ? mergeFields.createTemplate(this.fieldName) : this.storedNewValue;
		context.setTemplateClipProperty(this.trackIndex, this.clipIndex, this.propertyPath, templateValue);

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

		// 5. Emit event
		context.emitEvent("mergefield:applied", {
			clip: this.clip,
			propertyPath: this.propertyPath,
			fieldName: this.fieldName,
			trackIndex: this.trackIndex,
			clipIndex: this.clipIndex
		});
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context) return;

		const mergeFields = context.getMergeFields();

		// 1. Restore player's clipConfiguration with previous value
		setNestedValue(this.clip.clipConfiguration, this.propertyPath, this.storedPreviousValue);

		// 2. Restore template edit
		const templateValue = this.previousFieldName
			? mergeFields.createTemplate(this.previousFieldName)
			: this.storedPreviousValue;
		context.setTemplateClipProperty(this.trackIndex, this.clipIndex, this.propertyPath, templateValue);

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

		// 5. Emit event
		context.emitEvent("mergefield:removed", {
			clip: this.clip,
			propertyPath: this.propertyPath,
			fieldName: this.previousFieldName,
			trackIndex: this.trackIndex,
			clipIndex: this.clipIndex
		});
	}
}
