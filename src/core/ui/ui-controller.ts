import { Canvas } from "@canvas/shotstack-canvas";
import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import { EventEmitter } from "@core/events/event-emitter";
import type * as pixi from "pixi.js";

import { AssetToolbar } from "./asset-toolbar";
import { CanvasToolbar } from "./canvas-toolbar";
import { ClipToolbar } from "./clip-toolbar";
import { MediaToolbar } from "./media-toolbar";
import { RichTextToolbar } from "./rich-text-toolbar";
import { SelectionHandles } from "./selection-handles";
import { TextToolbar } from "./text-toolbar";

// Toolbar positioning constants
const TOOLBAR_WIDTH = 48;
const TOOLBAR_PADDING = 12;
const TOOLBAR_MIN_Y = 80; // Minimum Y to avoid overlapping with top navigation

/**
 * Configuration for a toolbar button.
 */
export interface ToolbarButtonConfig {
	/** Unique identifier for the button (used in event names) */
	id: string;
	/** SVG icon markup */
	icon: string;
	/** Tooltip text shown on hover */
	tooltip: string;
	/** Whether to show a divider before this button */
	dividerBefore?: boolean;
}

/**
 * Payload passed to button click handlers.
 */
export interface ButtonClickPayload {
	/** Current playback position in seconds */
	position: number;
	/** Currently selected clip, if any */
	selectedClip: { trackIndex: number; clipIndex: number } | null;
}

/**
 * Event map for UIController button events.
 * Events are typed as `button:${buttonId}`.
 */
export type UIButtonEventMap = Record<`button:${string}`, ButtonClickPayload>;

/**
 * Interface for HTML/DOM UI components that can be registered with UIController.
 * Toolbars, inspectors, and other UI elements should implement this interface.
 */
export interface UIRegistration {
	/** Mount the component to a parent container */
	mount(container: HTMLElement): void;
	/** Show the component for a specific clip (optional - utilities may not need this) */
	show?(trackIndex: number, clipIndex: number): void;
	/** Hide the component */
	hide?(): void;
	/** Clean up resources */
	dispose(): void;
}

/**
 * Interface for PixiJS-based overlays that render on the canvas.
 * Used for interactive elements like selection handles, alignment guides, etc.
 */
export interface CanvasOverlayRegistration {
	/** Mount to PixiJS container */
	mount(container: pixi.Container, app: pixi.Application): void;
	/** Called each frame to update state */
	update(deltaTime: number, elapsed: number): void;
	/** Called each frame to render */
	draw(): void;
	/** Clean up resources */
	dispose(): void;
}

/**
 * Options for UIController configuration.
 */
export interface UIControllerOptions {
	/** Enable selection handles for drag/resize/rotate interactions. Default: true */
	selectionHandles?: boolean;
	/** Enable merge fields UI (Variables panel, autocomplete). Default: false (vanilla video editor) */
	mergeFields?: boolean;
}

/**
 * Controller for managing UI elements (toolbars, utilities) separately from Canvas.
 *
 * This enables:
 * - Pure preview mode (Canvas without UI)
 * - Custom toolbar registration
 * - Optional UI element loading
 *
 * @example
 * ```typescript
 * // Standard setup with all toolbars
 * const ui = UIController.create(edit, canvas, { mergeFields: true });
 *
 * // Minimal setup for custom toolbars
 * const ui = UIController.minimal(edit, canvas);
 * ui.registerToolbar('text', new CustomTextToolbar(edit));
 * ```
 */
export class UIController {
	private toolbars = new Map<string, UIRegistration>();
	private utilities: UIRegistration[] = [];
	private canvasOverlays: CanvasOverlayRegistration[] = [];
	private container: HTMLElement | null = null;
	private canvas: Canvas | null = null;
	private isDisposed = false;

	/** Whether merge fields UI is enabled (Variables panel, autocomplete) */
	readonly mergeFieldsEnabled: boolean;
	/** Whether selection handles are enabled for drag/resize/rotate */
	private readonly selectionHandlesEnabled: boolean;

	// Toolbar mode switching
	private clipToolbar: ClipToolbar | null = null;
	private toolbarMode: "asset" | "clip" = "asset";
	private currentAssetType: string | null = null;
	private currentTrackIndex = -1;
	private currentClipIndex = -1;
	private onKeyDownBound: (e: KeyboardEvent) => void;

	// Button registry
	private buttonRegistry: ToolbarButtonConfig[] = [];
	private buttonEvents = new EventEmitter<UIButtonEventMap & { "buttons:changed": void }>();
	private assetToolbar: AssetToolbar | null = null;
	private canvasToolbar: CanvasToolbar | null = null;

	// ─── Static Factory Methods ─────────────────────────────────────────────────

	/**
	 * Create a UIController with all standard toolbars pre-registered.
	 * This is the recommended way to create a UIController for most use cases.
	 *
	 * @param edit - The Edit instance
	 * @param canvas - The Canvas instance
	 * @param options - Configuration options
	 * @returns A fully configured UIController
	 *
	 * @example
	 * ```typescript
	 * const ui = UIController.create(edit, canvas, { mergeFields: true });
	 * ui.registerButton({ id: "text", icon: "...", tooltip: "Add Text" });
	 * ui.on("button:text", ({ position }) => { ... });
	 * ```
	 */
	static create(edit: Edit, canvas: Canvas, options: UIControllerOptions = {}): UIController {
		const ui = new UIController(edit, canvas, options);
		ui.subscribeToEvents();
		canvas.setUIController(ui);
		ui.registerStandardToolbars();

		// Auto-mount if canvas is already loaded (element exists in DOM)
		// This handles the case where UIController is created after canvas.load()
		const root = document.querySelector<HTMLElement>(Canvas.CanvasSelector);
		if (root && root.querySelector("canvas")) {
			ui.mount(root); // mount() handles deferred positioning via double rAF
		}

		return ui;
	}

	/**
	 * Create a minimal UIController without pre-registered toolbars.
	 * Use this when you want full control over which toolbars are registered.
	 *
	 * @param edit - The Edit instance
	 * @param canvas - Optional Canvas instance
	 * @returns A minimal UIController ready for custom configuration
	 *
	 * @example
	 * ```typescript
	 * const ui = UIController.minimal(edit, canvas);
	 * ui.registerToolbar('text', new CustomTextToolbar(edit));
	 * ui.registerToolbar('video', new CustomVideoToolbar(edit));
	 * ```
	 */
	static minimal(edit: Edit, canvas?: Canvas): UIController {
		const ui = new UIController(edit, canvas ?? null, {});
		ui.subscribeToEvents();
		if (canvas) canvas.setUIController(ui);
		return ui;
	}

	// ─── Private Constructor ────────────────────────────────────────────────────

	/**
	 * Private constructor - use UIController.create() or UIController.minimal() instead.
	 */
	private constructor(edit: Edit, canvas: Canvas | null, options: UIControllerOptions) {
		this.edit = edit;
		this.canvas = canvas;
		this.mergeFieldsEnabled = options.mergeFields ?? false;
		this.selectionHandlesEnabled = options.selectionHandles ?? true;
		this.onKeyDownBound = this.onKeyDown.bind(this);
	}

	private readonly edit: Edit;

	/**
	 * Subscribe to edit events. Called by factory methods.
	 */
	private subscribeToEvents(): void {
		this.edit.events.on(EditEvent.ClipSelected, this.onClipSelected);
		this.edit.events.on(EditEvent.SelectionCleared, this.onSelectionCleared);
	}

	/**
	 * Register all standard toolbars. Called by create() factory.
	 */
	private registerStandardToolbars(): void {
		// Selection handles
		if (this.selectionHandlesEnabled) {
			this.registerCanvasOverlay(new SelectionHandles(this.edit));
		}

		// Asset-specific toolbars
		this.registerToolbar("text", new TextToolbar(this.edit));
		this.registerToolbar("rich-text", new RichTextToolbar(this.edit, { mergeFields: this.mergeFieldsEnabled }));
		this.registerToolbar(["video", "image"], new MediaToolbar(this.edit, { mergeFields: this.mergeFieldsEnabled }));
		this.registerToolbar("audio", new MediaToolbar(this.edit, { mergeFields: this.mergeFieldsEnabled }));

		// Utilities
		this.canvasToolbar = new CanvasToolbar(this.edit, { mergeFields: this.mergeFieldsEnabled });
		this.registerUtility(this.canvasToolbar);
		this.assetToolbar = new AssetToolbar(this);
		this.registerUtility(this.assetToolbar);

		// ClipToolbar - managed separately for mode toggle
		this.clipToolbar = new ClipToolbar(this.edit);
	}

	// ─── Public API ─────────────────────────────────────────────────────────────

	/**
	 * Register a toolbar for one or more asset types.
	 * When a clip of that type is selected, the toolbar will be shown.
	 *
	 * @param assetTypes - Single type or array of types (e.g., 'text', ['video', 'image'])
	 * @param toolbar - The toolbar component implementing UIRegistration
	 * @returns this (for chaining)
	 */
	registerToolbar(assetTypes: string | string[], toolbar: UIRegistration): this {
		const types = Array.isArray(assetTypes) ? assetTypes : [assetTypes];
		for (const type of types) {
			this.toolbars.set(type, toolbar);
		}
		return this;
	}

	/**
	 * Register a utility component (Inspector, TranscriptionIndicator, etc.).
	 * Utilities are mounted but not tied to clip selection.
	 *
	 * @param component - The utility component implementing UIRegistration
	 * @returns this (for chaining)
	 */
	registerUtility(component: UIRegistration): this {
		this.utilities.push(component);
		return this;
	}

	/**
	 * Register a PixiJS-based canvas overlay (SelectionHandles, AlignmentGuides, etc.).
	 * Overlays render on the canvas and receive update/draw calls each frame.
	 *
	 * @param overlay - The overlay component implementing CanvasOverlayRegistration
	 * @returns this (for chaining)
	 */
	registerCanvasOverlay(overlay: CanvasOverlayRegistration): this {
		this.canvasOverlays.push(overlay);
		return this;
	}

	/**
	 * Mount all registered UI components to a container.
	 * Should be called after all registrations are complete.
	 *
	 * @param container - The DOM element to mount UI components into
	 */
	mount(container: HTMLElement): void {
		this.container = container;

		// Find the canvas container - toolbars need to mount here for correct positioning
		const canvasContainer = document.querySelector<HTMLElement>(Canvas.CanvasSelector) ?? container;

		// Mount all toolbars to canvas container
		const mountedToolbars = new Set<UIRegistration>();
		for (const toolbar of this.toolbars.values()) {
			if (!mountedToolbars.has(toolbar)) {
				toolbar.mount(canvasContainer);
				mountedToolbars.add(toolbar);
			}
		}

		// Mount ClipToolbar to canvas container (managed separately for mode toggle)
		this.clipToolbar?.mount(canvasContainer);

		// Mount utilities (asset/canvas toolbars)
		for (const utility of this.utilities) {
			utility.mount(canvasContainer);
		}

		// Mount canvas overlays to the PixiJS overlay container
		if (this.canvas) {
			for (const overlay of this.canvasOverlays) {
				overlay.mount(this.canvas.overlayContainer, this.canvas.application);
			}
		}

		// Wire up mode toggle buttons (after DOM is ready)
		requestAnimationFrame(() => {
			this.container?.querySelectorAll(".ss-toolbar-mode-btn").forEach(btn => {
				btn.addEventListener("click", () => {
					const mode = (btn as HTMLElement).dataset["mode"] as "asset" | "clip";
					if (mode) {
						this.setToolbarMode(mode);
					}
				});
			});
		});

		// Backtick key shortcut for mode toggle
		document.addEventListener("keydown", this.onKeyDownBound);

		// Position toolbars after DOM is ready
		// Using nested rAF to ensure layout is complete before measuring
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				this.updateToolbarPositions();
			});
		});
	}

	/**
	 * Update all canvas overlays. Called by Canvas each tick.
	 */
	updateOverlays(deltaTime: number, elapsed: number): void {
		for (const overlay of this.canvasOverlays) {
			overlay.update(deltaTime, elapsed);
			overlay.draw();
		}
	}

	/**
	 * Update toolbar positions to be adjacent to the canvas content.
	 * Uses position: fixed with screen coordinates for complete independence from parent CSS.
	 * Called by Canvas after zoom, pan, or resize operations.
	 */
	updateToolbarPositions(): void {
		if (!this.canvas) return;

		const canvasRect = this.canvas.application.canvas.getBoundingClientRect();
		const bounds = this.canvas.getContentBounds();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// Calculate raw screen coordinates
		const videoLeftScreen = canvasRect.left + bounds.left;
		const videoRightScreen = canvasRect.left + bounds.right;
		const videoCenterYScreen = canvasRect.top + (bounds.top + bounds.bottom) / 2;

		// Clamp Y to stay within viewport (avoiding top nav and bottom timeline)
		const clampedY = Math.max(TOOLBAR_MIN_Y, Math.min(viewportHeight - TOOLBAR_MIN_Y, videoCenterYScreen));

		// Left toolbar: position to the left of video, clamped to viewport
		const leftX = Math.max(TOOLBAR_PADDING, videoLeftScreen - TOOLBAR_WIDTH - TOOLBAR_PADDING);

		// Right toolbar: position to the right of video, clamped to viewport
		const maxRightX = viewportWidth - TOOLBAR_WIDTH - TOOLBAR_PADDING;
		const rightX = Math.min(maxRightX, videoRightScreen + TOOLBAR_PADDING);

		this.assetToolbar?.setPosition(leftX, clampedY);
		this.canvasToolbar?.setPosition(rightX, clampedY);
	}

	/**
	 * Dispose all registered UI components and clean up event listeners.
	 */
	dispose(): void {
		if (this.isDisposed) return;
		this.isDisposed = true;

		this.edit.events.off(EditEvent.ClipSelected, this.onClipSelected);
		this.edit.events.off(EditEvent.SelectionCleared, this.onSelectionCleared);

		// Remove keyboard listener
		document.removeEventListener("keydown", this.onKeyDownBound);

		// Dispose toolbars (avoid double-dispose for shared instances)
		const disposedToolbars = new Set<UIRegistration>();
		for (const toolbar of this.toolbars.values()) {
			if (!disposedToolbars.has(toolbar)) {
				toolbar.dispose();
				disposedToolbars.add(toolbar);
			}
		}

		// Dispose ClipToolbar (managed separately)
		this.clipToolbar?.dispose();

		// Dispose utilities
		for (const utility of this.utilities) {
			utility.dispose();
		}

		// Dispose canvas overlays
		for (const overlay of this.canvasOverlays) {
			overlay.dispose();
		}

		this.toolbars.clear();
		this.utilities = [];
		this.canvasOverlays = [];
		this.container = null;
		this.canvas = null;
	}

	/**
	 * Get the toolbar registered for a specific asset type.
	 */
	getToolbar(assetType: string): UIRegistration | undefined {
		return this.toolbars.get(assetType);
	}

	/**
	 * Check if a toolbar is registered for an asset type.
	 */
	hasToolbar(assetType: string): boolean {
		return this.toolbars.has(assetType);
	}

	// ─── Button Registry ─────────────────────────────────────────────────────────

	/**
	 * Register a toolbar button.
	 * Buttons appear in the left toolbar and trigger events when clicked.
	 *
	 * @example
	 * ```typescript
	 * ui.registerButton({
	 *   id: "text",
	 *   icon: `<svg>...</svg>`,
	 *   tooltip: "Add Text"
	 * });
	 *
	 * ui.on("button:text", ({ position }) => {
	 *   edit.addTrack(0, { clips: [{ ... }] });
	 * });
	 * ```
	 *
	 * @param config - Button configuration
	 * @returns this (for chaining)
	 */
	registerButton(config: ToolbarButtonConfig): this {
		const existing = this.buttonRegistry.findIndex(b => b.id === config.id);
		if (existing >= 0) {
			this.buttonRegistry[existing] = config;
		} else {
			this.buttonRegistry.push(config);
		}
		this.buttonEvents.emit("buttons:changed");
		return this;
	}

	/**
	 * Unregister a toolbar button.
	 *
	 * @param id - Button ID to remove
	 * @returns this (for chaining)
	 */
	unregisterButton(id: string): this {
		const index = this.buttonRegistry.findIndex(b => b.id === id);
		if (index >= 0) {
			this.buttonRegistry.splice(index, 1);
			this.buttonEvents.emit("buttons:changed");
		}
		return this;
	}

	/**
	 * Get all registered toolbar buttons.
	 */
	getButtons(): ToolbarButtonConfig[] {
		return [...this.buttonRegistry];
	}

	/**
	 * Subscribe to a button click event.
	 *
	 * @example
	 * ```typescript
	 * ui.on("button:text", ({ position, selectedClip }) => {
	 *   console.log("Text button clicked at position:", position);
	 * });
	 * ```
	 *
	 * @param event - Event name in format `button:${buttonId}`
	 * @param handler - Callback function
	 * @returns Unsubscribe function
	 */
	on<K extends `button:${string}`>(event: K, handler: (payload: ButtonClickPayload) => void): () => void {
		return this.buttonEvents.on(event as keyof UIButtonEventMap, handler);
	}

	/**
	 * Unsubscribe from a button click event.
	 */
	off<K extends `button:${string}`>(event: K, handler: (payload: ButtonClickPayload) => void): void {
		this.buttonEvents.off(event as keyof UIButtonEventMap, handler);
	}

	/**
	 * Subscribe to button registry changes.
	 * Called when buttons are added or removed.
	 *
	 * @internal Used by AssetToolbar
	 */
	onButtonsChanged(handler: () => void): () => void {
		return this.buttonEvents.on("buttons:changed", handler);
	}

	/**
	 * Emit a button click event.
	 * @internal Called by AssetToolbar when a button is clicked.
	 */
	emitButtonClick(buttonId: string): void {
		const payload: ButtonClickPayload = {
			position: this.edit.playbackTime / 1000,
			selectedClip: this.edit.getSelectedClipInfo()
		};
		this.buttonEvents.emit(`button:${buttonId}`, payload);
	}

	/**
	 * Get the current playback time in seconds.
	 * @internal Used by AssetToolbar
	 */
	getPlaybackTime(): number {
		return this.edit.playbackTime / 1000;
	}

	/**
	 * Get the currently selected clip info.
	 * @internal Used by AssetToolbar
	 */
	getSelectedClip(): { trackIndex: number; clipIndex: number } | null {
		return this.edit.getSelectedClipInfo();
	}

	// ─── Mode Toggle ────────────────────────────────────────────────────────────

	/**
	 * Set the toolbar mode and update visibility accordingly.
	 * @param mode - "asset" shows asset-specific toolbar, "clip" shows ClipToolbar
	 */
	private setToolbarMode(mode: "asset" | "clip"): void {
		this.toolbarMode = mode;

		// Update all toggle UIs
		this.container?.querySelectorAll(".ss-toolbar-mode-toggle").forEach(toggle => {
			toggle.setAttribute("data-mode", mode);
			toggle.querySelectorAll(".ss-toolbar-mode-btn").forEach(btn => {
				btn.classList.toggle("active", (btn as HTMLElement).dataset["mode"] === mode);
			});
		});

		this.updateToolbarVisibility();
	}

	/**
	 * Hide all registered toolbars.
	 */
	private hideAllToolbars(): void {
		const hidden = new Set<UIRegistration>();
		for (const toolbar of this.toolbars.values()) {
			if (!hidden.has(toolbar)) {
				toolbar.hide?.();
				hidden.add(toolbar);
			}
		}
		this.clipToolbar?.hide?.();
	}

	/**
	 * Update toolbar visibility based on current mode and selection.
	 */
	private updateToolbarVisibility(): void {
		this.hideAllToolbars();

		// No selection = nothing to show
		if (this.currentTrackIndex < 0 || this.currentClipIndex < 0) return;

		if (this.toolbarMode === "clip") {
			this.clipToolbar?.show?.(this.currentTrackIndex, this.currentClipIndex);
		} else if (this.currentAssetType) {
			const toolbar = this.toolbars.get(this.currentAssetType);
			toolbar?.show?.(this.currentTrackIndex, this.currentClipIndex);
		}
	}

	/**
	 * Check if any toolbar is currently visible (clip is selected).
	 */
	private hasVisibleToolbar(): boolean {
		return this.currentTrackIndex >= 0 && this.currentClipIndex >= 0;
	}

	/**
	 * Check if an input element is focused (to avoid intercepting typing).
	 */
	private isInputFocused(): boolean {
		const el = document.activeElement;
		return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable;
	}

	/**
	 * Handle backtick (`) key to toggle between asset and clip mode.
	 * Backtick is the video editor convention for mode/view toggling (Premiere, After Effects).
	 */
	private onKeyDown(e: KeyboardEvent): void {
		const isBacktick = e.key === "`" || e.code === "Backquote";
		if (isBacktick && this.hasVisibleToolbar() && !this.isInputFocused()) {
			e.preventDefault();
			this.setToolbarMode(this.toolbarMode === "asset" ? "clip" : "asset");
		}
	}

	// ─── Event Handlers ─────────────────────────────────────────────────────────

	private onClipSelected = ({ trackIndex, clipIndex }: { trackIndex: number; clipIndex: number }): void => {
		const player = this.edit.getPlayerClip(trackIndex, clipIndex);
		const assetType = player?.clipConfiguration.asset?.type;

		// Track current selection for mode toggle
		this.currentAssetType = assetType ?? null;
		this.currentTrackIndex = trackIndex;
		this.currentClipIndex = clipIndex;

		// Update visibility based on mode
		this.updateToolbarVisibility();
	};

	private onSelectionCleared = (): void => {
		// Reset selection state
		this.currentAssetType = null;
		this.currentTrackIndex = -1;
		this.currentClipIndex = -1;

		// Hide all toolbars
		this.hideAllToolbars();
	};
}
