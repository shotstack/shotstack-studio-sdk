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
	stroke: {
		width: number;
		color: string;
		opacity: number;
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

export type StyleTab = "fill" | "border" | "stroke" | "padding" | "shadow";

export interface StylePanelOptions {
	hideTabs?: StyleTab[];
}

/**
 * A consolidated style panel with tabbed UI for Fill, Border, Stroke, Padding, and Shadow.
 *
 * This composite replaces separate toolbar buttons with a single "Style" dropdown
 * containing a tabbed panel. Follows video editor UX patterns for progressive disclosure.
 *
 * @example
 * ```typescript
 * const stylePanel = new StylePanel({ hideTabs: ["border"] });
 * stylePanel.onFillChange(state => this.applyFill(state));
 * stylePanel.onStrokeChange(state => this.applyStroke(state));
 * stylePanel.mount(popupContainer);
 * ```
 */
export class StylePanel extends UIComponent<StyleState> {
	private activeTab: StyleTab = "fill";
	private hiddenTabs: Set<StyleTab>;

	private state: StyleState = {
		fill: { color: "#000000", opacity: 100 },
		border: { width: 0, color: "#000000", opacity: 100, radius: 0 },
		stroke: { width: 0, color: "#000000", opacity: 100 },
		padding: { top: 0, right: 0, bottom: 0, left: 0 },
		// blur is fixed at 4 - canvas only checks blur > 0, doesn't implement actual blur effect
		shadow: { enabled: false, offsetX: 0, offsetY: 0, blur: 4, color: "#000000", opacity: 50 }
	};

	// Callbacks for each section
	private fillChangeCallback: ((state: StyleState["fill"]) => void) | null = null;
	private borderChangeCallback: ((state: StyleState["border"]) => void) | null = null;
	private strokeChangeCallback: ((state: StyleState["stroke"]) => void) | null = null;
	private paddingChangeCallback: ((state: StyleState["padding"]) => void) | null = null;
	private shadowChangeCallback: ((state: StyleState["shadow"]) => void) | null = null;

	// Two-phase pattern callbacks
	private dragStartCallback: (() => void) | null = null;
	private dragEndCallback: (() => void) | null = null;

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

	// Stroke elements
	private strokeWidthSlider: HTMLInputElement | null = null;
	private strokeWidthValue: HTMLSpanElement | null = null;
	private strokeColorInput: HTMLInputElement | null = null;
	private strokeOpacitySlider: HTMLInputElement | null = null;
	private strokeOpacityValue: HTMLSpanElement | null = null;

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

	// Two-phase pattern: Track if drag is active
	private borderDragActive: boolean = false;
	private strokeDragActive: boolean = false;
	private paddingDragActive: boolean = false;
	private shadowDragActive: boolean = false;

	constructor(options: StylePanelOptions = {}) {
		super();
		this.hiddenTabs = new Set(options.hideTabs ?? []);
	}

	render(): string {
		return `
			<div class="ss-style-tabs">
				<button class="ss-style-tab active" data-style-tab="fill">Fill</button>
				<button class="ss-style-tab" data-style-tab="border">Border</button>
				<button class="ss-style-tab" data-style-tab="stroke">Stroke</button>
				<button class="ss-style-tab" data-style-tab="padding">Padding</button>
				<button class="ss-style-tab" data-style-tab="shadow">Shadow</button>
			</div>
			<div class="ss-style-content">
				${this.renderFillTab()}
				${this.renderBorderTab()}
				${this.renderStrokeTab()}
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
					<div class="ss-toolbar-popup-label" data-merge-path="asset.border.width" data-merge-prefix="TEXT_BORDER_WIDTH">Width</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-border-width-slider class="ss-toolbar-slider" min="0" max="20" step="1" value="0" />
						<span data-border-width-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label" data-merge-path="asset.border.color" data-merge-prefix="TEXT_BORDER_COLOR">Color & Opacity</div>
					<div class="ss-toolbar-popup-row">
						<div class="ss-toolbar-color-wrap">
							<input type="color" data-border-color class="ss-toolbar-color" value="#000000" />
						</div>
						<input type="range" data-border-opacity-slider class="ss-toolbar-slider" min="0" max="100" value="100" />
						<span data-border-opacity-value class="ss-toolbar-popup-value">100</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label" data-merge-path="asset.border.radius" data-merge-prefix="TEXT_BORDER_RADIUS">Corner Rounding</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-border-radius-slider class="ss-toolbar-slider" min="0" max="100" step="1" value="0" />
						<span data-border-radius-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
			</div>
		`;
	}

	private renderStrokeTab(): string {
		return `
			<div class="ss-style-panel" data-tab-content="stroke" style="display: none;">
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Width</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-stroke-width-slider class="ss-toolbar-slider" min="0" max="20" step="1" value="0" />
						<span data-stroke-width-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Color & Opacity</div>
					<div class="ss-toolbar-popup-row">
						<div class="ss-toolbar-color-wrap">
							<input type="color" data-stroke-color class="ss-toolbar-color" value="#000000" />
						</div>
						<input type="range" data-stroke-opacity-slider class="ss-toolbar-slider" min="0" max="100" value="100" />
						<span data-stroke-opacity-value class="ss-toolbar-popup-value">100</span>
					</div>
				</div>
			</div>
		`;
	}

	private renderPaddingTab(): string {
		return `
			<div class="ss-style-panel" data-tab-content="padding" style="display: none;">
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label" data-merge-path="asset.padding.top" data-merge-prefix="TEXT_PADDING_TOP">Top</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-padding-top-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
						<span data-padding-top-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label" data-merge-path="asset.padding.right" data-merge-prefix="TEXT_PADDING_RIGHT">Right</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-padding-right-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
						<span data-padding-right-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label" data-merge-path="asset.padding.bottom" data-merge-prefix="TEXT_PADDING_BOTTOM">Bottom</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-padding-bottom-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
						<span data-padding-bottom-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label" data-merge-path="asset.padding.left" data-merge-prefix="TEXT_PADDING_LEFT">Left</div>
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
					<div class="ss-toolbar-popup-label" data-merge-path="asset.shadow.offsetX" data-merge-prefix="TEXT_SHADOW_X">Offset X</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-shadow-offset-x class="ss-toolbar-slider" min="-20" max="20" value="0" />
						<span data-shadow-offset-x-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label" data-merge-path="asset.shadow.offsetY" data-merge-prefix="TEXT_SHADOW_Y">Offset Y</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-shadow-offset-y class="ss-toolbar-slider" min="-20" max="20" value="0" />
						<span data-shadow-offset-y-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label" data-merge-path="asset.shadow.color" data-merge-prefix="TEXT_SHADOW_COLOR">Color & Opacity</div>
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

		// Stroke
		this.strokeWidthSlider = this.container?.querySelector("[data-stroke-width-slider]") ?? null;
		this.strokeWidthValue = this.container?.querySelector("[data-stroke-width-value]") ?? null;
		this.strokeColorInput = this.container?.querySelector("[data-stroke-color]") ?? null;
		this.strokeOpacitySlider = this.container?.querySelector("[data-stroke-opacity-slider]") ?? null;
		this.strokeOpacityValue = this.container?.querySelector("[data-stroke-opacity-value]") ?? null;

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

		// Apply hideTabs — remove tab buttons and panels for hidden tabs
		this.applyHiddenTabs();
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

		// Stroke events
		this.setupStrokeEvents();

		// Padding events
		this.setupPaddingEvents();

		// Shadow events
		this.setupShadowEvents();
	}

	// ─── Hidden Tabs ──────────────────────────────────────────────────────

	private applyHiddenTabs(): void {
		if (this.hiddenTabs.size === 0) return;

		// Hide tab buttons
		this.tabButtons?.forEach(btn => {
			const tab = btn.dataset["styleTab"] as StyleTab;
			if (this.hiddenTabs.has(tab)) {
				btn.style.display = "none"; // eslint-disable-line no-param-reassign -- DOM manipulation
			}
		});

		// Hide tab panels
		this.tabPanels?.forEach(el => {
			const tab = el.dataset["tabContent"] as StyleTab;
			if (this.hiddenTabs.has(tab)) {
				el.style.display = "none"; // eslint-disable-line no-param-reassign -- DOM manipulation
			}
		});

		// If the active tab is hidden, switch to the first visible tab
		if (this.hiddenTabs.has(this.activeTab)) {
			const allTabs: StyleTab[] = ["fill", "border", "stroke", "padding", "shadow"];
			const firstVisible = allTabs.find(t => !this.hiddenTabs.has(t));
			if (firstVisible) this.switchTab(firstVisible);
		}
	}

	// ─── Phase 2 Helper Methods ────────────────────────────────────

	/**
	 * Update border value display for a specific property.
	 */
	private updateBorderValueDisplay(property: "width" | "opacity" | "radius"): void {
		const valueMap = {
			width: this.borderWidthValue,
			opacity: this.borderOpacityValue,
			radius: this.borderRadiusValue
		};
		const el = valueMap[property];
		if (el) el.textContent = String(this.state.border[property]);
	}

	/**
	 * Update stroke value display for a specific property.
	 */
	private updateStrokeValueDisplay(property: "width" | "opacity"): void {
		const valueMap = {
			width: this.strokeWidthValue,
			opacity: this.strokeOpacityValue
		};
		const el = valueMap[property];
		if (el) el.textContent = String(this.state.stroke[property]);
	}

	/**
	 * Update shadow value display for a specific property.
	 */
	private updateShadowValueDisplay(property: "offsetX" | "offsetY" | "opacity"): void {
		const valueMap = {
			offsetX: this.shadowOffsetXValue,
			offsetY: this.shadowOffsetYValue,
			opacity: this.shadowOpacityValue
		};
		const el = valueMap[property];
		if (el) el.textContent = String(this.state.shadow[property]);
	}

	private setupBorderEvents(): void {
		// Phase 1: Save state on pointerdown (parent will handle initial state capture)
		const setupBorderPointerdown = (element: HTMLInputElement | null): void => {
			if (element) {
				this.events.on(element, "pointerdown", () => {
					const wasInactive = !this.borderDragActive;
					this.borderDragActive = true;
					if (wasInactive) {
						this.dragStartCallback?.();
					}
				});
			}
		};

		setupBorderPointerdown(this.borderWidthSlider);
		setupBorderPointerdown(this.borderColorInput);
		setupBorderPointerdown(this.borderOpacitySlider);
		setupBorderPointerdown(this.borderRadiusSlider);

		// Phase 2: Live update during drag (emit on every input for visual feedback)
		if (this.borderWidthSlider) {
			this.events.on(this.borderWidthSlider, "input", () => {
				this.state.border.width = parseInt(this.borderWidthSlider!.value, 10);
				this.updateBorderValueDisplay("width");
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
				this.updateBorderValueDisplay("opacity");
				this.emitBorderChange();
			});
		}
		if (this.borderRadiusSlider) {
			this.events.on(this.borderRadiusSlider, "input", () => {
				this.state.border.radius = parseInt(this.borderRadiusSlider!.value, 10);
				this.updateBorderValueDisplay("radius");
				this.emitBorderChange();
			});
		}

		// Phase 3: Mark drag complete on release
		const onBorderDragEnd = (): void => {
			if (this.borderDragActive) {
				this.borderDragActive = false;
				this.dragEndCallback?.();
			}
		};

		if (this.borderWidthSlider) this.events.on(this.borderWidthSlider, "change", onBorderDragEnd);
		if (this.borderColorInput) this.events.on(this.borderColorInput, "change", onBorderDragEnd);
		if (this.borderOpacitySlider) this.events.on(this.borderOpacitySlider, "change", onBorderDragEnd);
		if (this.borderRadiusSlider) this.events.on(this.borderRadiusSlider, "change", onBorderDragEnd);
	}

	private setupStrokeEvents(): void {
		// Phase 1: Mark drag active on pointerdown
		const setupStrokePointerdown = (element: HTMLInputElement | null): void => {
			if (element) {
				this.events.on(element, "pointerdown", () => {
					const wasInactive = !this.strokeDragActive;
					this.strokeDragActive = true;
					if (wasInactive) {
						this.dragStartCallback?.();
					}
				});
			}
		};

		setupStrokePointerdown(this.strokeWidthSlider);
		setupStrokePointerdown(this.strokeColorInput);
		setupStrokePointerdown(this.strokeOpacitySlider);

		// Phase 2: Live update during drag
		if (this.strokeWidthSlider) {
			this.events.on(this.strokeWidthSlider, "input", () => {
				this.state.stroke.width = parseInt(this.strokeWidthSlider!.value, 10);
				this.updateStrokeValueDisplay("width");
				this.emitStrokeChange();
			});
		}
		if (this.strokeColorInput) {
			this.events.on(this.strokeColorInput, "input", () => {
				this.state.stroke.color = this.strokeColorInput!.value;
				this.emitStrokeChange();
			});
		}
		if (this.strokeOpacitySlider) {
			this.events.on(this.strokeOpacitySlider, "input", () => {
				this.state.stroke.opacity = parseInt(this.strokeOpacitySlider!.value, 10);
				this.updateStrokeValueDisplay("opacity");
				this.emitStrokeChange();
			});
		}

		// Phase 3: Mark drag complete on release
		const onStrokeDragEnd = (): void => {
			if (this.strokeDragActive) {
				this.strokeDragActive = false;
				this.dragEndCallback?.();
			}
		};

		if (this.strokeWidthSlider) this.events.on(this.strokeWidthSlider, "change", onStrokeDragEnd);
		if (this.strokeColorInput) this.events.on(this.strokeColorInput, "change", onStrokeDragEnd);
		if (this.strokeOpacitySlider) this.events.on(this.strokeOpacitySlider, "change", onStrokeDragEnd);
	}

	private setupPaddingEvents(): void {
		const sliders = [
			{ slider: this.paddingTopSlider, key: "top" as const },
			{ slider: this.paddingRightSlider, key: "right" as const },
			{ slider: this.paddingBottomSlider, key: "bottom" as const },
			{ slider: this.paddingLeftSlider, key: "left" as const }
		];

		// Phase 1: Mark drag active on pointerdown
		sliders.forEach(({ slider }) => {
			if (slider) {
				this.events.on(slider, "pointerdown", () => {
					const wasInactive = !this.paddingDragActive;
					this.paddingDragActive = true;
					if (wasInactive) {
						this.dragStartCallback?.();
					}
				});
			}
		});

		// Phase 2: Live update during drag (emit on every input for visual feedback)
		sliders.forEach(({ slider, key }) => {
			if (slider) {
				this.events.on(slider, "input", () => {
					const value = parseInt(slider.value, 10);
					this.state.padding[key] = value;
					this.updatePaddingDisplay(key);
					this.emitPaddingChange();
				});
			}
		});

		// Phase 3: Mark drag complete on release
		sliders.forEach(({ slider }) => {
			if (slider) {
				this.events.on(slider, "change", () => {
					if (this.paddingDragActive) {
						this.paddingDragActive = false;
						this.dragEndCallback?.();
					}
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

		// Phase 1: Mark drag active on pointerdown
		const setupShadowPointerdown = (element: HTMLInputElement | null): void => {
			if (element) {
				this.events.on(element, "pointerdown", () => {
					const wasInactive = !this.shadowDragActive;
					this.shadowDragActive = true;
					if (wasInactive) {
						this.dragStartCallback?.();
					}
				});
			}
		};

		setupShadowPointerdown(this.shadowOffsetXSlider);
		setupShadowPointerdown(this.shadowOffsetYSlider);
		setupShadowPointerdown(this.shadowColorInput);
		setupShadowPointerdown(this.shadowOpacitySlider);

		// Toggle is a discrete action - emit immediately (no dragging involved)
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

		// Phase 2: Live update during drag (emit on every input for visual feedback)
		if (this.shadowOffsetXSlider) {
			this.events.on(this.shadowOffsetXSlider, "input", () => {
				this.state.shadow.offsetX = parseInt(this.shadowOffsetXSlider!.value, 10);
				this.updateShadowValueDisplay("offsetX");
				autoEnableAndEmit();
			});
		}
		if (this.shadowOffsetYSlider) {
			this.events.on(this.shadowOffsetYSlider, "input", () => {
				this.state.shadow.offsetY = parseInt(this.shadowOffsetYSlider!.value, 10);
				this.updateShadowValueDisplay("offsetY");
				autoEnableAndEmit();
			});
		}
		if (this.shadowColorInput) {
			this.events.on(this.shadowColorInput, "input", () => {
				this.state.shadow.color = this.shadowColorInput!.value;
				autoEnableAndEmit();
			});
		}
		if (this.shadowOpacitySlider) {
			this.events.on(this.shadowOpacitySlider, "input", () => {
				this.state.shadow.opacity = parseInt(this.shadowOpacitySlider!.value, 10);
				this.updateShadowValueDisplay("opacity");
				autoEnableAndEmit();
			});
		}

		// Phase 3: Mark drag complete on release
		const onShadowDragEnd = (): void => {
			if (this.shadowDragActive) {
				this.shadowDragActive = false;
				this.dragEndCallback?.();
			}
		};

		if (this.shadowOffsetXSlider) this.events.on(this.shadowOffsetXSlider, "change", onShadowDragEnd);
		if (this.shadowOffsetYSlider) this.events.on(this.shadowOffsetYSlider, "change", onShadowDragEnd);
		if (this.shadowColorInput) this.events.on(this.shadowColorInput, "change", onShadowDragEnd);
		if (this.shadowOpacitySlider) this.events.on(this.shadowOpacitySlider, "change", onShadowDragEnd);
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
			const panelTab = el.dataset["tabContent"] as StyleTab;
			const isActive = panelTab === tab;
			const isHidden = this.hiddenTabs.has(panelTab);
			el.style.display = isActive && !isHidden ? "block" : "none"; // eslint-disable-line no-param-reassign -- DOM manipulation
		});
	}

	// ─── Callbacks ────────────────────────────────────────────────────────────

	onFillChange(callback: (state: StyleState["fill"]) => void): void {
		this.fillChangeCallback = callback;
	}

	onBorderChange(callback: (state: StyleState["border"]) => void): void {
		this.borderChangeCallback = callback;
	}

	onStrokeChange(callback: (state: StyleState["stroke"]) => void): void {
		this.strokeChangeCallback = callback;
	}

	onPaddingChange(callback: (state: StyleState["padding"]) => void): void {
		this.paddingChangeCallback = callback;
	}

	onShadowChange(callback: (state: StyleState["shadow"]) => void): void {
		this.shadowChangeCallback = callback;
	}

	/**
	 * Register callback for drag start (when pointerdown occurs on any slider).
	 */
	onDragStart(callback: () => void): void {
		this.dragStartCallback = callback;
	}

	/**
	 * Register callback for drag end (when change event occurs on any slider).
	 */
	onDragEnd(callback: () => void): void {
		this.dragEndCallback = callback;
	}

	private emitBorderChange(): void {
		this.borderChangeCallback?.({ ...this.state.border });
		this.emit(this.state);
	}

	private emitStrokeChange(): void {
		this.strokeChangeCallback?.({ ...this.state.stroke });
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
	 * Set stroke state from clip data.
	 */
	setStrokeState(state: Partial<StyleState["stroke"]>): void {
		this.state.stroke = { ...this.state.stroke, ...state };
		this.updateStrokeUI();
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
			stroke: { ...this.state.stroke },
			padding: { ...this.state.padding },
			shadow: { ...this.state.shadow }
		};
	}

	/**
	 * Check if any property is currently being dragged.
	 * @internal Used by parent to determine if live updates should skip command creation.
	 */
	isDragging(): boolean {
		return this.borderDragActive || this.strokeDragActive || this.paddingDragActive || this.shadowDragActive;
	}

	// ─── UI Updates ───────────────────────────────────────────────────────────

	private updateBorderUI(): void {
		if (this.borderWidthSlider) this.borderWidthSlider.value = String(this.state.border.width);
		if (this.borderColorInput) this.borderColorInput.value = this.state.border.color;
		if (this.borderOpacitySlider) this.borderOpacitySlider.value = String(this.state.border.opacity);
		if (this.borderRadiusSlider) this.borderRadiusSlider.value = String(this.state.border.radius);
		this.updateBorderValueDisplay("width");
		this.updateBorderValueDisplay("opacity");
		this.updateBorderValueDisplay("radius");
	}

	private updateStrokeUI(): void {
		if (this.strokeWidthSlider) this.strokeWidthSlider.value = String(this.state.stroke.width);
		if (this.strokeColorInput) this.strokeColorInput.value = this.state.stroke.color;
		if (this.strokeOpacitySlider) this.strokeOpacitySlider.value = String(this.state.stroke.opacity);
		this.updateStrokeValueDisplay("width");
		this.updateStrokeValueDisplay("opacity");
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
		this.updateShadowValueDisplay("offsetX");
		this.updateShadowValueDisplay("offsetY");
		this.updateShadowValueDisplay("opacity");
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

	// ─── Disposal ─────────────────────────────────────────────────────────────

	override dispose(): void {
		// Clear drag state
		this.borderDragActive = false;
		this.strokeDragActive = false;
		this.paddingDragActive = false;
		this.shadowDragActive = false;
		super.dispose();
	}
}
