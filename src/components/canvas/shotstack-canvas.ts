import { Inspector } from "@canvas/system/inspector";
import { Edit } from "@core/edit";
import { AssetToolbar } from "@core/ui/asset-toolbar";
import { CanvasToolbar } from "@core/ui/canvas-toolbar";
import { MediaToolbar } from "@core/ui/media-toolbar";
import { RichTextToolbar } from "@core/ui/rich-text-toolbar";
import { TextToolbar } from "@core/ui/text-toolbar";
import { TranscriptionIndicator } from "@core/ui/transcription-indicator";
import { type Size } from "@layouts/geometry";
import { AudioLoadParser } from "@loaders/audio-load-parser";
import { FontLoadParser } from "@loaders/font-load-parser";
import { SubtitleLoadParser } from "@loaders/subtitle-load-parser";
import * as pixi from "pixi.js";

import type { Timeline } from "../timeline/timeline";

export class Canvas {
	/** @internal */
	public static readonly CanvasSelector = "[data-shotstack-studio]";

	private static extensionsRegistered = false;

	private viewportSize: Size = { width: 0, height: 0 };
	/** @internal */
	public readonly application: pixi.Application;

	private readonly edit: Edit;
	private readonly inspector: Inspector;
	private readonly transcriptionIndicator: TranscriptionIndicator;
	private readonly richTextToolbar: RichTextToolbar;
	private readonly textToolbar: TextToolbar;
	private readonly mediaToolbar: MediaToolbar;
	private readonly canvasToolbar: CanvasToolbar;
	private readonly assetToolbar: AssetToolbar;

	private container?: pixi.Container;
	private background?: pixi.Graphics;
	private timeline?: Timeline;

	private minZoom = 0.1;
	private maxZoom = 4;
	private currentZoom = 1;

	private onTickBound: (ticker: pixi.Ticker) => void;
	private onBackgroundClickBound: (event: pixi.FederatedPointerEvent) => void;
	private lastInspectorUpdate: number = 0;

	constructor(edit: Edit) {
		this.application = new pixi.Application();
		this.edit = edit;
		this.inspector = new Inspector();
		this.transcriptionIndicator = new TranscriptionIndicator();
		this.richTextToolbar = new RichTextToolbar(edit);
		this.textToolbar = new TextToolbar(edit);
		this.mediaToolbar = new MediaToolbar(edit);
		this.canvasToolbar = new CanvasToolbar(edit);
		this.assetToolbar = new AssetToolbar(edit);
		this.onTickBound = this.onTick.bind(this);
		this.onBackgroundClickBound = this.onBackgroundClick.bind(this);

		edit.setCanvas(this);
	}

	public async load(): Promise<void> {
		const root = document.querySelector<HTMLDivElement>(Canvas.CanvasSelector);
		if (!root) {
			throw new Error(`Shotstack canvas root element '${Canvas.CanvasSelector}' not found.`);
		}

		const rect = root.getBoundingClientRect();
		this.viewportSize =
			rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : { width: this.edit.size.width, height: this.edit.size.height };

		this.registerExtensions();

		this.container = new pixi.Container();
		this.background = new pixi.Graphics();
		this.background.fillStyle = { color: "#424242" };
		this.background.rect(0, 0, this.viewportSize.width, this.viewportSize.height);
		this.background.fill();

		await this.configureApplication();
		await this.inspector.load();
		await this.transcriptionIndicator.load();
		this.configureStage();
		this.setupTouchHandling(root);
		this.zoomToFit();

		root.appendChild(this.application.canvas);

		this.richTextToolbar.mount(root);
		this.textToolbar.mount(root);
		this.mediaToolbar.mount(root);
		this.setupClipToolbarListeners();

		this.canvasToolbar.mount(root);
		this.setupCanvasToolbarListeners();
		this.syncCanvasToolbarState();
		this.updateCanvasToolbarPosition();

		this.assetToolbar.mount(root);
		this.updateAssetToolbarPosition();
	}

	private setupTouchHandling(root: HTMLDivElement): void {
		const edit = this.edit.getContainer();

		root.addEventListener(
			"wheel",
			(e: WheelEvent) => {
				// Allow scrolling in toolbar popups
				const target = e.target as HTMLElement;
				if (target.closest(".ss-toolbar-popup")) {
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
		this.updateAssetToolbarPosition();
		this.updateCanvasToolbarPosition();
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
			this.background.fill({ color: 0x424242 });
		}

		// Update stage hit area
		this.application.stage.hitArea = new pixi.Rectangle(0, 0, this.viewportSize.width, this.viewportSize.height);

		// Reposition content and UI elements
		this.zoomToFit();
	}

	private updateAssetToolbarPosition(): void {
		const editContainer = this.edit.getContainer();
		this.assetToolbar.setPosition(editContainer.position.x);
	}

	private updateCanvasToolbarPosition(): void {
		const editContainer = this.edit.getContainer();
		const editRightEdge = editContainer.position.x + this.edit.size.width * this.currentZoom;
		this.canvasToolbar.setPosition(this.viewportSize.width, editRightEdge);
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

		this.inspector.fps = Math.ceil(ticker.FPS);
		this.inspector.playbackTime = this.edit.playbackTime;
		this.inspector.playbackDuration = this.edit.totalDuration;
		this.inspector.isPlaying = this.edit.isPlaying;

		// Pass comprehensive memory stats (throttled - every 500ms)
		const now = performance.now();
		if (now - this.lastInspectorUpdate > 500) {
			this.lastInspectorUpdate = now;
			const comprehensiveStats = this.edit.getComprehensiveMemoryStats();
			this.inspector.textureStats = comprehensiveStats.textureStats;
			this.inspector.assetDetails = comprehensiveStats.assetDetails;
			this.inspector.systemStats = comprehensiveStats.systemStats;

			// Pass playback health stats
			this.inspector.playbackHealth = this.edit.getPlaybackHealth();

			// Also update legacy stats for backward compatibility
			const memoryStats = this.edit.getMemoryStats();
			this.inspector.clipCounts = memoryStats.clipCounts;
			this.inspector.totalClips = memoryStats.totalClips;
			this.inspector.richTextCacheStats = memoryStats.richTextCacheStats;
			this.inspector.textPlayerCount = memoryStats.textPlayerCount;
			this.inspector.lumaMaskCount = memoryStats.lumaMaskCount;
			this.inspector.commandHistorySize = memoryStats.commandHistorySize;
			this.inspector.trackCount = memoryStats.trackCount;
		}

		this.inspector.update(ticker.deltaTime, ticker.deltaMS);
		this.inspector.draw();

		this.transcriptionIndicator.update(ticker.deltaTime, ticker.deltaMS);

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
		this.container.addChild(this.inspector.getContainer());
		this.container.addChild(this.transcriptionIndicator.getContainer());

		this.transcriptionIndicator.setPosition(this.viewportSize.width - 10, 10);

		this.application.stage.addChild(this.container);

		this.application.stage.eventMode = "static";
		this.application.stage.hitArea = new pixi.Rectangle(0, 0, this.viewportSize.width, this.viewportSize.height);

		this.background.eventMode = "static";
		this.background.on("pointerdown", this.onBackgroundClickBound);

		this.setupTranscriptionEventListeners();
	}

	private setupTranscriptionEventListeners(): void {
		this.edit.events.on("transcription:progress", (payload: { message?: string }) => {
			const message = payload.message ?? "Transcribing...";
			this.transcriptionIndicator.show(message);
			this.transcriptionIndicator.setPosition(this.viewportSize.width - this.transcriptionIndicator.getWidth() - 10, 10);
		});

		this.edit.events.on("transcription:complete", () => {
			this.transcriptionIndicator.hide();
		});

		this.edit.events.on("transcription:error", () => {
			this.transcriptionIndicator.hide();
		});
	}

	private setupClipToolbarListeners(): void {
		this.edit.events.on("clip:selected", ({ trackIndex, clipIndex }) => {
			const player = this.edit.getPlayerClip(trackIndex, clipIndex);
			const assetType = player?.clipConfiguration.asset.type;

			if (assetType === "rich-text") {
				this.mediaToolbar.hide();
				this.textToolbar.hide();
				this.richTextToolbar.show(trackIndex, clipIndex);
			} else if (assetType === "text") {
				this.mediaToolbar.hide();
				this.richTextToolbar.hide();
				this.textToolbar.show(trackIndex, clipIndex);
			} else if (assetType === "video" || assetType === "image" || assetType === "audio") {
				this.richTextToolbar.hide();
				this.textToolbar.hide();
				this.mediaToolbar.showMedia(trackIndex, clipIndex, assetType);
			} else {
				this.richTextToolbar.hide();
				this.textToolbar.hide();
				this.mediaToolbar.hide();
			}
		});

		this.edit.events.on("selection:cleared", () => {
			this.richTextToolbar.hide();
			this.textToolbar.hide();
			this.mediaToolbar.hide();
		});
	}

	private setupCanvasToolbarListeners(): void {
		this.canvasToolbar.onResolutionChange((width, height) => {
			this.edit.setOutputSize(width, height);
		});

		this.canvasToolbar.onFpsChange(fps => {
			this.edit.setOutputFps(fps);
		});

		this.canvasToolbar.onBackgroundChange(color => {
			this.edit.setTimelineBackground(color);
		});
	}

	private syncCanvasToolbarState(): void {
		const { size } = this.edit;
		this.canvasToolbar.setResolution(size.width, size.height);

		const fps = this.edit.getOutputFps();
		this.canvasToolbar.setFps(fps);

		const background = this.edit.getTimelineBackground();
		this.canvasToolbar.setBackground(background);
	}

	private onBackgroundClick(event: pixi.FederatedPointerEvent): void {
		if (event.target === this.background) {
			this.edit.events.emit("canvas:background:clicked", {});
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
		this.container?.destroy();

		this.inspector.dispose();
		this.transcriptionIndicator.dispose();
		this.richTextToolbar.dispose();
		this.textToolbar.dispose();
		this.mediaToolbar.dispose();
		this.canvasToolbar.dispose();
		this.assetToolbar.dispose();

		this.application.destroy(true, { children: true, texture: true });
	}
}
