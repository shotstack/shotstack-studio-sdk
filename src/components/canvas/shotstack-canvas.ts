import { createWebGLErrorOverlay } from "@canvas/webgl-error-overlay";
import { Edit } from "@core/edit-session";
import { InternalEvent } from "@core/events/edit-events";
import type { UIController } from "@core/ui/ui-controller";
import { checkWebGLSupport } from "@core/webgl-support";
import { type Size } from "@layouts/geometry";
import { AudioLoadParser } from "@loaders/audio-load-parser";
import { FontLoadParser } from "@loaders/font-load-parser";
import { SubtitleLoadParser } from "@loaders/subtitle-load-parser";
import type { Timeline } from "@timeline/index";
import * as pixi from "pixi.js";

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

	private container?: pixi.Container;
	private background?: pixi.Graphics;
	private timeline?: Timeline;
	private uiController: UIController | null = null;

	private minZoom = 0.1;
	private maxZoom = 4;
	private currentZoom = 1;

	private onTickBound: (ticker: pixi.Ticker) => void;
	private onBackgroundClickBound: (event: pixi.FederatedPointerEvent) => void;

	constructor(edit: Edit) {
		this.application = new pixi.Application();
		this.edit = edit;
		this.overlayContainer = new pixi.Container();
		this.overlayContainer.sortableChildren = true;
		this.onTickBound = this.onTick.bind(this);
		this.onBackgroundClickBound = this.onBackgroundClick.bind(this);

		edit.setCanvas(this);
	}

	/**
	 * Register a UIController to receive tick updates for canvas overlays.
	 * Call this after creating the UIController with this Canvas instance.
	 */
	registerUIController(controller: UIController): void {
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

		await this.configureApplication();
		this.configureStage();
		this.setupTouchHandling(root);
		this.zoomToFit();

		root.appendChild(this.application.canvas);
	}

	private setupTouchHandling(root: HTMLDivElement): void {
		const edit = this.edit.getContainer();

		root.addEventListener(
			"wheel",
			(e: WheelEvent) => {
				// Allow scrolling in toolbar popups
				const target = e.target as HTMLElement;
				if (target.closest(".ss-toolbar-popup") || target.closest(".ss-canvas-toolbar-popup")) {
					return;
				}

				e.preventDefault();
				e.stopPropagation();

				if (e.ctrlKey) {
					const scaleFactor = Math.exp(-e.deltaY / 100);
					const newZoom = this.currentZoom * scaleFactor;
					const oldZoom = this.currentZoom;
					this.currentZoom = Math.min(Math.max(newZoom, this.minZoom), this.maxZoom);

					const stageCenter = {
						x: this.application.canvas.width / 2,
						y: this.application.canvas.height / 2
					};

					const distanceFromCenter = {
						x: edit.position.x - stageCenter.x,
						y: edit.position.y - stageCenter.y
					};

					const zoomRatio = this.currentZoom / oldZoom;

					edit.position.x = stageCenter.x + distanceFromCenter.x * zoomRatio;
					edit.position.y = stageCenter.y + distanceFromCenter.y * zoomRatio;

					edit.scale.x = this.currentZoom;
					edit.scale.y = this.currentZoom;
				}
			},
			{
				passive: false,
				capture: true
			}
		);
	}

	public centerEdit(): void {
		if (!this.edit) {
			return;
		}

		const edit = this.edit.getContainer();
		edit.position = {
			x: this.application.canvas.width / 2 - (this.edit.size.width * this.currentZoom) / 2,
			y: this.application.canvas.height / 2 - (this.edit.size.height * this.currentZoom) / 2
		};
	}

	public zoomToFit(padding: number = 40): void {
		if (!this.edit) {
			return;
		}

		const availableWidth = this.viewportSize.width - padding * 2;
		const availableHeight = this.viewportSize.height - padding * 2;

		const widthRatio = availableWidth / this.edit.size.width;
		const heightRatio = availableHeight / this.edit.size.height;

		const idealZoom = Math.min(widthRatio, heightRatio);

		this.currentZoom = Math.min(Math.max(idealZoom, this.minZoom), this.maxZoom);

		const edit = this.edit.getContainer();
		edit.scale.x = this.currentZoom;
		edit.scale.y = this.currentZoom;

		this.centerEdit();
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
		this.currentZoom = Math.min(Math.max(zoom, this.minZoom), this.maxZoom);
		const edit = this.edit.getContainer();
		edit.scale.x = this.currentZoom;
		edit.scale.y = this.currentZoom;
	}

	public getZoom(): number {
		return this.currentZoom;
	}

	public registerTimeline(timeline: Timeline): void {
		this.timeline = timeline;
	}

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
			antialias: true
		};

		await this.application.init(options);
		this.application.ticker.add(this.onTickBound);

		this.application.ticker.minFPS = 60;
		this.application.ticker.maxFPS = 60;
	}

	private onTick(ticker: pixi.Ticker): void {
		this.edit.update(ticker.deltaTime, ticker.deltaMS);
		this.edit.draw();

		// Update canvas overlays (selection handles, guides, etc.)
		this.uiController?.updateOverlays(ticker.deltaTime, ticker.deltaMS);

		if (this.timeline) {
			this.timeline.update(ticker.deltaTime, ticker.deltaMS);
			this.timeline.draw();
		}
	}

	private configureStage(): void {
		if (!this.container || !this.background) {
			throw new Error("Shotstack canvas container not set up.");
		}

		this.container.addChild(this.background);
		this.container.addChild(this.edit.getContainer());
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

		this.background?.destroy();
		this.overlayContainer.destroy();
		this.container?.destroy();

		this.uiController = null;
		this.application.destroy(true, { children: true, texture: true });
	}
}
