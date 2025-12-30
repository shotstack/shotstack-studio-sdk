import { UIComponent } from "../primitives/UIComponent";

/**
 * State for all style properties.
 */
export interface StyleState {
	fill: {
		color: string;
		opacity: number;
	};
	border: {
		width: number;
		color: string;
		opacity: number;
		radius: number;
	};
	padding: {
		top: number;
		right: number;
		bottom: number;
		left: number;
	};
	shadow: {
		enabled: boolean;
		offsetX: number;
		offsetY: number;
		blur: number;
		color: string;
		opacity: number;
	};
}

type StyleTab = "fill" | "border" | "padding" | "shadow";

/**
 * A consolidated style panel with tabbed UI for Fill, Border, Padding, and Shadow.
 *
 * This composite replaces 4 separate toolbar buttons with a single "Style" dropdown
 * containing a tabbed panel. Follows video editor UX patterns for progressive disclosure.
 *
 * @example
 * ```typescript
 * const stylePanel = new StylePanel();
 * stylePanel.onFillChange(state => this.applyFill(state));
 * stylePanel.onBorderChange(state => this.applyBorder(state));
 * stylePanel.onPaddingChange(state => this.applyPadding(state));
 * stylePanel.onShadowChange(state => this.applyShadow(state));
 * stylePanel.mount(popupContainer);
 * ```
 */
export class StylePanel extends UIComponent<StyleState> {
	private activeTab: StyleTab = "fill";

	private state: StyleState = {
		fill: { color: "#000000", opacity: 100 },
		border: { width: 0, color: "#000000", opacity: 100, radius: 0 },
		padding: { top: 0, right: 0, bottom: 0, left: 0 },
		// blur is fixed at 4 - canvas only checks blur > 0, doesn't implement actual blur effect
		shadow: { enabled: false, offsetX: 0, offsetY: 0, blur: 4, color: "#000000", opacity: 50 }
	};

	// Callbacks for each section
	private fillChangeCallback: ((state: StyleState["fill"]) => void) | null = null;
	private borderChangeCallback: ((state: StyleState["border"]) => void) | null = null;
	private paddingChangeCallback: ((state: StyleState["padding"]) => void) | null = null;
	private shadowChangeCallback: ((state: StyleState["shadow"]) => void) | null = null;

	// DOM references
	private tabButtons: NodeListOf<HTMLButtonElement> | null = null;
	private tabPanels: NodeListOf<HTMLDivElement> | null = null;

	// Fill elements
	private fillColorPicker: HTMLDivElement | null = null;

	// Border elements
	private borderWidthSlider: HTMLInputElement | null = null;
	private borderWidthValue: HTMLSpanElement | null = null;
	private borderColorInput: HTMLInputElement | null = null;
	private borderOpacitySlider: HTMLInputElement | null = null;
	private borderOpacityValue: HTMLSpanElement | null = null;
	private borderRadiusSlider: HTMLInputElement | null = null;
	private borderRadiusValue: HTMLSpanElement | null = null;

	// Padding elements
	private paddingTopSlider: HTMLInputElement | null = null;
	private paddingTopValue: HTMLSpanElement | null = null;
	private paddingRightSlider: HTMLInputElement | null = null;
	private paddingRightValue: HTMLSpanElement | null = null;
	private paddingBottomSlider: HTMLInputElement | null = null;
	private paddingBottomValue: HTMLSpanElement | null = null;
	private paddingLeftSlider: HTMLInputElement | null = null;
	private paddingLeftValue: HTMLSpanElement | null = null;

	// Shadow elements (blur not exposed in UI - canvas doesn't implement actual blur effect)
	private shadowToggle: HTMLInputElement | null = null;
	private shadowOffsetXSlider: HTMLInputElement | null = null;
	private shadowOffsetXValue: HTMLSpanElement | null = null;
	private shadowOffsetYSlider: HTMLInputElement | null = null;
	private shadowOffsetYValue: HTMLSpanElement | null = null;
	private shadowColorInput: HTMLInputElement | null = null;
	private shadowOpacitySlider: HTMLInputElement | null = null;
	private shadowOpacityValue: HTMLSpanElement | null = null;

	render(): string {
		return `
			<div class="ss-style-tabs">
				<button class="ss-style-tab active" data-style-tab="fill">Fill</button>
				<button class="ss-style-tab" data-style-tab="border">Border</button>
				<button class="ss-style-tab" data-style-tab="padding">Padding</button>
				<button class="ss-style-tab" data-style-tab="shadow">Shadow</button>
			</div>
			<div class="ss-style-content">
				${this.renderFillTab()}
				${this.renderBorderTab()}
				${this.renderPaddingTab()}
				${this.renderShadowTab()}
			</div>
		`;
	}

	private renderFillTab(): string {
		return `
			<div class="ss-style-panel" data-tab-content="fill">
				<div data-fill-color-picker class="ss-style-color-picker-mount"></div>
			</div>
		`;
	}

	private renderBorderTab(): string {
		return `
			<div class="ss-style-panel" data-tab-content="border" style="display: none;">
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Width</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-border-width-slider class="ss-toolbar-slider" min="0" max="20" step="1" value="0" />
						<span data-border-width-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Color & Opacity</div>
					<div class="ss-toolbar-popup-row">
						<div class="ss-toolbar-color-wrap">
							<input type="color" data-border-color class="ss-toolbar-color" value="#000000" />
						</div>
						<input type="range" data-border-opacity-slider class="ss-toolbar-slider" min="0" max="100" value="100" />
						<span data-border-opacity-value class="ss-toolbar-popup-value">100</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Corner Rounding</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-border-radius-slider class="ss-toolbar-slider" min="0" max="100" step="1" value="0" />
						<span data-border-radius-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
			</div>
		`;
	}

	private renderPaddingTab(): string {
		return `
			<div class="ss-style-panel" data-tab-content="padding" style="display: none;">
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Top</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-padding-top-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
						<span data-padding-top-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Right</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-padding-right-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
						<span data-padding-right-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Bottom</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-padding-bottom-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
						<span data-padding-bottom-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Left</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-padding-left-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
						<span data-padding-left-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
			</div>
		`;
	}

	private renderShadowTab(): string {
		return `
			<div class="ss-style-panel" data-tab-content="shadow" style="display: none;">
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-row">
						<span class="ss-toolbar-popup-label">Enable Shadow</span>
						<input type="checkbox" data-shadow-toggle class="ss-toolbar-checkbox" />
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Offset X</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-shadow-offset-x class="ss-toolbar-slider" min="-20" max="20" value="0" />
						<span data-shadow-offset-x-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Offset Y</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-shadow-offset-y class="ss-toolbar-slider" min="-20" max="20" value="0" />
						<span data-shadow-offset-y-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Color & Opacity</div>
					<div class="ss-toolbar-popup-row">
						<div class="ss-toolbar-color-wrap">
							<input type="color" data-shadow-color class="ss-toolbar-color" value="#000000" />
						</div>
						<input type="range" data-shadow-opacity class="ss-toolbar-slider" min="0" max="100" value="50" />
						<span data-shadow-opacity-value class="ss-toolbar-popup-value">50</span>
					</div>
				</div>
			</div>
		`;
	}

	protected bindElements(): void {
		// Tab navigation
		this.tabButtons = this.container?.querySelectorAll("[data-style-tab]") ?? null;
		this.tabPanels = this.container?.querySelectorAll("[data-tab-content]") ?? null;

		// Fill (color picker will be mounted by parent)
		this.fillColorPicker = this.container?.querySelector("[data-fill-color-picker]") ?? null;

		// Border
		this.borderWidthSlider = this.container?.querySelector("[data-border-width-slider]") ?? null;
		this.borderWidthValue = this.container?.querySelector("[data-border-width-value]") ?? null;
		this.borderColorInput = this.container?.querySelector("[data-border-color]") ?? null;
		this.borderOpacitySlider = this.container?.querySelector("[data-border-opacity-slider]") ?? null;
		this.borderOpacityValue = this.container?.querySelector("[data-border-opacity-value]") ?? null;
		this.borderRadiusSlider = this.container?.querySelector("[data-border-radius-slider]") ?? null;
		this.borderRadiusValue = this.container?.querySelector("[data-border-radius-value]") ?? null;

		// Padding
		this.paddingTopSlider = this.container?.querySelector("[data-padding-top-slider]") ?? null;
		this.paddingTopValue = this.container?.querySelector("[data-padding-top-value]") ?? null;
		this.paddingRightSlider = this.container?.querySelector("[data-padding-right-slider]") ?? null;
		this.paddingRightValue = this.container?.querySelector("[data-padding-right-value]") ?? null;
		this.paddingBottomSlider = this.container?.querySelector("[data-padding-bottom-slider]") ?? null;
		this.paddingBottomValue = this.container?.querySelector("[data-padding-bottom-value]") ?? null;
		this.paddingLeftSlider = this.container?.querySelector("[data-padding-left-slider]") ?? null;
		this.paddingLeftValue = this.container?.querySelector("[data-padding-left-value]") ?? null;

		// Shadow (blur not exposed - canvas doesn't implement actual blur effect)
		this.shadowToggle = this.container?.querySelector("[data-shadow-toggle]") ?? null;
		this.shadowOffsetXSlider = this.container?.querySelector("[data-shadow-offset-x]") ?? null;
		this.shadowOffsetXValue = this.container?.querySelector("[data-shadow-offset-x-value]") ?? null;
		this.shadowOffsetYSlider = this.container?.querySelector("[data-shadow-offset-y]") ?? null;
		this.shadowOffsetYValue = this.container?.querySelector("[data-shadow-offset-y-value]") ?? null;
		this.shadowColorInput = this.container?.querySelector("[data-shadow-color]") ?? null;
		this.shadowOpacitySlider = this.container?.querySelector("[data-shadow-opacity]") ?? null;
		this.shadowOpacityValue = this.container?.querySelector("[data-shadow-opacity-value]") ?? null;
	}

	protected setupEvents(): void {
		// Tab switching
		this.tabButtons?.forEach(btn => {
			this.events.on(btn, "click", () => {
				const tab = btn.dataset["styleTab"] as StyleTab;
				this.switchTab(tab);
			});
		});

		// Border events
		this.setupBorderEvents();

		// Padding events
		this.setupPaddingEvents();

		// Shadow events
		this.setupShadowEvents();
	}

	private setupBorderEvents(): void {
		if (this.borderWidthSlider) {
			this.events.on(this.borderWidthSlider, "input", () => {
				this.state.border.width = parseInt(this.borderWidthSlider!.value, 10);
				this.updateBorderWidthDisplay();
				this.emitBorderChange();
			});
		}
		if (this.borderColorInput) {
			this.events.on(this.borderColorInput, "input", () => {
				this.state.border.color = this.borderColorInput!.value;
				this.emitBorderChange();
			});
		}
		if (this.borderOpacitySlider) {
			this.events.on(this.borderOpacitySlider, "input", () => {
				this.state.border.opacity = parseInt(this.borderOpacitySlider!.value, 10);
				this.updateBorderOpacityDisplay();
				this.emitBorderChange();
			});
		}
		if (this.borderRadiusSlider) {
			this.events.on(this.borderRadiusSlider, "input", () => {
				this.state.border.radius = parseInt(this.borderRadiusSlider!.value, 10);
				this.updateBorderRadiusDisplay();
				this.emitBorderChange();
			});
		}
	}

	private setupPaddingEvents(): void {
		const sliders = [
			{ slider: this.paddingTopSlider, key: "top" as const },
			{ slider: this.paddingRightSlider, key: "right" as const },
			{ slider: this.paddingBottomSlider, key: "bottom" as const },
			{ slider: this.paddingLeftSlider, key: "left" as const }
		];

		sliders.forEach(({ slider, key }) => {
			if (slider) {
				this.events.on(slider, "input", () => {
					this.state.padding[key] = parseInt(slider.value, 10);
					this.updatePaddingDisplay(key);
					this.emitPaddingChange();
				});
			}
		});
	}

	private setupShadowEvents(): void {
		// Visible defaults when enabling shadow for the first time
		// Note: blur is fixed at 4 (canvas only checks blur > 0, doesn't implement actual blur)
		const SHADOW_DEFAULTS = { offsetX: 2, offsetY: 2, blur: 4, color: "#000000", opacity: 50 };

		// Auto-enable shadow when any slider is changed (better UX)
		const autoEnableAndEmit = (): void => {
			if (!this.state.shadow.enabled) {
				this.state.shadow.enabled = true;
				if (this.shadowToggle) this.shadowToggle.checked = true;
			}
			this.emitShadowChange();
		};

		if (this.shadowToggle) {
			this.events.on(this.shadowToggle, "change", () => {
				const enabling = this.shadowToggle!.checked;
				this.state.shadow.enabled = enabling;

				// Apply visible defaults when enabling shadow with zeroed offsets
				if (enabling && this.state.shadow.offsetX === 0 && this.state.shadow.offsetY === 0) {
					this.state.shadow = { ...this.state.shadow, enabled: true, ...SHADOW_DEFAULTS };
					this.updateShadowUI();
				}

				this.emitShadowChange();
			});
		}
		if (this.shadowOffsetXSlider) {
			this.events.on(this.shadowOffsetXSlider, "input", () => {
				this.state.shadow.offsetX = parseInt(this.shadowOffsetXSlider!.value, 10);
				this.updateShadowOffsetXDisplay();
				autoEnableAndEmit();
			});
		}
		if (this.shadowOffsetYSlider) {
			this.events.on(this.shadowOffsetYSlider, "input", () => {
				this.state.shadow.offsetY = parseInt(this.shadowOffsetYSlider!.value, 10);
				this.updateShadowOffsetYDisplay();
				autoEnableAndEmit();
			});
		}
		// Note: blur slider removed - canvas doesn't implement actual blur effect
		if (this.shadowColorInput) {
			this.events.on(this.shadowColorInput, "input", () => {
				this.state.shadow.color = this.shadowColorInput!.value;
				autoEnableAndEmit();
			});
		}
		if (this.shadowOpacitySlider) {
			this.events.on(this.shadowOpacitySlider, "input", () => {
				this.state.shadow.opacity = parseInt(this.shadowOpacitySlider!.value, 10);
				this.updateShadowOpacityDisplay();
				autoEnableAndEmit();
			});
		}
	}

	// ─── Tab Switching ────────────────────────────────────────────────────────

	private switchTab(tab: StyleTab): void {
		this.activeTab = tab;

		// Update tab button active state
		this.tabButtons?.forEach(btn => {
			btn.classList.toggle("active", btn.dataset["styleTab"] === tab);
		});

		// Show/hide tab panels
		this.tabPanels?.forEach(el => {
			const isActive = el.dataset["tabContent"] === tab;
			el.style.display = isActive ? "block" : "none"; // eslint-disable-line no-param-reassign -- DOM manipulation
		});
	}

	// ─── Callbacks ────────────────────────────────────────────────────────────

	onFillChange(callback: (state: StyleState["fill"]) => void): void {
		this.fillChangeCallback = callback;
	}

	onBorderChange(callback: (state: StyleState["border"]) => void): void {
		this.borderChangeCallback = callback;
	}

	onPaddingChange(callback: (state: StyleState["padding"]) => void): void {
		this.paddingChangeCallback = callback;
	}

	onShadowChange(callback: (state: StyleState["shadow"]) => void): void {
		this.shadowChangeCallback = callback;
	}

	private emitBorderChange(): void {
		this.borderChangeCallback?.({ ...this.state.border });
		this.emit(this.state);
	}

	private emitPaddingChange(): void {
		this.paddingChangeCallback?.({ ...this.state.padding });
		this.emit(this.state);
	}

	private emitShadowChange(): void {
		this.shadowChangeCallback?.({ ...this.state.shadow });
		this.emit(this.state);
	}

	// ─── State Setters ────────────────────────────────────────────────────────

	/**
	 * Get the fill color picker mount point for external ColorPicker.
	 */
	getFillColorPickerMount(): HTMLDivElement | null {
		return this.fillColorPicker;
	}

	/**
	 * Set fill state (called by parent when ColorPicker changes).
	 */
	setFillState(state: Partial<StyleState["fill"]>): void {
		this.state.fill = { ...this.state.fill, ...state };
	}

	/**
	 * Set border state from clip data.
	 */
	setBorderState(state: Partial<StyleState["border"]>): void {
		this.state.border = { ...this.state.border, ...state };
		this.updateBorderUI();
	}

	/**
	 * Set padding state from clip data.
	 */
	setPaddingState(state: Partial<StyleState["padding"]>): void {
		this.state.padding = { ...this.state.padding, ...state };
		this.updatePaddingUI();
	}

	/**
	 * Set shadow state from clip data.
	 */
	setShadowState(state: Partial<StyleState["shadow"]>): void {
		this.state.shadow = { ...this.state.shadow, ...state };
		this.updateShadowUI();
	}

	/**
	 * Get current full state (immutable copy).
	 */
	getState(): StyleState {
		return {
			fill: { ...this.state.fill },
			border: { ...this.state.border },
			padding: { ...this.state.padding },
			shadow: { ...this.state.shadow }
		};
	}

	// ─── UI Updates ───────────────────────────────────────────────────────────

	private updateBorderUI(): void {
		if (this.borderWidthSlider) this.borderWidthSlider.value = String(this.state.border.width);
		if (this.borderColorInput) this.borderColorInput.value = this.state.border.color;
		if (this.borderOpacitySlider) this.borderOpacitySlider.value = String(this.state.border.opacity);
		if (this.borderRadiusSlider) this.borderRadiusSlider.value = String(this.state.border.radius);
		this.updateBorderWidthDisplay();
		this.updateBorderOpacityDisplay();
		this.updateBorderRadiusDisplay();
	}

	private updatePaddingUI(): void {
		if (this.paddingTopSlider) this.paddingTopSlider.value = String(this.state.padding.top);
		if (this.paddingRightSlider) this.paddingRightSlider.value = String(this.state.padding.right);
		if (this.paddingBottomSlider) this.paddingBottomSlider.value = String(this.state.padding.bottom);
		if (this.paddingLeftSlider) this.paddingLeftSlider.value = String(this.state.padding.left);
		this.updatePaddingDisplay("top");
		this.updatePaddingDisplay("right");
		this.updatePaddingDisplay("bottom");
		this.updatePaddingDisplay("left");
	}

	private updateShadowUI(): void {
		if (this.shadowToggle) this.shadowToggle.checked = this.state.shadow.enabled;
		if (this.shadowOffsetXSlider) this.shadowOffsetXSlider.value = String(this.state.shadow.offsetX);
		if (this.shadowOffsetYSlider) this.shadowOffsetYSlider.value = String(this.state.shadow.offsetY);
		if (this.shadowColorInput) this.shadowColorInput.value = this.state.shadow.color;
		if (this.shadowOpacitySlider) this.shadowOpacitySlider.value = String(this.state.shadow.opacity);
		this.updateShadowOffsetXDisplay();
		this.updateShadowOffsetYDisplay();
		this.updateShadowOpacityDisplay();
	}

	private updateBorderWidthDisplay(): void {
		if (this.borderWidthValue) this.borderWidthValue.textContent = String(this.state.border.width);
	}

	private updateBorderOpacityDisplay(): void {
		if (this.borderOpacityValue) this.borderOpacityValue.textContent = String(this.state.border.opacity);
	}

	private updateBorderRadiusDisplay(): void {
		if (this.borderRadiusValue) this.borderRadiusValue.textContent = String(this.state.border.radius);
	}

	private updatePaddingDisplay(key: keyof StyleState["padding"]): void {
		const valueMap = {
			top: this.paddingTopValue,
			right: this.paddingRightValue,
			bottom: this.paddingBottomValue,
			left: this.paddingLeftValue
		};
		const el = valueMap[key];
		if (el) el.textContent = String(this.state.padding[key]);
	}

	private updateShadowOffsetXDisplay(): void {
		if (this.shadowOffsetXValue) this.shadowOffsetXValue.textContent = String(this.state.shadow.offsetX);
	}

	private updateShadowOffsetYDisplay(): void {
		if (this.shadowOffsetYValue) this.shadowOffsetYValue.textContent = String(this.state.shadow.offsetY);
	}

	private updateShadowOpacityDisplay(): void {
		if (this.shadowOpacityValue) this.shadowOpacityValue.textContent = String(this.state.shadow.opacity);
	}
}
