import { injectShotstackStyles } from "@styles/inject";

type ColorChangeCallback = (controlId: string, enabled: boolean, color: string, opacity: number) => void;
type DragCallback = (controlId: string) => void;

export class BackgroundColorPicker {
	private container: HTMLDivElement | null = null;
	private enableCheckbox: HTMLInputElement | null = null;
	private colorInput: HTMLInputElement | null = null;
	private opacitySlider: HTMLInputElement | null = null;
	private opacityValue: HTMLSpanElement | null = null;

	private enabled: boolean = false; // Default to disabled (no background)
	private currentColor: string = "#FFFFFF";
	private currentOpacity: number = 1;
	private onColorChange: ColorChangeCallback | null = null;

	// Two-phase drag pattern state
	private dragActive: boolean = false;
	private dragStartCallback: DragCallback | null = null;
	private dragEndCallback: DragCallback | null = null;
	private currentControlId: string | null = null; // Track which control is active
	private abortController = new AbortController(); // For cleanup of dynamic event listeners

	// Arrow function handlers for proper cleanup
	private handleEnableChange = (): void => {
		this.enabled = this.enableCheckbox?.checked ?? false;
		this.updateControlsState();
		this.emitColorChange("background-checkbox");
	};

	private handleEnableInteractionStart = (): void => {
		const wasInactive = this.currentControlId === null;
		this.dragActive = true;
		this.currentControlId = "background-checkbox";
		if (wasInactive) {
			this.dragStartCallback?.("background-checkbox");
		}
	};

	private handleEnableInteractionEnd = (): void => {
		// Only end the drag if THIS control (checkbox) is the active one
		if (this.dragActive && this.currentControlId === "background-checkbox") {
			this.dragActive = false;
			this.currentControlId = null;
			this.dragEndCallback?.("background-checkbox");
		}
	};

	private handleColorInput = (): void => {
		this.currentColor = this.colorInput?.value ?? "#FFFFFF";
		this.emitColorChange("background-color");
	};

	private handleOpacityInput = (e: Event): void => {
		const opacity = parseInt((e.target as HTMLInputElement).value, 10);
		this.currentOpacity = opacity / 100;
		if (this.opacityValue) {
			this.opacityValue.textContent = `${opacity}%`;
		}
		this.emitColorChange("background-opacity");
	};

	/**
	 * Wire up two-phase drag pattern for any input control.
	 * Handles pointerdown (drag start), input (live updates), and blur (drag end).
	 */
	private setupDragPattern(element: HTMLInputElement, controlId: string, onInput: (e: Event) => void): void {
		const { signal } = this.abortController;

		// Start: pointerdown (for range) or click/input (for color picker)
		element.addEventListener(
			"pointerdown",
			() => {
				const wasInactive = this.currentControlId === null;
				this.dragActive = true;
				this.currentControlId = controlId;
				if (wasInactive) {
					this.dragStartCallback?.(controlId);
				}
			},
			{ signal }
		);

		// During: input events (live updates)
		element.addEventListener("input", onInput, { signal });

		// End: blur event (drag complete - fires when picker closes regardless of value change)
		element.addEventListener(
			"blur",
			() => {
				// Only end the drag if THIS specific control is the active one
				if (this.dragActive && this.currentControlId === controlId) {
					this.dragActive = false;
					this.currentControlId = null;
					this.dragEndCallback?.(controlId);
				}
			},
			{ signal }
		);
	}

	constructor() {
		injectShotstackStyles();
	}

	mount(parent: HTMLElement): void {
		this.container = document.createElement("div");
		this.container.className = "ss-color-picker";

		this.container.innerHTML = `
			<div class="ss-color-picker-header">Background Fill</div>
			<div class="ss-color-picker-enable-row">
				<label class="ss-color-picker-enable-label">
					<input type="checkbox" class="ss-color-picker-enable-checkbox" ${this.enabled ? "checked" : ""} />
					<span>Enable Background</span>
				</label>
			</div>
			<div class="ss-color-picker-controls ${this.enabled ? "" : "disabled"}">
				<div class="ss-color-picker-color-section">
					<div class="ss-color-picker-label">Color</div>
					<div class="ss-color-picker-color-wrap">
						<input type="color" class="ss-color-picker-color" value="#FFFFFF" ${this.enabled ? "" : "disabled"} />
					</div>
				</div>
				<div class="ss-color-picker-opacity-section">
					<div class="ss-color-picker-label">Opacity</div>
					<div class="ss-color-picker-opacity-row">
						<input type="range" class="ss-toolbar-slider ss-color-picker-opacity" min="0" max="100" value="100" ${this.enabled ? "" : "disabled"} />
						<span class="ss-color-picker-opacity-value">100%</span>
					</div>
				</div>
			</div>
		`;

		parent.appendChild(this.container);

		this.enableCheckbox = this.container.querySelector(".ss-color-picker-enable-checkbox");
		this.colorInput = this.container.querySelector(".ss-color-picker-color");
		this.opacitySlider = this.container.querySelector(".ss-color-picker-opacity");
		this.opacityValue = this.container.querySelector(".ss-color-picker-opacity-value");

		// Enable checkbox also uses drag pattern for proper command history
		if (this.enableCheckbox) {
			this.enableCheckbox.addEventListener("pointerdown", this.handleEnableInteractionStart);
			this.enableCheckbox.addEventListener("change", this.handleEnableChange);
			this.enableCheckbox.addEventListener("blur", this.handleEnableInteractionEnd);
		}

		if (this.colorInput) {
			this.setupDragPattern(this.colorInput, "background-color", this.handleColorInput);
		}

		if (this.opacitySlider) {
			this.setupDragPattern(this.opacitySlider, "background-opacity", this.handleOpacityInput);
		}
	}

	private emitColorChange(controlId: string): void {
		if (this.onColorChange && this.colorInput && this.opacitySlider) {
			const color = this.colorInput.value;
			const opacity = parseInt(this.opacitySlider.value, 10) / 100;
			this.onColorChange(controlId, this.enabled, color, opacity);
		}
	}

	private updateControlsState(): void {
		const controls = this.container?.querySelector(".ss-color-picker-controls");
		if (controls) {
			controls.classList.toggle("disabled", !this.enabled);
		}

		if (this.colorInput) this.colorInput.disabled = !this.enabled;
		if (this.opacitySlider) this.opacitySlider.disabled = !this.enabled;
	}

	// Public API
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (this.enableCheckbox) {
			this.enableCheckbox.checked = enabled;
		}
		this.updateControlsState();
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	setColor(hex: string): void {
		this.currentColor = hex.toUpperCase();
		if (this.colorInput) {
			this.colorInput.value = this.currentColor;
		}
	}

	setOpacity(opacity: number): void {
		const opacityPercent = Math.round(Math.max(0, Math.min(100, opacity)));
		this.currentOpacity = opacityPercent / 100;
		if (this.opacitySlider) {
			this.opacitySlider.value = String(opacityPercent);
		}
		if (this.opacityValue) {
			this.opacityValue.textContent = `${opacityPercent}%`;
		}
	}

	getColor(): string {
		return this.currentColor;
	}

	getOpacity(): number {
		return this.currentOpacity;
	}

	onChange(callback: ColorChangeCallback): void {
		this.onColorChange = callback;
	}

	onDragStart(callback: DragCallback): void {
		this.dragStartCallback = callback;
	}

	onDragEnd(callback: DragCallback): void {
		this.dragEndCallback = callback;
	}

	isDragging(): boolean {
		return this.dragActive;
	}

	dispose(): void {
		// Abort all listeners registered via setupDragPattern
		this.abortController.abort();

		// Remove explicitly tracked handlers for checkbox
		if (this.enableCheckbox) {
			this.enableCheckbox.removeEventListener("pointerdown", this.handleEnableInteractionStart);
			this.enableCheckbox.removeEventListener("change", this.handleEnableChange);
			this.enableCheckbox.removeEventListener("blur", this.handleEnableInteractionEnd);
		}

		// Remove container from DOM
		this.container?.remove();

		// Clear references
		this.container = null;
		this.enableCheckbox = null;
		this.colorInput = null;
		this.opacitySlider = null;
		this.opacityValue = null;
		this.onColorChange = null;
		this.dragStartCallback = null;
		this.dragEndCallback = null;
	}
}
