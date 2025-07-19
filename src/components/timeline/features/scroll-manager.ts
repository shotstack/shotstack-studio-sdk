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

		// Check for Ctrl/Cmd key for zoom
		if (event.ctrlKey || event.metaKey) {
			this.handleZoom(event);
			return;
		}

		this.handleScroll(event);
	}

	private handleZoom(event: WheelEvent): void {
			// Handle zoom
			const zoomDirection = event.deltaY > 0 ? 'out' : 'in';
			
			// Get playhead time position
			const playheadTime = this.timeline.getPlayheadTime();
			
			// Get actual edit duration (not extended duration)
			// The timeline.timeRange.endTime includes the 1.5x buffer, we need the actual duration
			const actualEditDuration = this.timeline.getActualEditDuration();
			
			// Store current pixels per second before zoom
			const currentPixelsPerSecond = this.timeline.getOptions().pixelsPerSecond || 50;
			
			// Calculate playhead position in pixels before zoom
			const playheadXBeforeZoom = playheadTime * currentPixelsPerSecond;
			
			// Perform zoom
			if (zoomDirection === 'in') {
				this.timeline.zoomIn();
			} else {
				this.timeline.zoomOut();
			}
			
			// Get new pixels per second after zoom
			const newPixelsPerSecond = this.timeline.getOptions().pixelsPerSecond || 50;
			
			// Calculate playhead position in pixels after zoom
			const playheadXAfterZoom = playheadTime * newPixelsPerSecond;
			
			// Calculate viewport dimensions
			const viewportWidth = this.timeline.getOptions().width || 800;
			
			// Use the extended duration for content width (includes buffer space)
			const extendedDuration = this.timeline.timeRange.endTime;
			const contentWidth = extendedDuration * newPixelsPerSecond;
			
			// But ensure playhead doesn't go beyond actual edit duration
			const maxPlayheadX = actualEditDuration * newPixelsPerSecond;
			
			// Calculate the new scroll position to keep playhead in view
			const newScrollX = this.calculateZoomScrollPosition({
				playheadXAfterZoom,
				viewportWidth,
				contentWidth,
				maxPlayheadX,
				actualEditDuration,
				playheadTime
			});
			
			// Update scroll position
			this.scrollX = newScrollX;
			this.timeline.setScroll(this.scrollX, this.scrollY);
			
			// Emit zoom event with actual focus position
			const actualFocusX = playheadXAfterZoom - newScrollX;
			this.events.emit("zoom" as keyof TimelineFeatureEvents, { 
				pixelsPerSecond: newPixelsPerSecond,
				focusX: actualFocusX,
				focusTime: playheadTime
			});
	}

	private handleScroll(event: WheelEvent): void {
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

	private calculateZoomScrollPosition(params: {
		playheadXAfterZoom: number;
		viewportWidth: number;
		contentWidth: number;
		maxPlayheadX: number;
		actualEditDuration: number;
		playheadTime: number;
	}): number {
		const {
			playheadXAfterZoom,
			viewportWidth,
			contentWidth,
			maxPlayheadX,
			actualEditDuration,
			playheadTime
		} = params;

		// Calculate ideal scroll to center playhead
		const idealScrollX = playheadXAfterZoom - (viewportWidth / 2);
		
		// Calculate scroll bounds
		const maxScroll = Math.max(0, contentWidth - viewportWidth);
		
		// Determine the best scroll position
		let newScrollX: number;
		
		// First, check if we're trying to show beyond the actual edit duration
		const rightEdgeOfViewport = idealScrollX + viewportWidth;
		const maxAllowedScroll = Math.max(0, maxPlayheadX - viewportWidth);
		
		if (contentWidth <= viewportWidth) {
			// Content fits in viewport, no scroll needed
			newScrollX = 0;
		} else if (idealScrollX < 0) {
			// Would scroll past start, align to start
			newScrollX = 0;
		} else if (rightEdgeOfViewport > maxPlayheadX && playheadTime <= actualEditDuration) {
			// Would show beyond actual edit duration, limit scroll
			// Position viewport so its right edge aligns with the actual edit end
			newScrollX = Math.min(maxAllowedScroll, maxScroll);
		} else if (idealScrollX > maxScroll) {
			// Would scroll past end of extended timeline
			newScrollX = maxScroll;
		} else {
			// Can center playhead normally
			newScrollX = idealScrollX;
		}
		
		// Double-check that playhead remains visible
		const playheadInViewport = playheadXAfterZoom - newScrollX;
		if (playheadInViewport < 0 || playheadInViewport > viewportWidth) {
			// This shouldn't happen, but if it does, adjust to keep playhead visible
			if (playheadXAfterZoom > contentWidth - viewportWidth) {
				// Playhead near end, show it at right edge of viewport
				newScrollX = Math.max(0, playheadXAfterZoom - viewportWidth + 50); // 50px padding from edge
			} else {
				// Show playhead with some padding from left edge
				newScrollX = Math.max(0, playheadXAfterZoom - 50);
			}
			// Re-clamp to valid bounds
			newScrollX = Math.max(0, Math.min(newScrollX, maxScroll));
		}

		return newScrollX;
	}

	public dispose(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = undefined;
		}
		this.events.clear("*");
	}
}