import * as pixi from "pixi.js";

import { Edit } from "./entities/edit";
import { Inspector } from "./entities/inspector";
import { type Size } from "./layouts/geometry";
import { AudioLoadParser } from "./loaders/audio-load-parser";
import { FontLoadParser } from "./loaders/font-load-parser";

export class Canvas {
	/** @internal */
	public static readonly CanvasSelector = "[data-shotstack-studio]";

	private static extensionsRegistered = false;

	private readonly size: Size;
	/** @internal */
	public readonly application: pixi.Application;

	private readonly edit: Edit;
	private readonly inspector: Inspector;

	private container?: pixi.Container;
	private background?: pixi.Graphics;

	private minZoom = 0.1;
	private maxZoom = 4;
	private currentZoom = 0.8;

	constructor(size: Size, edit: Edit) {
		this.size = size;
		this.application = new pixi.Application();

		this.edit = edit;
		this.inspector = new Inspector();
	}

	public async load(): Promise<void> {
		const root = document.querySelector<HTMLDivElement>(Canvas.CanvasSelector);
		if (!root) {
			throw new Error(`Shotstack canvas root element '${Canvas.CanvasSelector}' not found.`);
		}

		this.registerExtensions();

		this.container = new pixi.Container();
		this.background = new pixi.Graphics();
		this.background.fillStyle = { color: "#424242" };
		this.background.rect(0, 0, this.size.width, this.size.height);
		this.background.fill();

		await this.configureApplication();
		this.configureStage();

		this.setupTouchHandling(root);
		this.edit.getContainer().scale = this.currentZoom;

		root.appendChild(this.application.canvas);
	}

	private setupTouchHandling(root: HTMLDivElement): void {
		const edit = this.edit.getContainer();

		root.addEventListener(
			"wheel",
			(e: WheelEvent) => {
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

	public zoomToFit(): void {
		if (!this.edit) {
			return;
		}

		const widthRatio = this.application.canvas.width / this.edit.size.width;
		const heightRatio = this.application.canvas.height / this.edit.size.height;

		const idealZoom = Math.min(widthRatio, heightRatio);

		this.currentZoom = Math.min(Math.max(idealZoom, this.minZoom), this.maxZoom);

		const edit = this.edit.getContainer();
		edit.scale.x = this.currentZoom;
		edit.scale.y = this.currentZoom;

		this.centerEdit();
	}

	public setZoom(zoom: number): void {
		this.currentZoom = Math.min(Math.max(zoom, this.minZoom), this.maxZoom);
		const edit = this.edit.getContainer();
		edit.scale.x = this.currentZoom;
		edit.scale.y = this.currentZoom;
	}

	private registerExtensions(): void {
		if (!Canvas.extensionsRegistered) {
			pixi.extensions.add(new AudioLoadParser());
			pixi.extensions.add(new FontLoadParser());
			Canvas.extensionsRegistered = true;
		}
	}

	private async configureApplication(): Promise<void> {
		const options: Partial<pixi.ApplicationOptions> = {
			background: "#000000",
			width: this.size.width,
			height: this.size.height,
			antialias: true
		};

		await this.application.init(options);
		this.application.ticker.add(this.onTick.bind(this));

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

		this.inspector.update(ticker.deltaTime, ticker.deltaMS);
		this.inspector.draw();
	}

	private configureStage(): void {
		if (!this.container || !this.background) {
			throw new Error("Shotstack canvas container not set up.");
		}

		this.container.addChild(this.background);
		this.container.addChild(this.edit.getContainer());
		this.container.addChild(this.inspector.getContainer());

		this.application.stage.addChild(this.container);

		this.application.stage.eventMode = "static";
		this.application.stage.hitArea = new pixi.Rectangle(0, 0, this.size.width, this.size.height);

		this.application.stage.on("click", this.onClick.bind(this));

		this.edit.getContainer().position = {
			x: this.application.canvas.width / 2 - (this.edit.size.width * this.currentZoom) / 2,
			y: this.application.canvas.height / 2 - (this.edit.size.height * this.currentZoom) / 2
		};
	}

	private onClick(): void {
		this.edit.pause();
	}

	public dispose(): void {
		const root = document.querySelector<HTMLDivElement>(Canvas.CanvasSelector);
		if (root && root.contains(this.application.canvas)) {
			root.removeChild(this.application.canvas);
		}

		this.application.ticker.remove(this.onTick, this);
		this.application.stage.off("click", this.onClick, this);

		this.background?.destroy();
		this.container?.destroy();

		this.inspector.dispose();

		this.application.destroy(true, { children: true, texture: true });
	}
}
