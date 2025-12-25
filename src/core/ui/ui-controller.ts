import type { Canvas } from "@canvas/shotstack-canvas";
import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import type * as pixi from "pixi.js";

import { SelectionHandles } from "./selection-handles";

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
 * // Pure preview (no UI)
 * const edit = new Edit(template);
 * const canvas = new Canvas(edit);
 * await canvas.load();
 *
 * // With UI
 * const ui = new UIController(edit)
 *   .registerToolbar('text', new TextToolbar(edit))
 *   .registerToolbar(['video', 'image'], new MediaToolbar(edit));
 * ui.mount(container);
 * ```
 */
export class UIController {
	private toolbars = new Map<string, UIRegistration>();
	private utilities: UIRegistration[] = [];
	private canvasOverlays: CanvasOverlayRegistration[] = [];
	private container: HTMLElement | null = null;
	private canvas: Canvas | null = null;
	private isDisposed = false;

	constructor(
		private edit: Edit,
		canvas?: Canvas,
		options: UIControllerOptions = {}
	) {
		this.canvas = canvas ?? null;
		this.edit.events.on(EditEvent.ClipSelected, this.onClipSelected);
		this.edit.events.on(EditEvent.SelectionCleared, this.onSelectionCleared);

		// Auto-register SelectionHandles unless opted out
		const { selectionHandles = true } = options;
		if (selectionHandles) {
			this.registerCanvasOverlay(new SelectionHandles(this.edit));
		}
	}

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

		// Mount all toolbars (they manage their own visibility)
		const mountedToolbars = new Set<UIRegistration>();
		for (const toolbar of this.toolbars.values()) {
			if (!mountedToolbars.has(toolbar)) {
				toolbar.mount(container);
				mountedToolbars.add(toolbar);
			}
		}

		// Mount utilities
		for (const utility of this.utilities) {
			utility.mount(container);
		}

		// Mount canvas overlays to the PixiJS overlay container
		if (this.canvas) {
			for (const overlay of this.canvasOverlays) {
				overlay.mount(this.canvas.overlayContainer, this.canvas.application);
			}
		}
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
	 * Dispose all registered UI components and clean up event listeners.
	 */
	dispose(): void {
		if (this.isDisposed) return;
		this.isDisposed = true;

		this.edit.events.off(EditEvent.ClipSelected, this.onClipSelected);
		this.edit.events.off(EditEvent.SelectionCleared, this.onSelectionCleared);

		// Dispose toolbars (avoid double-dispose for shared instances)
		const disposedToolbars = new Set<UIRegistration>();
		for (const toolbar of this.toolbars.values()) {
			if (!disposedToolbars.has(toolbar)) {
				toolbar.dispose();
				disposedToolbars.add(toolbar);
			}
		}

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

	// ─── Event Handlers ─────────────────────────────────────────────────────────

	private onClipSelected = ({ trackIndex, clipIndex }: { trackIndex: number; clipIndex: number }): void => {
		const player = this.edit.getPlayerClip(trackIndex, clipIndex);
		const assetType = player?.clipConfiguration.asset?.type;

		// Hide all toolbars first
		const hiddenToolbars = new Set<UIRegistration>();
		for (const toolbar of this.toolbars.values()) {
			if (!hiddenToolbars.has(toolbar)) {
				toolbar.hide?.();
				hiddenToolbars.add(toolbar);
			}
		}

		// Show the matching toolbar
		if (assetType) {
			const toolbar = this.toolbars.get(assetType);
			toolbar?.show?.(trackIndex, clipIndex);
		}
	};

	private onSelectionCleared = (): void => {
		const hiddenToolbars = new Set<UIRegistration>();
		for (const toolbar of this.toolbars.values()) {
			if (!hiddenToolbars.has(toolbar)) {
				toolbar.hide?.();
				hiddenToolbars.add(toolbar);
			}
		}
	};
}
