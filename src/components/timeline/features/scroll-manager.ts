import { EventEmitter } from "@core/events/event-emitter";

import { TIMELINE_CONSTANTS, TimelineFeatureEvents, ScrollManagerOptions, TimelineReference } from "./types";

export class ScrollManager {
	public events: EventEmitter;
	private timeline: TimelineReference;
	private abortController?: AbortController;

	// Scroll state
	private scrollX = 0;
	private scrollY = 0;

	constructor(options: ScrollManagerOptions) {
		this.events = new EventEmitter();
		this.timeline = options.timeline;
	}

	public async initialize(): Promise<void> {
		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this.abortController = new AbortController();

		// Get the PIXI canvas element
		const {canvas} = this.timeline.getPixiApp();

		// Add wheel event listener for scrolling
		canvas.addEventListener("wheel", this.handleWheel.bind(this), {
			passive: false,
			signal: this.abortController.signal
		});

		// Keyboard navigation disabled for now
		// document.addEventListener('keydown', this.handleKeydown.bind(this), {
		// 	signal: this.abortController.signal
		// });
	}

	private handleWheel(event: WheelEvent): void {
		event.preventDefault();

		// Determine scroll direction based on wheel delta and modifier keys
		let {deltaX} = event;
		let {deltaY} = event;

		// Shift key converts vertical scroll to horizontal scroll
		if (event.shiftKey) {
			deltaX = deltaY;
			deltaY = 0;
		}

		// Different scroll speeds for horizontal vs vertical
		const horizontalScrollSpeed = TIMELINE_CONSTANTS.SCROLL.HORIZONTAL_SPEED;
		const verticalScrollSpeed = TIMELINE_CONSTANTS.SCROLL.VERTICAL_SPEED;

		// Update scroll position
		this.scrollX += deltaX * horizontalScrollSpeed;
		this.scrollY += deltaY * verticalScrollSpeed;

		// Apply bounds (prevent negative scrolling and limit based on content)
		this.scrollX = this.clampScrollX(this.scrollX);
		this.scrollY = this.clampScrollY(this.scrollY);

		// Update timeline viewport
		this.timeline.setScroll(this.scrollX, this.scrollY);

		// Emit scroll event
		this.events.emit("scroll" as keyof TimelineFeatureEvents, { x: this.scrollX, y: this.scrollY });
	}

	public setScroll(x: number, y: number): void {
		this.scrollX = this.clampScrollX(x);
		this.scrollY = this.clampScrollY(y);
		this.timeline.setScroll(this.scrollX, this.scrollY);
		this.events.emit("scroll" as keyof TimelineFeatureEvents, { x: this.scrollX, y: this.scrollY });
	}

	private clampScrollX(x: number): number {
		// Calculate max scroll based on extended content width
		const contentWidth = this.timeline.getExtendedTimelineWidth();
		const viewportWidth = this.timeline.getOptions().width || 0;
		const maxScroll = Math.max(0, contentWidth - viewportWidth);

		return Math.max(0, Math.min(x, maxScroll));
	}

	private clampScrollY(y: number): number {
		const layout = this.timeline.getLayout();
		const trackCount = this.timeline.getVisualTracks().length;
		const height = this.timeline.getOptions().height || 0;
		const maxScroll = Math.max(0, trackCount * layout.trackHeight - (height - layout.rulerHeight));
		return Math.max(0, Math.min(y, maxScroll));
	}

	public getScroll(): { x: number; y: number } {
		return { x: this.scrollX, y: this.scrollY };
	}

	public dispose(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = undefined;
		}
		this.events.clear("*");
	}
}