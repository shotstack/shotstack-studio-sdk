import { EditEvent } from "@core/events/edit-events";
import type { MergeField } from "@core/merge/types";
import { getNestedValue } from "@core/shared/utils";
import { ShotstackEdit } from "@core/shotstack-edit";
import { type Milliseconds, sec, toMs, toSec } from "@core/timing/types";
import { injectShotstackStyles } from "@styles/inject";

import { BaseToolbar } from "./base-toolbar";
import { TimingControl } from "./composites/TimingControl";
import { MergeFieldLabel } from "./primitives/MergeFieldLabel";

/**
 * Toolbar for clip-level properties (timing, linking).
 * Shows compact timing controls for start and length with:
 * - Click-to-cycle mode badges
 * - Scrubbable time values (drag to adjust)
 * - Keyboard increment/decrement (arrow keys)
 */
export class ClipToolbar extends BaseToolbar {
	// Timing controls
	private startControl: TimingControl | null = null;
	private lengthControl: TimingControl | null = null;
	private editChangedListener: (() => void) | null = null;
	private mergeFieldChangedListener: (() => void) | null = null;

	// Merge field labels
	private startMergeLabel: MergeFieldLabel | null = null;
	private lengthMergeLabel: MergeFieldLabel | null = null;

	override mount(parent: HTMLElement): void {
		injectShotstackStyles();

		this.container = document.createElement("div");
		this.container.className = "ss-clip-toolbar";

		this.container.innerHTML = `
			<!-- Mode Toggle -->
			<div class="ss-toolbar-mode-toggle" data-mode="clip">
				<button class="ss-toolbar-mode-btn" data-mode="asset" title="Asset properties (\`)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="2" y="2" width="12" height="12" rx="1.5"/>
						<path d="M2 6h12M6 6v8"/>
					</svg>
				</button>
				<button class="ss-toolbar-mode-btn active" data-mode="clip" title="Clip timing (\`)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="8" cy="8" r="6"/>
						<path d="M8 5v3l2 2"/>
					</svg>
				</button>
				<span class="ss-toolbar-mode-indicator"></span>
			</div>
			<div class="ss-toolbar-mode-divider"></div>

			<div class="ss-clip-toolbar-section" data-start-mount></div>
			<div class="ss-clip-toolbar-section" data-length-mount></div>
		`;

		parent.insertBefore(this.container, parent.firstChild);

		this.mountComponents();
		this.setupOutsideClickHandler();
		this.setupEventListeners();
		this.enableDrag();
	}

	private setupEventListeners(): void {
		this.editChangedListener = () => {
			if (this.selectedTrackIdx >= 0 && this.selectedClipIdx >= 0) {
				this.syncState();
			}
		};
		this.edit.events.on(EditEvent.EditChanged, this.editChangedListener);

		this.mergeFieldChangedListener = () => {
			if (this.selectedTrackIdx >= 0 && this.selectedClipIdx >= 0) {
				this.syncState();
			}
		};
		this.edit.events.on(EditEvent.MergeFieldChanged, this.mergeFieldChangedListener);
	}

	private mountComponents(): void {
		// Mount start timing control
		const startMount = this.container?.querySelector("[data-start-mount]");
		if (startMount) {
			this.startControl = new TimingControl("start");
			this.startControl.onChange(() => this.applyTimingUpdate());
			this.startControl.mount(startMount as HTMLElement);
		}

		// Mount length timing control
		const lengthMount = this.container?.querySelector("[data-length-mount]");
		if (lengthMount) {
			this.lengthControl = new TimingControl("length");
			this.lengthControl.onChange(() => this.applyTimingUpdate());
			this.lengthControl.mount(lengthMount as HTMLElement);
		}

		// Mount MergeFieldLabel into each timing control's merge mount point
		if (this.getShotstackEdit()) {
			const startMergeMount = this.startControl?.getMergeMountPoint();
			if (startMergeMount) {
				this.startMergeLabel = new MergeFieldLabel({ label: "", propertyPath: "start", namePrefix: "START" });
				this.startMergeLabel.mount(startMergeMount);
				this.wireBindCallback(this.startMergeLabel, "start");
				this.wireClearCallback(this.startMergeLabel, "start");
			}

			const lengthMergeMount = this.lengthControl?.getMergeMountPoint();
			if (lengthMergeMount) {
				this.lengthMergeLabel = new MergeFieldLabel({ label: "", propertyPath: "length", namePrefix: "LENGTH" });
				this.lengthMergeLabel.mount(lengthMergeMount);
				this.wireBindCallback(this.lengthMergeLabel, "length");
				this.wireClearCallback(this.lengthMergeLabel, "length");
			}
		}
	}

	private applyTimingUpdate(): void {
		if (this.selectedTrackIdx < 0 || this.selectedClipIdx < 0) return;

		const startValue = this.startControl?.getStartValue();
		const lengthValue = this.lengthControl?.getLengthValue();

		// Convert from Milliseconds to Seconds for command
		const startSeconds = typeof startValue === "number" ? toSec(startValue as Milliseconds) : startValue;
		const lengthSeconds = typeof lengthValue === "number" ? toSec(lengthValue as Milliseconds) : lengthValue;

		this.edit.updateClipTiming(this.selectedTrackIdx, this.selectedClipIdx, {
			start: startSeconds,
			length: lengthSeconds
		});
	}

	/** Get the edit as ShotstackEdit if it has merge field capabilities. */
	private getShotstackEdit(): ShotstackEdit | null {
		return this.edit instanceof ShotstackEdit ? this.edit : null;
	}

	private wireBindCallback(label: MergeFieldLabel, propertyPath: string): void {
		label.onBind((nameOrPrefix: string) => {
			const shotstackEdit = this.getShotstackEdit();
			if (!shotstackEdit) return;

			const clipId = this.getSelectedClipId();
			if (!clipId) return;

			const existingField = shotstackEdit.mergeFields.get(nameOrPrefix);

			let fieldName: string;
			let value: string;

			if (existingField) {
				if (!shotstackEdit.isValueCompatibleWithClipProperty(clipId, propertyPath, existingField.defaultValue)) {
					return;
				}
				fieldName = existingField.name;
				value = existingField.defaultValue;
			} else {
				fieldName = shotstackEdit.mergeFields.generateUniqueName(nameOrPrefix);
				const resolvedClip = this.edit.getResolvedClipById(clipId);
				const currentValue = resolvedClip ? getNestedValue(resolvedClip, propertyPath) : null;
				value = currentValue != null ? String(currentValue) : "0";
			}

			shotstackEdit.applyMergeField(clipId, propertyPath, fieldName, value).then(() => {
				this.syncState();
			});
		});
	}

	private wireClearCallback(label: MergeFieldLabel, propertyPath: string): void {
		label.onClear(() => {
			const shotstackEdit = this.getShotstackEdit();
			if (!shotstackEdit) return;

			const clipId = this.getSelectedClipId();
			if (!clipId) return;

			const boundFieldName = shotstackEdit.getMergeFieldForProperty(clipId, propertyPath);
			const field = boundFieldName ? shotstackEdit.mergeFields.get(boundFieldName) : null;
			const restoreValue = field?.defaultValue ?? "";

			shotstackEdit.removeMergeField(clipId, propertyPath, restoreValue).then(() => {
				this.syncState();
			});
		});
	}

	private syncMergeLabel(
		label: MergeFieldLabel | null,
		allFields: MergeField[],
		propertyPath: string,
		clipId: string,
		fieldName: string | null,
		shotstackEdit: ShotstackEdit
	): void {
		if (!label) return;

		const compatibleNames = new Set<string>();
		for (const field of allFields) {
			if (shotstackEdit.isValueCompatibleWithClipProperty(clipId, propertyPath, field.defaultValue)) {
				compatibleNames.add(field.name);
			}
		}

		label.setFields(allFields, compatibleNames);
		label.setState(fieldName !== null, fieldName ?? undefined);
	}

	protected override syncState(): void {
		const docClip = this.edit.getDocumentClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!docClip) return;

		// Check merge field bound state first — we need to know whether to read
		// from the document clip (raw template) or the resolved clip (placeholder values applied).
		const clipId = this.getSelectedClipId();
		const shotstackEdit = this.getShotstackEdit();

		const startFieldName = clipId && shotstackEdit ? shotstackEdit.getMergeFieldForProperty(clipId, "start") : null;
		const lengthFieldName = clipId && shotstackEdit ? shotstackEdit.getMergeFieldForProperty(clipId, "length") : null;

		// When a property is merge-field-bound, the document clip holds the placeholder
		// string (e.g. "{{start}}") which isn't a valid timing value. Use the resolved
		// clip instead — it has the merge field's default value applied.
		const resolvedClip = clipId ? this.edit.getResolvedClipById(clipId) : null;

		const startIntent = startFieldName && resolvedClip ? (resolvedClip.start as number | "auto") : (docClip.start as number | "auto");
		const lengthIntent =
			lengthFieldName && resolvedClip ? (resolvedClip.length as number | "auto" | "end") : (docClip.length as number | "auto" | "end");

		this.startControl?.setFromClip(typeof startIntent === "number" ? toMs(sec(startIntent)) : startIntent);
		this.lengthControl?.setFromClip(typeof lengthIntent === "number" ? toMs(sec(lengthIntent)) : lengthIntent);

		// Update merge field bound state on timing controls and labels
		if (clipId && shotstackEdit) {
			this.startControl?.setMergeFieldBound(startFieldName);
			this.lengthControl?.setMergeFieldBound(lengthFieldName);

			// Sync MergeFieldLabel states (field list, compatibility, bound state)
			const allFields = shotstackEdit.mergeFields.getAll();
			this.syncMergeLabel(this.startMergeLabel, allFields, "start", clipId, startFieldName, shotstackEdit);
			this.syncMergeLabel(this.lengthMergeLabel, allFields, "length", clipId, lengthFieldName, shotstackEdit);
		} else {
			this.startControl?.setMergeFieldBound(null);
			this.lengthControl?.setMergeFieldBound(null);

			this.startMergeLabel?.setState(false);
			this.lengthMergeLabel?.setState(false);
		}
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [];
	}

	override dispose(): void {
		if (this.editChangedListener) {
			this.edit.events.off(EditEvent.EditChanged, this.editChangedListener);
			this.editChangedListener = null;
		}
		if (this.mergeFieldChangedListener) {
			this.edit.events.off(EditEvent.MergeFieldChanged, this.mergeFieldChangedListener);
			this.mergeFieldChangedListener = null;
		}

		this.startMergeLabel?.dispose();
		this.lengthMergeLabel?.dispose();
		this.startControl?.dispose();
		this.lengthControl?.dispose();

		super.dispose();

		this.startMergeLabel = null;
		this.lengthMergeLabel = null;
		this.startControl = null;
		this.lengthControl = null;
	}
}
