import * as PIXI from "pixi.js";

export interface RendererOptions {
	width: number;
	height: number;
	backgroundColor: number;
	antialias: boolean;
	resolution: number;
}

export class TimelineRenderer {
	private app!: PIXI.Application;
	private trackLayer!: PIXI.Container;
	private overlayLayer!: PIXI.Container;
	private animationFrameId: number | null = null;

	constructor(
		private options: RendererOptions,
		private onUpdate: (deltaTime: number, elapsed: number) => void
	) {}

	public async initializePixiApp(): Promise<void> {
		this.app = new PIXI.Application();

		await this.app.init({
			width: this.options.width,
			height: this.options.height,
			backgroundColor: this.options.backgroundColor,
			antialias: this.options.antialias,
			resolution: this.options.resolution,
			autoDensity: true,
			preference: "webgl"
		});

		// Find timeline container element and attach canvas
		const timelineElement = document.querySelector("[data-shotstack-timeline]") as HTMLElement;
		if (!timelineElement) {
			throw new Error("Timeline container element [data-shotstack-timeline] not found");
		}

		timelineElement.appendChild(this.app.canvas);
	}

	public async setupRenderLayers(): Promise<void> {
		// Create ordered layers for proper z-ordering
		this.trackLayer = new PIXI.Container();
		this.overlayLayer = new PIXI.Container();

		// Set up layer properties
		this.trackLayer.label = "track-layer";
		this.overlayLayer.label = "overlay-layer";

		// Add layers to stage in correct order
		this.app.stage.addChild(this.trackLayer);
		this.app.stage.addChild(this.overlayLayer);
	}

	/** @internal */
	public startAnimationLoop(): void {
		let lastTime = performance.now();

		const animate = (currentTime: number) => {
			const deltaMS = currentTime - lastTime;
			lastTime = currentTime;

			// Convert to PIXI-style deltaTime (frame-based)
			const deltaTime = deltaMS / 16.667;

			this.onUpdate(deltaTime, deltaMS);
			this.draw();

			this.animationFrameId = requestAnimationFrame(animate);
		};

		this.animationFrameId = requestAnimationFrame(animate);
	}

	/** @internal */
	public draw(): void {
		// Render the PIXI application
		this.app.render();
	}

	public render(): void {
		this.app.render();
	}

	public updateBackgroundColor(color: number): void {
		if (this.app) {
			this.app.renderer.background.color = color;
		}
	}

	public getApp(): PIXI.Application {
		return this.app;
	}

	public getStage(): PIXI.Container {
		return this.app.stage;
	}

	/** @internal */
	public getTrackLayer(): PIXI.Container {
		return this.trackLayer;
	}

	/** @internal */
	public getOverlayLayer(): PIXI.Container {
		return this.overlayLayer;
	}

	public dispose(): void {
		// Stop animation loop
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}

		// Destroy PIXI application
		if (this.app) {
			this.app.destroy(true);
		}
	}
}
