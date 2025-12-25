import type { Edit } from "@core/edit-session";
import type { MergeField } from "@core/merge";
import { validateAssetUrl } from "@core/shared/utils";
import { injectShotstackStyles } from "@styles/inject";

type ResolutionChangeCallback = (width: number, height: number) => void;
type FpsChangeCallback = (fps: number) => void;
type BackgroundChangeCallback = (color: string) => void;

interface ResolutionPreset {
	label: string;
	sublabel: string;
	width: number;
	height: number;
}

const RESOLUTION_PRESETS: ResolutionPreset[] = [
	{ label: "1920 × 1080", sublabel: "16:9 • 1080p", width: 1920, height: 1080 },
	{ label: "1280 × 720", sublabel: "16:9 • 720p", width: 1280, height: 720 },
	{ label: "1080 × 1920", sublabel: "9:16 • Vertical", width: 1080, height: 1920 },
	{ label: "1080 × 1080", sublabel: "1:1 • Square", width: 1080, height: 1080 },
	{ label: "1080 × 1350", sublabel: "4:5 • Portrait", width: 1080, height: 1350 }
];

const FPS_OPTIONS = [24, 25, 30, 60];

const COLOR_SWATCHES = [
	"#000000",
	"#FFFFFF",
	"#1a1a1a",
	"#374151",
	"#6B7280",
	"#9CA3AF",
	"#EF4444",
	"#F97316",
	"#EAB308",
	"#22C55E",
	"#3B82F6",
	"#8B5CF6"
];

// SVG Icons
const ICONS = {
	monitor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
	check: `<svg class="checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
	variables: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5H9a2 2 0 0 0-2 2v2c0 1-.6 3-3 3 1 0 3 .6 3 3v2a2 2 0 0 0 2 2h.5m5-14h.5a2 2 0 0 1 2 2v2c0 1 .6 3 3 3-1 0-3 .6-3 3v2a2 2 0 0 1-2 2h-.5"/></svg>`
};

export class CanvasToolbar {
	private container: HTMLDivElement | null = null;
	private edit: Edit | null = null;

	// Current state
	private currentWidth: number = 1920;
	private currentHeight: number = 1080;
	private currentFps: number = 25;
	private currentBgColor: string = "#000000";

	// Popup elements
	private resolutionPopup: HTMLDivElement | null = null;
	private backgroundPopup: HTMLDivElement | null = null;
	private fpsPopup: HTMLDivElement | null = null;
	private variablesPopup: HTMLDivElement | null = null;

	// Button elements
	private resolutionBtn: HTMLButtonElement | null = null;
	private backgroundBtn: HTMLButtonElement | null = null;
	private fpsBtn: HTMLButtonElement | null = null;
	private variablesBtn: HTMLButtonElement | null = null;

	// Variables elements
	private variablesList: HTMLDivElement | null = null;
	private variablesEmpty: HTMLDivElement | null = null;

	// Label elements
	private resolutionLabel: HTMLSpanElement | null = null;
	private fpsLabel: HTMLSpanElement | null = null;
	private bgColorDot: HTMLSpanElement | null = null;

	// Custom size inputs
	private customWidthInput: HTMLInputElement | null = null;
	private customHeightInput: HTMLInputElement | null = null;

	// Color input
	private colorInput: HTMLInputElement | null = null;

	// Callbacks
	private resolutionChangeCallback: ResolutionChangeCallback | null = null;
	private fpsChangeCallback: FpsChangeCallback | null = null;
	private backgroundChangeCallback: BackgroundChangeCallback | null = null;

	// Click outside handler
	private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

	// Positioning
	private padding = 12;

	// Feature flags
	private showMergeFields: boolean;

	constructor(edit?: Edit, options: { mergeFields?: boolean } = {}) {
		this.edit = edit ?? null;
		this.showMergeFields = options.mergeFields ?? false;
		injectShotstackStyles();
	}

	setPosition(viewportWidth: number, editRightEdge: number): void {
		if (this.container) {
			const toolbarWidth = this.container.offsetWidth || 48;
			const rightOffset = viewportWidth - editRightEdge;
			this.container.style.right = `${Math.max(this.padding, rightOffset - toolbarWidth - this.padding)}px`;
		}
	}

	mount(parent: HTMLElement): void {
		this.container?.remove();

		this.container = document.createElement("div");
		this.container.className = "ss-canvas-toolbar";

		this.container.innerHTML = `
			<!-- Resolution -->
			<div class="ss-canvas-toolbar-dropdown">
				<button class="ss-canvas-toolbar-btn" data-action="resolution" data-tooltip-label data-tooltip="Resolution">
					${ICONS.monitor}
				</button>
				<div class="ss-canvas-toolbar-popup" data-popup="resolution">
					<div class="ss-canvas-toolbar-popup-header">Presets</div>
					${RESOLUTION_PRESETS.map(
						preset => `
						<div class="ss-canvas-toolbar-popup-item" data-width="${preset.width}" data-height="${preset.height}">
							<div class="ss-canvas-toolbar-popup-item-label">
								<span>${preset.label}</span>
								<span class="ss-canvas-toolbar-popup-item-sublabel">${preset.sublabel}</span>
							</div>
							${ICONS.check}
						</div>
					`
					).join("")}
					<div class="ss-canvas-toolbar-popup-divider"></div>
					<div class="ss-canvas-toolbar-popup-header">Custom</div>
					<div class="ss-canvas-toolbar-custom-size">
						<input type="number" class="ss-canvas-toolbar-custom-input" data-custom-width min="1" max="4096" />
						<span class="ss-canvas-toolbar-custom-separator">×</span>
						<input type="number" class="ss-canvas-toolbar-custom-input" data-custom-height min="1" max="4096" />
					</div>
				</div>
			</div>

			<div class="ss-canvas-toolbar-divider"></div>

			<!-- Background -->
			<div class="ss-canvas-toolbar-dropdown">
				<button class="ss-canvas-toolbar-btn" data-action="background" data-tooltip="Background">
					<span class="ss-canvas-toolbar-color-dot" data-bg-preview style="background: ${this.currentBgColor}"></span>
				</button>
				<div class="ss-canvas-toolbar-popup" data-popup="background">
					<div class="ss-canvas-toolbar-color-picker">
						<input type="color" class="ss-canvas-toolbar-color-input" data-color-input value="${this.currentBgColor}" />
					</div>
					<div class="ss-canvas-toolbar-color-swatches">
						${COLOR_SWATCHES.map(
							color => `
							<div class="ss-canvas-toolbar-color-swatch" data-swatch-color="${color}" style="background: ${color}"></div>
						`
						).join("")}
					</div>
				</div>
			</div>

			<div class="ss-canvas-toolbar-divider"></div>

			<!-- FPS -->
			<div class="ss-canvas-toolbar-dropdown">
				<button class="ss-canvas-toolbar-btn" data-action="fps" data-tooltip="Frame Rate">
					<span class="ss-canvas-toolbar-fps-label" data-fps-label>fps</span>
				</button>
				<div class="ss-canvas-toolbar-popup" data-popup="fps">
					${FPS_OPTIONS.map(
						fps => `
						<div class="ss-canvas-toolbar-popup-item" data-fps="${fps}">
							<span>${fps} fps</span>
							${ICONS.check}
						</div>
					`
					).join("")}
				</div>
			</div>

			${
				this.showMergeFields
					? `
			<div class="ss-canvas-toolbar-divider"></div>

			<!-- Variables -->
			<div class="ss-canvas-toolbar-dropdown">
				<button class="ss-canvas-toolbar-btn" data-action="variables" data-tooltip="Merge Fields">
					${ICONS.variables}
				</button>
				<div class="ss-canvas-toolbar-popup ss-canvas-toolbar-popup--variables" data-popup="variables">
					<div class="ss-canvas-toolbar-popup-header ss-variables-header">
						<span>Merge Fields</span>
						<button class="ss-variables-add-btn" data-action="add-variable">+</button>
					</div>
					<div class="ss-variables-list" data-variables-list></div>
					<div class="ss-variables-empty" data-variables-empty>No merge fields defined</div>
				</div>
			</div>
			`
					: ""
			}
		`;

		parent.appendChild(this.container);

		// Query elements
		this.resolutionBtn = this.container.querySelector('[data-action="resolution"]');
		this.backgroundBtn = this.container.querySelector('[data-action="background"]');
		this.fpsBtn = this.container.querySelector('[data-action="fps"]');
		this.variablesBtn = this.container.querySelector('[data-action="variables"]');

		this.resolutionPopup = this.container.querySelector('[data-popup="resolution"]');
		this.backgroundPopup = this.container.querySelector('[data-popup="background"]');
		this.fpsPopup = this.container.querySelector('[data-popup="fps"]');
		this.variablesPopup = this.container.querySelector('[data-popup="variables"]');

		this.variablesList = this.container.querySelector("[data-variables-list]");
		this.variablesEmpty = this.container.querySelector("[data-variables-empty]");

		this.resolutionLabel = this.container.querySelector("[data-resolution-label]");
		this.fpsLabel = this.container.querySelector("[data-fps-label]");
		this.bgColorDot = this.container.querySelector("[data-bg-preview]");

		this.customWidthInput = this.container.querySelector("[data-custom-width]");
		this.customHeightInput = this.container.querySelector("[data-custom-height]");
		this.colorInput = this.container.querySelector("[data-color-input]");

		// Setup event listeners
		this.setupEventListeners();
		this.updateActiveStates();
	}

	private setupEventListeners(): void {
		// Toggle popups
		this.resolutionBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopup("resolution");
		});
		this.backgroundBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopup("background");
		});
		this.fpsBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopup("fps");
		});
		this.variablesBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopup("variables");
			this.renderVariablesList();
		});

		// Variables - Add button
		this.variablesPopup?.querySelector('[data-action="add-variable"]')?.addEventListener("click", e => {
			e.stopPropagation();
			this.addVariable();
		});

		// Resolution preset clicks
		this.resolutionPopup?.querySelectorAll("[data-width]").forEach(item => {
			item.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const width = parseInt(el.dataset["width"] || "1920", 10);
				const height = parseInt(el.dataset["height"] || "1080", 10);
				this.handleResolutionSelect(width, height);
			});
		});

		// Custom size inputs
		this.customWidthInput?.addEventListener("change", () => this.handleCustomSizeChange());
		this.customHeightInput?.addEventListener("change", () => this.handleCustomSizeChange());

		// FPS clicks
		this.fpsPopup?.querySelectorAll("[data-fps]").forEach(item => {
			item.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const fps = parseInt(el.dataset["fps"] || "30", 10);
				this.handleFpsSelect(fps);
			});
		});

		// Color input
		this.colorInput?.addEventListener("input", () => {
			if (this.colorInput) {
				this.handleColorChange(this.colorInput.value);
			}
		});

		// Color swatches
		this.backgroundPopup?.querySelectorAll("[data-swatch-color]").forEach(swatch => {
			swatch.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const color = el.dataset["swatchColor"] || "#000000";
				this.handleColorChange(color);
			});
		});

		// Click outside to close
		this.clickOutsideHandler = (e: MouseEvent) => {
			if (!this.container?.contains(e.target as Node)) {
				this.closeAllPopups();
			}
		};
		document.addEventListener("click", this.clickOutsideHandler);
	}

	private togglePopup(popup: "resolution" | "background" | "fps" | "variables"): void {
		const popupMap = {
			resolution: { popup: this.resolutionPopup, btn: this.resolutionBtn },
			background: { popup: this.backgroundPopup, btn: this.backgroundBtn },
			fps: { popup: this.fpsPopup, btn: this.fpsBtn },
			variables: { popup: this.variablesPopup, btn: this.variablesBtn }
		};

		const isCurrentlyOpen = popupMap[popup].popup?.classList.contains("visible");

		// Close all popups
		this.closeAllPopups();

		// If it wasn't open, open it
		if (!isCurrentlyOpen) {
			popupMap[popup].popup?.classList.add("visible");
			popupMap[popup].btn?.classList.add("active");

			// Sync custom inputs when opening resolution popup
			if (popup === "resolution") {
				if (this.customWidthInput) this.customWidthInput.value = String(this.currentWidth);
				if (this.customHeightInput) this.customHeightInput.value = String(this.currentHeight);
			}
		}
	}

	private closeAllPopups(): void {
		this.resolutionPopup?.classList.remove("visible");
		this.backgroundPopup?.classList.remove("visible");
		this.fpsPopup?.classList.remove("visible");
		this.variablesPopup?.classList.remove("visible");
		this.resolutionBtn?.classList.remove("active");
		this.backgroundBtn?.classList.remove("active");
		this.fpsBtn?.classList.remove("active");
		this.variablesBtn?.classList.remove("active");
	}

	private handleResolutionSelect(width: number, height: number): void {
		this.currentWidth = width;
		this.currentHeight = height;
		this.updateResolutionLabel();
		this.updateActiveStates();
		this.closeAllPopups();

		if (this.resolutionChangeCallback) {
			this.resolutionChangeCallback(width, height);
		}
	}

	private handleCustomSizeChange(): void {
		if (this.customWidthInput && this.customHeightInput) {
			const width = parseInt(this.customWidthInput.value, 10);
			const height = parseInt(this.customHeightInput.value, 10);
			if (!Number.isNaN(width) && !Number.isNaN(height) && width > 0 && height > 0) {
				this.currentWidth = width;
				this.currentHeight = height;
				this.updateResolutionLabel();
				this.updateActiveStates();

				if (this.resolutionChangeCallback) {
					this.resolutionChangeCallback(width, height);
				}
			}
		}
	}

	private handleFpsSelect(fps: number): void {
		this.currentFps = fps;
		this.updateFpsLabel();
		this.updateActiveStates();
		this.closeAllPopups();

		if (this.fpsChangeCallback) {
			this.fpsChangeCallback(fps);
		}
	}

	private handleColorChange(color: string): void {
		this.currentBgColor = color;
		this.updateColorPreview();
		this.updateActiveStates();

		if (this.colorInput) {
			this.colorInput.value = color;
		}

		if (this.backgroundChangeCallback) {
			this.backgroundChangeCallback(color);
		}
	}

	private updateResolutionLabel(): void {
		if (this.resolutionLabel) {
			this.resolutionLabel.textContent = `${this.currentWidth} × ${this.currentHeight}`;
		}
	}

	private updateFpsLabel(): void {
		if (this.fpsLabel) {
			this.fpsLabel.textContent = `${this.currentFps} fps`;
		}
	}

	private updateColorPreview(): void {
		if (this.bgColorDot) {
			this.bgColorDot.style.background = this.currentBgColor;
		}
	}

	private updateActiveStates(): void {
		// Update resolution presets
		this.resolutionPopup?.querySelectorAll("[data-width]").forEach(item => {
			const el = item as HTMLElement;
			const width = parseInt(el.dataset["width"] || "0", 10);
			const height = parseInt(el.dataset["height"] || "0", 10);
			el.classList.toggle("active", width === this.currentWidth && height === this.currentHeight);
		});

		// Update FPS options
		this.fpsPopup?.querySelectorAll("[data-fps]").forEach(item => {
			const el = item as HTMLElement;
			const fps = parseInt(el.dataset["fps"] || "0", 10);
			el.classList.toggle("active", fps === this.currentFps);
		});

		// Update color swatches
		this.backgroundPopup?.querySelectorAll("[data-swatch-color]").forEach(swatch => {
			const el = swatch as HTMLElement;
			const color = el.dataset["swatchColor"] || "";
			el.classList.toggle("active", color.toLowerCase() === this.currentBgColor.toLowerCase());
		});
	}

	private renderVariablesList(): void {
		if (!this.variablesList || !this.variablesEmpty || !this.edit) return;

		const fields = this.edit.mergeFields.getAll();

		if (fields.length === 0) {
			this.variablesList.innerHTML = "";
			this.variablesList.style.display = "none";
			this.variablesEmpty.style.display = "block";
			return;
		}

		this.variablesEmpty.style.display = "none";
		this.variablesList.style.display = "block";
		this.variablesList.innerHTML = fields
			.map(
				(f: MergeField) => `
			<div class="ss-variable-item" data-var-name="${f.name}">
				<div class="ss-variable-item-header">
					<span class="ss-variable-name">{{ ${f.name} }}</span>
					<button class="ss-variable-delete" data-delete-var="${f.name}">×</button>
				</div>
				<input class="ss-variable-value" value="${f.defaultValue}" placeholder="Default value" data-var-input="${f.name}" />
			</div>
		`
			)
			.join("");

		// Add event listeners for value changes and delete buttons
		this.variablesList.querySelectorAll("[data-var-input]").forEach(input => {
			input.addEventListener("change", async e => {
				const el = e.target as HTMLInputElement;
				const name = el.dataset["varInput"];
				if (name && this.edit) {
					// Validate URL if this is a src-type merge field
					if (this.edit.isSrcMergeField(name)) {
						const validation = await validateAssetUrl(el.value);
						if (!validation.valid) {
							el.classList.add("error");
							el.title = validation.error || "Invalid URL";
							return;
						}
						el.classList.remove("error");
						el.title = "";
					}

					// Update the merge field value and refresh affected clips
					this.edit.updateMergeFieldValueLive(name, el.value);
					this.edit.redrawMergeFieldClips(name);
				}
			});
		});

		this.variablesList.querySelectorAll("[data-delete-var]").forEach(btn => {
			btn.addEventListener("click", e => {
				e.stopPropagation();
				const el = e.target as HTMLElement;
				const name = el.dataset["deleteVar"];
				if (name) {
					this.edit?.deleteMergeFieldGlobally(name);
					this.renderVariablesList();
				}
			});
		});
	}

	private addVariable(): void {
		if (!this.edit) return;

		// eslint-disable-next-line no-alert -- Intentional use of prompt for quick variable name input
		const name = prompt("Variable name:");
		if (!name || !name.trim()) return;

		const sanitizedName = name.trim().toUpperCase().replace(/\s+/g, "_");
		this.edit.mergeFields.register({ name: sanitizedName, defaultValue: "" });
		this.renderVariablesList();
	}

	setResolution(width: number, height: number): void {
		this.currentWidth = Math.round(width);
		this.currentHeight = Math.round(height);
		this.updateResolutionLabel();
		this.updateActiveStates();

		if (this.customWidthInput) this.customWidthInput.value = String(this.currentWidth);
		if (this.customHeightInput) this.customHeightInput.value = String(this.currentHeight);
	}

	setFps(fps: number): void {
		this.currentFps = fps;
		this.updateFpsLabel();
		this.updateActiveStates();
	}

	setBackground(color: string): void {
		const hexColor = color.startsWith("#") ? color : `#${color}`;
		this.currentBgColor = hexColor;
		this.updateColorPreview();
		this.updateActiveStates();

		if (this.colorInput) {
			this.colorInput.value = hexColor;
		}
	}

	onResolutionChange(callback: ResolutionChangeCallback): void {
		this.resolutionChangeCallback = callback;
	}

	onFpsChange(callback: FpsChangeCallback): void {
		this.fpsChangeCallback = callback;
	}

	onBackgroundChange(callback: BackgroundChangeCallback): void {
		this.backgroundChangeCallback = callback;
	}

	dispose(): void {
		if (this.clickOutsideHandler) {
			document.removeEventListener("click", this.clickOutsideHandler);
			this.clickOutsideHandler = null;
		}

		this.container?.remove();
		this.container = null;

		this.resolutionPopup = null;
		this.backgroundPopup = null;
		this.fpsPopup = null;
		this.variablesPopup = null;
		this.resolutionBtn = null;
		this.backgroundBtn = null;
		this.fpsBtn = null;
		this.variablesBtn = null;
		this.variablesList = null;
		this.variablesEmpty = null;
		this.resolutionLabel = null;
		this.fpsLabel = null;
		this.bgColorDot = null;
		this.customWidthInput = null;
		this.customHeightInput = null;
		this.colorInput = null;

		this.resolutionChangeCallback = null;
		this.fpsChangeCallback = null;
		this.backgroundChangeCallback = null;
	}
}
