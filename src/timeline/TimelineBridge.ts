import { Edit } from "@core/edit";
import { Size } from "@core/layouts/geometry";
import * as PIXI from "pixi.js";

import { Timeline as NewTimeline } from "./core/Timeline";

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

		// Create new timeline with simplified constructor
		this.timeline = new NewTimeline(edit, size);
		
		// Set default configuration
		this.timeline.setPixelsPerSecond(100);
		this.timeline.setAutoScroll(true);
		this.timeline.setSnapping(true, 1 / 30); // 30fps
	}

	public async load(): Promise<void> {
		await this.timeline.load();

		// Get canvas element for compatibility
		// Since Timeline now handles DOM internally, we need to query for it
		const container = document.querySelector(NewTimeline.TimelineSelector);
		if (container) {
			this.canvas = container.querySelector('canvas') as HTMLCanvasElement;
		}

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
		// Test data loading temporarily disabled
		// TODO: Add track/clip management API to Timeline
	}
}
