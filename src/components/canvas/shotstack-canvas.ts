import type { Player } from "@canvas/players/player";
import { createWebGLErrorOverlay } from "@canvas/webgl-error-overlay";
import { Edit } from "@core/edit-session";
import { InternalEvent } from "@core/events/edit-events";
import { ms } from "@core/timing/types";
import type { UIController } from "@core/ui/ui-controller";
import { checkWebGLSupport } from "@core/webgl-support";
import { type Size } from "@layouts/geometry";
import { AudioLoadParser } from "@loaders/audio-load-parser";
import { FontLoadParser } from "@loaders/font-load-parser";
import { SubtitleLoadParser } from "@loaders/subtitle-load-parser";
import type { Timeline } from "@timeline/index";
import * as pixi from "pixi.js";

import "pixi.js/app";
import "pixi.js/events";
import "pixi.js/graphics";
import "pixi.js/text";
import "pixi.js/text-html";
import "pixi.js/sprite-tiling";
import "pixi.js/filters";
import "pixi.js/mesh";

const TRACK_Z_INDEX_PADDING = 100;

export class Canvas {
	/** @internal */
	public static readonly CanvasSelector = "[data-shotstack-studio]";

	private static extensionsRegistered = false;

	private viewportSize: Size = { width: 0, height: 0 };
	/** @internal */
	public readonly application: pixi.Application;

	private readonly edit: Edit;

	/** Container for interactive overlays (handles, guides). Renders above content. */
	public readonly overlayContainer: pixi.Container;

	private viewportContainer?: pixi.Container;
	private editBackground?: pixi.Graphics;
	private viewportMask?: pixi.Graphics;
	private container?: pixi.Container;
	private background?: pixi.Graphics;
	private timeline?: Timeline;
	private uiController: UIController | null = null;

	private minZoom = 0.1;
	private maxZoom = 4;
	private currentZoom = 1;

	private onTickBound: (ticker: pixi.Ticker) => void;
	private onBackgroundClickBound: (event: pixi.FederatedPointerEvent) => void;
	private onWheelBound: (e: WheelEvent) => void;
	private canvasRoot: HTMLDivElement | null = null;

	constructor(edit: Edit) {
		this.application = new pixi.Application();
		this.edit = edit;
		this.overlayContainer = new pixi.Container();
		this.overlayContainer.sortableChildren = true;
		this.onTickBound = this.onTick.bind(this);
		this.onBackgroundClickBound = this.onBackgroundClick.bind(this);
		this.onWheelBound = this.onWheel.bind(this);

		edit.setCanvas(this);
	}

	/**
	 * Register a UIController to receive tick updates for canvas overlays.
	 * @deprecated Use `new UIController(edit, canvas)` instead - auto-registers.
	 */
	registerUIController(controller: UIController): void {
		console.warn(
			"[Shotstack] canvas.registerUIController() is deprecated. " +
				"UIController now auto-registers when you pass canvas to the constructor: " +
				"new UIController(edit, canvas)"
		);
		this.uiController = controller;
	}

	/**
	 * Set the UIController for this canvas.
	 * @internal Called by UIController constructor for auto-registration.
	 */
	setUIController(controller: UIController): void {
		this.uiController = controller;
	}

	public async load(): Promise<void> {
		const root = document.querySelector<HTMLDivElement>(Canvas.CanvasSelector);
		if (!root) {
			throw new Error(`Shotstack canvas root element '${Canvas.CanvasSelector}' not found.`);
		}

		// Check WebGL support before attempting PixiJS initialization
		const webglSupport = checkWebGLSupport();
		if (!webglSupport.supported) {
			createWebGLErrorOverlay(root);
			return;
		}

		const rect = root.getBoundingClientRect();
		this.viewportSize =
			rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : { width: this.edit.size.width, height: this.edit.size.height };

		this.registerExtensions();

		this.container = new pixi.Container();

		this.background = new pixi.Graphics();
		this.background.fillStyle = { color: "#F0F1F5" };
		this.background.rect(0, 0, this.viewportSize.width, this.viewportSize.height);
		this.background.fill();

		this.viewportContainer = new pixi.Container();
		this.viewportContainer.sortableChildren = true;

		this.editBackground = new pixi.Graphics();
		this.editBackground.fillStyle = { color: this.edit.getTimelineBackground() };
		this.editBackground.rect(0, 0, this.edit.size.width, this.edit.size.height);
		this.editBackground.fill();
		this.viewportContainer.addChild(this.editBackground);

		this.viewportMask = new pixi.Graphics();
		this.viewportMask.rect(0, 0, this.edit.size.width, this.edit.size.height);
		this.viewportMask.fill(0xffffff);
		this.viewportContainer.addChild(this.viewportMask);
		this.viewportContainer.setMask({ mask: this.viewportMask });

		this.subscribeToEditEvents();

		await this.configureApplication();
		this.configureStage();

		const tracks = this.edit.getTracks();
		for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
			for (const player of tracks[trackIndex]) {
				this.addPlayerToTrack(player, trackIndex);
			}
		}

		this.setupTouchHandling(root);
		this.zoomToFit();

		root.appendChild(this.application.canvas);

		// Auto-mount UIController to canvas root (toolbars sit inside canvas)
		// mount() handles deferred positioning via double rAF
		this.uiController?.mount(root);
	}

	private setupTouchHandling(root: HTMLDivElement): void {
		this.canvasRoot = root;
		root.addEventListener("wheel", this.onWheelBound, { passive: false, capture: true });
	}

	private onWheel(e: WheelEvent): void {
		// Allow scrolling in toolbar popups
		const target = e.target as HTMLElement;
		if (target.closest(".ss-toolbar-popup") || target.closest(".ss-canvas-toolbar-popup")) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		if (e.ctrlKey && this.viewportContainer) {
			const scaleFactor = Math.exp(-e.deltaY / 100);
			const newZoom = this.currentZoom * scaleFactor;
			const oldZoom = this.currentZoom;
			this.currentZoom = Math.min(Math.max(newZoom, this.minZoom), this.maxZoom);

			const stageCenter = {
				x: this.application.canvas.width / 2,
				y: this.application.canvas.height / 2
			};

			const distanceFromCenter = {
				x: this.viewportContainer.position.x - stageCenter.x,
				y: this.viewportContainer.position.y - stageCenter.y
			};

			const zoomRatio = this.currentZoom / oldZoom;

			this.viewportContainer.position.x = stageCenter.x + distanceFromCenter.x * zoomRatio;
			this.viewportContainer.position.y = stageCenter.y + distanceFromCenter.y * zoomRatio;

			this.viewportContainer.scale.x = this.currentZoom;
			this.viewportContainer.scale.y = this.currentZoom;

			this.syncContentTransforms();
		}
	}

	public centerEdit(): void {
		if (!this.viewportContainer) {
			return;
		}

		this.viewportContainer.position = {
			x: this.application.canvas.width / 2 - (this.edit.size.width * this.currentZoom) / 2,
			y: this.application.canvas.height / 2 - (this.edit.size.height * this.currentZoom) / 2
		};

		this.syncContentTransforms();
	}

	public zoomToFit(padding: number = 40): void {
		if (!this.viewportContainer) {
			return;
		}

		const availableWidth = this.viewportSize.width - padding * 2;
		const availableHeight = this.viewportSize.height - padding * 2;

		const widthRatio = availableWidth / this.edit.size.width;
		const heightRatio = availableHeight / this.edit.size.height;

		const idealZoom = Math.min(widthRatio, heightRatio);

		this.currentZoom = Math.min(Math.max(idealZoom, this.minZoom), this.maxZoom);

		this.viewportContainer.scale.x = this.currentZoom;
		this.viewportContainer.scale.y = this.currentZoom;

		this.centerEdit(); // Also syncs overlay and toolbar positions
	}

	public resize(): void {
		const root = document.querySelector<HTMLDivElement>(Canvas.CanvasSelector);
		if (!root) return;

		const rect = root.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;

		this.viewportSize = { width: rect.width, height: rect.height };

		// Resize Pixi renderer
		this.application.renderer.resize(rect.width, rect.height);

		// Redraw background
		if (this.background) {
			this.background.clear();
			this.background.rect(0, 0, this.viewportSize.width, this.viewportSize.height);
			this.background.fill({ color: 0xf0f1f5 });
		}

		// Update stage hit area
		this.application.stage.hitArea = new pixi.Rectangle(0, 0, this.viewportSize.width, this.viewportSize.height);

		// Reposition content and UI elements
		this.zoomToFit();
	}

	public setZoom(zoom: number): void {
		if (!this.viewportContainer) return;

		this.currentZoom = Math.min(Math.max(zoom, this.minZoom), this.maxZoom);
		this.viewportContainer.scale.x = this.currentZoom;
		this.viewportContainer.scale.y = this.currentZoom;

		this.syncContentTransforms();
	}

	public getZoom(): number {
		return this.currentZoom;
	}

	/**
	 * Sync overlay container and toolbar positions after content transforms change.
	 * Single point of update for all position-dependent UI elements.
	 */
	private syncContentTransforms(): void {
		if (!this.viewportContainer) return;

		this.overlayContainer.scale.x = this.currentZoom;
		this.overlayContainer.scale.y = this.currentZoom;
		this.overlayContainer.position.x = this.viewportContainer.position.x;
		this.overlayContainer.position.y = this.viewportContainer.position.y;
		this.uiController?.updateToolbarPositions();
	}

	/**
	 * Get the pixel bounds of the canvas content (edit area) within the viewport.
	 * Used for positioning toolbars adjacent to the canvas content.
	 */
	public getContentBounds(): { left: number; right: number; top: number; bottom: number } {
		const scaledWidth = this.edit.size.width * this.currentZoom;
		const scaledHeight = this.edit.size.height * this.currentZoom;
		const posX = this.viewportContainer?.position.x ?? 0;
		const posY = this.viewportContainer?.position.y ?? 0;

		return {
			left: posX,
			right: posX + scaledWidth,
			top: posY,
			bottom: posY + scaledHeight
		};
	}

	public registerTimeline(timeline: Timeline): void {
		this.timeline = timeline;
	}

	/**
	 * Get the viewport container for coordinate transforms.
	 * Used by selection handles, export coordinator, and other components
	 * that need to convert between viewport and world coordinates.
	 */
	public getViewportContainer(): pixi.Container {
		if (!this.viewportContainer) {
			throw new Error("Viewport container not initialized. Call load() first.");
		}
		return this.viewportContainer;
	}

	// ─── Player Container Management ─────────────────────────────────────────────

	/**
	 * Add a player to the appropriate track container.
	 * @internal Used by PlayerReconciler
	 */
	public addPlayerToTrack(player: Player, trackIndex: number): void {
		if (!this.viewportContainer) return;

		const zIndex = 100000 - (trackIndex + 1) * TRACK_Z_INDEX_PADDING;
		const trackContainerKey = `shotstack-track-${zIndex}`;
		let trackContainer = this.viewportContainer.getChildByLabel(trackContainerKey, false);

		if (!trackContainer) {
			trackContainer = new pixi.Container({ label: trackContainerKey, zIndex });
			this.viewportContainer.addChild(trackContainer);
		}

		trackContainer.addChild(player.getContainer());
	}

	/**
	 * Move a player's container between track containers.
	 * @internal Used by PlayerReconciler
	 */
	public movePlayerBetweenTracks(player: Player, fromTrackIdx: number, toTrackIdx: number): void {
		if (!this.viewportContainer || fromTrackIdx === toTrackIdx) return;

		const fromZIndex = 100000 - (fromTrackIdx + 1) * TRACK_Z_INDEX_PADDING;
		const toZIndex = 100000 - (toTrackIdx + 1) * TRACK_Z_INDEX_PADDING;

		const fromTrackContainerKey = `shotstack-track-${fromZIndex}`;
		const toTrackContainerKey = `shotstack-track-${toZIndex}`;

		const fromTrackContainer = this.viewportContainer.getChildByLabel(fromTrackContainerKey, false);
		let toTrackContainer = this.viewportContainer.getChildByLabel(toTrackContainerKey, false);

		// Create new track container if it doesn't exist
		if (!toTrackContainer) {
			toTrackContainer = new pixi.Container({ label: toTrackContainerKey, zIndex: toZIndex });
			this.viewportContainer.addChild(toTrackContainer);
		}

		// Move player container
		if (fromTrackContainer) {
			fromTrackContainer.removeChild(player.getContainer());
		}
		toTrackContainer.addChild(player.getContainer());

		// Force re-sort
		this.viewportContainer.sortDirty = true;
	}

	/**
	 * Remove an empty track container.
	 * @internal Used by PlayerReconciler
	 */
	public removeTrackContainer(trackIndex: number): void {
		if (!this.viewportContainer) return;

		const zIndex = 100000 - (trackIndex + 1) * TRACK_Z_INDEX_PADDING;
		const trackContainerKey = `shotstack-track-${zIndex}`;
		const trackContainer = this.viewportContainer.getChildByLabel(trackContainerKey, false);

		if (trackContainer) {
			this.viewportContainer.removeChild(trackContainer);
		}
	}

	/**
	 * Update the edit background and viewport mask when size changes.
	 * Called from Edit when output size is changed.
	 */
	public updateViewportForSize(width: number, height: number, backgroundColor: string): void {
		if (this.editBackground) {
			this.editBackground.clear();
			this.editBackground.fillStyle = { color: backgroundColor };
			this.editBackground.rect(0, 0, width, height);
			this.editBackground.fill();
		}

		if (this.viewportMask) {
			this.viewportMask.clear();
			this.viewportMask.rect(0, 0, width, height);
			this.viewportMask.fill(0xffffff);
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Event Subscriptions (Edit → Canvas visual sync)
	// ─────────────────────────────────────────────────────────────

	/**
	 * Subscribe to Edit events for visual synchronization.
	 * Canvas reacts to these events to update PIXI visuals.
	 */
	private subscribeToEditEvents(): void {
		this.edit.events.on(InternalEvent.PlayerAddedToTrack, this.onPlayerAddedToTrack);
		this.edit.events.on(InternalEvent.PlayerMovedBetweenTracks, this.onPlayerMovedBetweenTracks);
		this.edit.events.on(InternalEvent.PlayerRemovedFromTrack, this.onPlayerRemovedFromTrack);
		this.edit.events.on(InternalEvent.TrackContainerRemoved, this.onTrackContainerRemoved);
		this.edit.events.on(InternalEvent.ViewportSizeChanged, this.onViewportSizeChanged);
		this.edit.events.on(InternalEvent.ViewportNeedsZoomToFit, this.onViewportNeedsZoomToFit);
	}

	private onPlayerAddedToTrack = ({ player, trackIndex }: { player: Player; trackIndex: number }): void => {
		this.addPlayerToTrack(player, trackIndex);
	};

	private onPlayerMovedBetweenTracks = ({
		player,
		fromTrackIndex,
		toTrackIndex
	}: {
		player: Player;
		fromTrackIndex: number;
		toTrackIndex: number;
	}): void => {
		this.movePlayerBetweenTracks(player, fromTrackIndex, toTrackIndex);
	};

	private onPlayerRemovedFromTrack = ({ player, trackIndex }: { player: Player; trackIndex: number }): void => {
		if (!this.viewportContainer) return;

		const zIndex = 100000 - (trackIndex + 1) * TRACK_Z_INDEX_PADDING;
		const trackContainerKey = `shotstack-track-${zIndex}`;
		const trackContainer = this.viewportContainer.getChildByLabel(trackContainerKey, false);

		if (trackContainer) {
			trackContainer.removeChild(player.getContainer());
		}
	};

	private onTrackContainerRemoved = ({ trackIndex }: { trackIndex: number }): void => {
		this.removeTrackContainer(trackIndex);
	};

	private onViewportSizeChanged = ({ width, height, backgroundColor }: { width: number; height: number; backgroundColor: string }): void => {
		this.updateViewportForSize(width, height, backgroundColor);
	};

	private onViewportNeedsZoomToFit = (): void => {
		this.zoomToFit();
	};

	private registerExtensions(): void {
		if (!Canvas.extensionsRegistered) {
			pixi.extensions.add(new AudioLoadParser());
			pixi.extensions.add(new FontLoadParser());
			pixi.extensions.add(new SubtitleLoadParser());
			Canvas.extensionsRegistered = true;
		}
	}

	private async configureApplication(): Promise<void> {
		const options: Partial<pixi.ApplicationOptions> = {
			background: "#000000",
			width: this.viewportSize.width,
			height: this.viewportSize.height,
			antialias: true,
			powerPreference: "high-performance",
			eventFeatures: {
				globalMove: true, // Required for drag handling in SelectionHandles
				move: true,
				click: true,
				wheel: true
			},
			gcActive: false,
			manageImports: false
		};

		await this.application.init(options);
		this.application.ticker.add(this.onTickBound);

		this.application.ticker.minFPS = 60;
		this.application.ticker.maxFPS = 60;
	}

	private onTick(ticker: pixi.Ticker): void {
		this.edit.update(ticker.deltaTime, ms(ticker.deltaMS));
		this.edit.draw();

		// Update canvas overlays (selection handles, guides, etc.)
		this.uiController?.updateOverlays(ticker.deltaTime, ticker.deltaMS);

		if (this.timeline) {
			this.timeline.draw();
		}
	}

	private configureStage(): void {
		if (!this.container || !this.background || !this.viewportContainer) {
			throw new Error("Shotstack canvas container not set up.");
		}

		this.container.addChild(this.background);
		this.container.addChild(this.viewportContainer);
		this.container.addChild(this.overlayContainer); // Above content for handles/guides

		this.application.stage.addChild(this.container);

		this.application.stage.eventMode = "static";
		this.application.stage.hitArea = new pixi.Rectangle(0, 0, this.viewportSize.width, this.viewportSize.height);

		this.background.eventMode = "static";
		this.background.on("pointerdown", this.onBackgroundClickBound);
	}

	private onBackgroundClick(event: pixi.FederatedPointerEvent): void {
		if (event.target === this.background) {
			this.edit.events.emit(InternalEvent.CanvasBackgroundClicked);
		}
	}

	public pauseTicker(): void {
		this.application.ticker.remove(this.onTickBound);
	}

	public resumeTicker(): void {
		this.application.ticker.add(this.onTickBound);
	}

	public dispose(): void {
		const root = document.querySelector<HTMLDivElement>(Canvas.CanvasSelector);
		if (root && root.contains(this.application.canvas)) {
			root.removeChild(this.application.canvas);
		}

		this.application.ticker.remove(this.onTickBound);
		this.background?.off("pointerdown", this.onBackgroundClickBound);

		// Remove wheel listener from canvas root
		this.canvasRoot?.removeEventListener("wheel", this.onWheelBound, { capture: true });
		this.canvasRoot = null;

		// Clean up viewport container elements
		this.editBackground?.destroy();
		this.viewportMask?.destroy();
		this.viewportContainer?.destroy();

		this.background?.destroy();
		this.overlayContainer.destroy();
		this.container?.destroy();

		this.uiController = null;
		this.application.destroy(true, { children: true, texture: true });
	}
}
