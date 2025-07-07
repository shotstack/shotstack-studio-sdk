import { Edit } from "@core/edit";
import { Size } from "@core/layouts/geometry";
import * as PIXI from "pixi.js";

import { Timeline as NewTimeline } from "./core/Timeline";
import { TimelineOptions } from "./types";

/**
 * Bridge class that provides backward compatibility with the old Timeline interface
 * while using the new Timeline architecture internally
 */
export class TimelineBridge {
	private timeline: NewTimeline;
	private edit: Edit;
	private size: Size;
	private canvas: HTMLCanvasElement | null = null;

	constructor(edit: Edit, size: Size) {
		this.edit = edit;
		this.size = size;

		// Create new timeline with options
		const options: TimelineOptions = {
			edit,
			size,
			pixelsPerSecond: 100,
			autoScrollEnabled: true,
			snapEnabled: true,
			snapGridSize: 1 / 30 // 30fps
		};

		this.timeline = new NewTimeline(options);
	}

	public async load(): Promise<void> {
		await this.timeline.load();

		// Create canvas element for compatibility
		const renderer = this.timeline.getRenderer();
		const app = renderer.getApplication();
		this.canvas = app.view as HTMLCanvasElement;

		// Set up input event handlers
		if (this.canvas) {
			this.canvas.addEventListener("pointerdown", this.handlePointerDown.bind(this));
			this.canvas.addEventListener("pointermove", this.handlePointerMove.bind(this));
			this.canvas.addEventListener("pointerup", this.handlePointerUp.bind(this));
			this.canvas.addEventListener("wheel", this.handleWheel.bind(this));
		}

		// Set up keyboard event handlers
		document.addEventListener("keydown", this.handleKeyDown.bind(this));
		document.addEventListener("keyup", this.handleKeyUp.bind(this));

		// Load some test data for now
		this.loadTestData();
	}

	public update(deltaTime: number, deltaMs: number): void {
		this.timeline.update(deltaTime, deltaMs);
	}

	public draw(): void {
		this.timeline.draw();
	}

	public dispose(): void {
		// Remove event listeners
		if (this.canvas) {
			this.canvas.removeEventListener("pointerdown", this.handlePointerDown.bind(this));
			this.canvas.removeEventListener("pointermove", this.handlePointerMove.bind(this));
			this.canvas.removeEventListener("pointerup", this.handlePointerUp.bind(this));
			this.canvas.removeEventListener("wheel", this.handleWheel.bind(this));
		}

		document.removeEventListener("keydown", this.handleKeyDown.bind(this));
		document.removeEventListener("keyup", this.handleKeyUp.bind(this));

		this.timeline.dispose();
	}

	public getCanvas(): HTMLCanvasElement | null {
		return this.canvas;
	}

	public getContainer(): PIXI.Container {
		return this.timeline.getContainer();
	}

	// Compatibility methods
	public get pixelsPerSecond(): number {
		return this.timeline.getState().viewport.zoom;
	}

	public set pixelsPerSecond(value: number) {
		const state = this.timeline.getState();
		this.timeline.setState({
			viewport: {
				...state.viewport,
				zoom: value
			}
		});
	}

	public get scrollPosition(): number {
		return this.timeline.getState().viewport.scrollX;
	}

	public set scrollPosition(value: number) {
		const state = this.timeline.getState();
		this.timeline.setState({
			viewport: {
				...state.viewport,
				scrollX: value
			}
		});
	}

	public refresh(): void {
		// The new timeline automatically refreshes on state changes
		this.timeline.draw();
	}

	// Event handlers
	private handlePointerDown(event: PointerEvent): void {
		this.timeline.handlePointerDown(event);
	}

	private handlePointerMove(event: PointerEvent): void {
		this.timeline.handlePointerMove(event);
	}

	private handlePointerUp(event: PointerEvent): void {
		this.timeline.handlePointerUp(event);
	}

	private handleWheel(event: WheelEvent): void {
		this.timeline.handleWheel(event);
	}

	private handleKeyDown(event: KeyboardEvent): void {
		this.timeline.handleKeyDown(event);
	}

	private handleKeyUp(event: KeyboardEvent): void {
		this.timeline.handleKeyUp(event);
	}

	private loadTestData(): void {
		// Add some test tracks and clips for demonstration
		const renderer = this.timeline.getRenderer();

		// Add a few tracks
		for (let i = 0; i < 3; i++) {
			const track = renderer.addTrack(`track-${i}`, i);

			// Add some clips to each track
			if (track) {
				const { TimelineClip } = require("./entities/TimelineClip");

				for (let j = 0; j < 2; j++) {
					const clipId = `clip-${i}-${j}`;
					const startTime = j * 5; // 5 seconds apart
					const duration = 3; // 3 seconds each

					const clip = new TimelineClip(clipId, track.getTrackId(), startTime, duration, {
						asset: {
							type: ["video", "audio", "image", "text"][Math.floor(Math.random() * 4)],
							text: `Clip ${i}-${j}`
						}
					});

					clip.load().then(() => {
						clip.setPixelsPerSecond(this.pixelsPerSecond);
						track.addClip(clip);
					});
				}
			}
		}
	}
}
