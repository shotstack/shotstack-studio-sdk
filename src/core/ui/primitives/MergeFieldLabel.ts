import type { MergeField } from "@core/merge/types";

import type { ChangeCallback, MergeFieldLabelConfig } from "./types";
import { UIComponent } from "./UIComponent";

/**
 * A property label that supports merge field binding via a `{ }` icon.
 *
 * Default state: Shows label text with a `{ }` icon.
 * Clicking the icon opens a dropdown to bind an existing merge field or create a new one.
 *
 * Bound state: The `{ }` icon displays in accent color.
 * The label shows the field name. The dropdown shows the bound field and a "Clear" option.
 */
export class MergeFieldLabel extends UIComponent<void> {
	private iconBtn: HTMLButtonElement | null = null;
	private dropdown: HTMLElement | null = null;
	private listEl: HTMLElement | null = null;

	private fields: MergeField[] = [];
	private compatibleFieldNames: Set<string> | null = null;
	private bound = false;
	private boundFieldName: string | null = null;

	private bindCallbacks: ChangeCallback<string>[] = [];
	private clearCallbacks: ChangeCallback<void>[] = [];

	constructor(private labelConfig: MergeFieldLabelConfig) {
		super({ className: labelConfig.className });
	}

	render(): string {
		return `
			<div class="ss-merge-label">
				<span class="ss-merge-label__text">${this.labelConfig.label}</span>
				<button class="ss-merge-label__icon" title="Merge field" type="button">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path d="M3.5 2C2.67 2 2 2.67 2 3.5v1.17c0 .44-.18.86-.49 1.17L1 6.33a.94.94 0 000 1.34l.51.49c.31.31.49.73.49 1.17v1.17c0 .83.67 1.5 1.5 1.5M10.5 2c.83 0 1.5.67 1.5 1.5v1.17c0 .44.18.86.49 1.17l.51.49a.94.94 0 010 1.34l-.51.49c-.31.31-.49.73-.49 1.17v1.17c0 .83-.67 1.5-1.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
					</svg>
				</button>
				<div class="ss-merge-label__dropdown" style="display:none;">
					<div class="ss-merge-label__header">MERGE FIELDS</div>
					<button class="ss-merge-label__create" type="button">+ Create &amp; Select</button>
					<div class="ss-merge-label__list"></div>
				</div>
			</div>
		`;
	}

	protected bindElements(): void {
		this.iconBtn = this.container?.querySelector(".ss-merge-label__icon") ?? null;
		this.dropdown = this.container?.querySelector(".ss-merge-label__dropdown") ?? null;
		this.listEl = this.container?.querySelector(".ss-merge-label__list") ?? null;
	}

	protected setupEvents(): void {
		// Toggle dropdown on icon click
		this.events.on(this.iconBtn, "click", (e: MouseEvent) => {
			e.stopPropagation();
			this.toggleDropdown();
		});

		// Create & Select
		const createBtn = this.container?.querySelector(".ss-merge-label__create") as HTMLButtonElement | null;
		this.events.on(createBtn, "click", (e: MouseEvent) => {
			e.stopPropagation();
			this.hideDropdown();
			for (const cb of this.bindCallbacks) cb(this.labelConfig.namePrefix);
		});

		// Close dropdown on outside click
		this.events.onDocument("pointerdown", (e: PointerEvent) => {
			if (!this.dropdown || this.dropdown.style.display === "none") return;
			const inside = this.container?.contains(e.target as Node);
			if (!inside) {
				this.hideDropdown();
			}
		});
	}

	// ─── Public API ────────────────────────────────────────────────────────

	/** Register callback for when a merge field is bound to this property. */
	onBind(callback: ChangeCallback<string>): void {
		this.bindCallbacks.push(callback);
	}

	/** Register callback for when the merge field binding is cleared. */
	onClear(callback: ChangeCallback<void>): void {
		this.clearCallbacks.push(callback);
	}

	/**
	 * Update the list of available merge fields for the dropdown.
	 * @param compatibleNames — Set of field names whose values are type-compatible
	 *   with this property. Incompatible fields are shown greyed out. Pass null to
	 *   treat all fields as compatible.
	 */
	setFields(fields: MergeField[], compatibleNames?: Set<string> | null): void {
		this.fields = fields;
		this.compatibleFieldNames = compatibleNames ?? null;
	}

	/** Update bound/unbound visual state. */
	setState(bound: boolean, fieldName?: string): void {
		this.bound = bound;
		this.boundFieldName = fieldName ?? null;

		const labelEl = this.container?.querySelector(".ss-merge-label") as HTMLElement | null;
		if (!labelEl) return;

		// Remove existing bound-name span if any
		const existingBadge = labelEl.querySelector(".ss-merge-label__bound-name");
		existingBadge?.remove();

		if (bound && fieldName) {
			labelEl.classList.add("ss-merge-label--bound");

			// Add field name badge after the text
			const textEl = labelEl.querySelector(".ss-merge-label__text");
			if (textEl) {
				const badge = document.createElement("span");
				badge.className = "ss-merge-label__bound-name";
				badge.textContent = ` \u00b7 {{ ${fieldName} }}`;
				textEl.after(badge);
			}
		} else {
			labelEl.classList.remove("ss-merge-label--bound");
		}
	}

	/** Get the label text for this property. */
	getLabel(): string {
		return this.labelConfig.label;
	}

	/** Get the property path this label controls. */
	getPropertyPath(): string {
		return this.labelConfig.propertyPath;
	}

	/** Get the name prefix for auto-generated field names. */
	getNamePrefix(): string {
		return this.labelConfig.namePrefix;
	}

	/** Whether a merge field is currently bound. */
	isBound(): boolean {
		return this.bound;
	}

	// ─── Private ───────────────────────────────────────────────────────────

	private toggleDropdown(): void {
		if (!this.dropdown) return;
		const isHidden = this.dropdown.style.display === "none";
		if (isHidden) {
			this.showDropdown();
		} else {
			this.hideDropdown();
		}
	}

	private showDropdown(): void {
		if (!this.dropdown || !this.listEl) return;
		this.renderList();
		this.dropdown.style.display = "";
	}

	private hideDropdown(): void {
		if (this.dropdown) {
			this.dropdown.style.display = "none";
		}
	}

	private renderList(): void {
		if (!this.listEl) return;

		// Clear previous content and listeners (innerHTML replacement detaches old nodes)
		this.listEl.innerHTML = "";

		for (const field of this.fields) {
			const isActive = this.bound && this.boundFieldName === field.name;
			const isCompatible = !this.compatibleFieldNames || this.compatibleFieldNames.has(field.name);
			const btn = document.createElement("button");
			btn.type = "button";

			let className = "ss-merge-label__field";
			if (isActive) className += " ss-merge-label__field--active";
			if (!isCompatible) className += " ss-merge-label__field--disabled";
			btn.className = className;

			btn.dataset["fieldName"] = field.name;
			btn.innerHTML = `
				<span class="ss-merge-label__field-name">{{ ${field.name} }}</span>
				<span class="ss-merge-label__field-value">${field.defaultValue}</span>
			`;

			if (isCompatible) {
				btn.addEventListener("click", (e: MouseEvent) => {
					e.stopPropagation();
					this.hideDropdown();
					for (const cb of this.bindCallbacks) cb(field.name);
				});
			} else {
				btn.title = "Incompatible value type";
			}

			this.listEl.appendChild(btn);
		}

		if (this.bound) {
			const clearBtn = document.createElement("button");
			clearBtn.type = "button";
			clearBtn.className = "ss-merge-label__clear";
			clearBtn.textContent = "Clear";
			clearBtn.addEventListener("click", (e: MouseEvent) => {
				e.stopPropagation();
				this.hideDropdown();
				for (const cb of this.clearCallbacks) cb();
			});
			this.listEl.appendChild(clearBtn);
		}
	}

	override dispose(): void {
		super.dispose();
		this.bindCallbacks = [];
		this.clearCallbacks = [];
	}
}
