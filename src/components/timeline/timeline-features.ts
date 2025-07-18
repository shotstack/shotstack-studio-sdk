/* eslint-disable max-classes-per-file */
import { EventEmitter } from "@core/events/event-emitter";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../core/theme";
import { Timeline } from "./timeline";

// Constants for timeline features
export const TIMELINE_CONSTANTS = {
	RULER: {
		DEFAULT_HEIGHT: 40,
		MAJOR_MARKER_HEIGHT_RATIO: 0.8,
		MINOR_MARKER_HEIGHT_RATIO: 0.6,
		MINOR_MARKER_TENTH_HEIGHT_RATIO: 0.3,
		LABEL_FONT_SIZE: 10,
		LABEL_PADDING_X: 2,
		LABEL_PADDING_Y: 2,
		MINOR_MARKER_ZOOM_THRESHOLD: 20,
		LABEL_INTERVAL_ZOOMED: 1,
		LABEL_INTERVAL_DEFAULT: 5,
		LABEL_ZOOM_THRESHOLD: 50
	},
	PLAYHEAD: {
		LINE_WIDTH: 2,
		HANDLE_WIDTH: 10,
		HANDLE_HEIGHT: 10,
		HANDLE_OFFSET_Y: -10,
		HANDLE_OFFSET_X: 5
	},
	GRID: {
		LINE_WIDTH: 1,
		INTERVAL_ZOOMED: 1,
		INTERVAL_DEFAULT: 5,
		ZOOM_THRESHOLD: 50
	},
	SCROLL: {
		HORIZONTAL_SPEED: 2,
		VERTICAL_SPEED: 0.5
	}
} as const;

// Type-safe event definitions
export interface TimelineFeatureEvents {
	'ruler:seeked': { time: number };
	'playhead:seeked': { time: number };
	'playhead:timeChanged': { time: number };
	'scroll': { x: number; y: number };
}

export interface TimelineFeatures {
	ruler: RulerFeature;
	playhead: PlayheadFeature;
	grid: GridFeature;
	scroll: ScrollManager;
}

// Parameter object interfaces
export interface RulerFeatureOptions {
	pixelsPerSecond: number;
	timelineDuration: number;
	rulerHeight?: number;
	theme?: TimelineTheme;
}

export interface PlayheadFeatureOptions {
	pixelsPerSecond: number;
	timelineHeight: number;
	theme?: TimelineTheme;
}

export interface GridFeatureOptions {
	pixelsPerSecond: number;
	timelineDuration: number;
	timelineHeight: number;
	trackHeight: number;
	theme?: TimelineTheme;
}

export interface ScrollManagerOptions {
	timeline: Timeline;
}

export class RulerFeature extends Entity {
	public events: EventEmitter;
	private rulerContainer: PIXI.Container;
	private rulerBackground: PIXI.Graphics;
	private timeMarkers: PIXI.Graphics;
	private timeLabels: PIXI.Container;

	private pixelsPerSecond: number;
	private timelineDuration: number;
	private rulerHeight: number;
	private theme?: TimelineTheme;

	constructor(options: RulerFeatureOptions) {
		super();
		this.events = new EventEmitter();
		this.pixelsPerSecond = options.pixelsPerSecond;
		this.timelineDuration = options.timelineDuration;
		this.rulerHeight = options.rulerHeight ?? TIMELINE_CONSTANTS.RULER.DEFAULT_HEIGHT;
		this.theme = options.theme;

		this.rulerContainer = new PIXI.Container();
		this.rulerBackground = new PIXI.Graphics();
		this.timeMarkers = new PIXI.Graphics();
		this.timeLabels = new PIXI.Container();
	}

	async load(): Promise<void> {
		this.setupRuler();
		this.draw();
	}

	private setupRuler(): void {
		this.rulerContainer.label = "ruler";
		this.rulerContainer.addChild(this.rulerBackground);
		this.rulerContainer.addChild(this.timeMarkers);
		this.rulerContainer.addChild(this.timeLabels);

		// Make ruler interactive for click-to-seek
		this.rulerContainer.eventMode = "static";
		this.rulerContainer.cursor = "pointer";

		this.rulerContainer.on("pointerdown", this.onRulerPointerDown.bind(this));

		this.getContainer().addChild(this.rulerContainer);
	}

	private drawRulerBackground(): void {
		this.rulerBackground.clear();
		const rulerWidth = this.timelineDuration * this.pixelsPerSecond;
		const rulerColor = this.theme?.colors.structure.ruler || 0x404040;
		const borderColor = this.theme?.colors.structure.border || 0x606060;
		
		this.rulerBackground.rect(0, 0, rulerWidth, this.rulerHeight);
		this.rulerBackground.fill(rulerColor);
		this.rulerBackground.rect(0, this.rulerHeight - 1, rulerWidth, 1);
		this.rulerBackground.fill(borderColor);
	}

	private drawTimeMarkers(): void {
		this.timeMarkers.clear();
		
		const majorMarkerColor = this.theme?.colors.ui.icon || 0x888888;
		const minorMarkerColor = this.theme?.colors.ui.iconMuted || 0x666666;

		// Major markers every second
		for (let second = 0; second <= this.timelineDuration; second += 1) {
			const x = second * this.pixelsPerSecond;
			const height = second % 5 === 0 
				? this.rulerHeight * TIMELINE_CONSTANTS.RULER.MAJOR_MARKER_HEIGHT_RATIO 
				: this.rulerHeight * TIMELINE_CONSTANTS.RULER.MINOR_MARKER_HEIGHT_RATIO;

			this.timeMarkers.rect(x, this.rulerHeight - height, 1, height);
			this.timeMarkers.fill(majorMarkerColor);
		}

		// Minor markers every 0.1 seconds if zoomed in enough
		if (this.pixelsPerSecond > TIMELINE_CONSTANTS.RULER.MINOR_MARKER_ZOOM_THRESHOLD) {
			for (let tenth = 0; tenth <= this.timelineDuration * 10; tenth += 1) {
				if (tenth % 10 !== 0) {
					// Skip major markers
					const x = (tenth / 10) * this.pixelsPerSecond;
					const height = this.rulerHeight * TIMELINE_CONSTANTS.RULER.MINOR_MARKER_TENTH_HEIGHT_RATIO;

					this.timeMarkers.rect(x, this.rulerHeight - height, 1, height);
					this.timeMarkers.fill(minorMarkerColor);
				}
			}
		}
	}

	private drawTimeLabels(): void {
		this.timeLabels.removeChildren();

		// Labels every 5 seconds or every second if zoomed in
		const labelInterval = this.pixelsPerSecond > TIMELINE_CONSTANTS.RULER.LABEL_ZOOM_THRESHOLD 
			? TIMELINE_CONSTANTS.RULER.LABEL_INTERVAL_ZOOMED 
			: TIMELINE_CONSTANTS.RULER.LABEL_INTERVAL_DEFAULT;

		for (let second = 0; second <= this.timelineDuration; second += labelInterval) {
			const x = second * this.pixelsPerSecond;
			const timeText = this.formatTime(second);

			const textColor = this.theme?.colors.ui.textMuted || 0xcccccc;
			const label = new PIXI.Text({
				text: timeText,
				style: {
					fontSize: TIMELINE_CONSTANTS.RULER.LABEL_FONT_SIZE,
					fill: textColor,
					fontFamily: "Arial"
				}
			});

			label.x = x + TIMELINE_CONSTANTS.RULER.LABEL_PADDING_X;
			label.y = TIMELINE_CONSTANTS.RULER.LABEL_PADDING_Y;
			this.timeLabels.addChild(label);
		}
	}

	private formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
	}

	private onRulerPointerDown(event: PIXI.FederatedPointerEvent): void {
		// Convert global to local coordinates within the ruler
		const localPos = this.rulerContainer.toLocal(event.global);
		const time = Math.max(0, localPos.x / this.pixelsPerSecond);
		this.events.emit("ruler:seeked" as keyof TimelineFeatureEvents, { time });
	}

	public updateRuler(pixelsPerSecond: number, timelineDuration: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.timelineDuration = timelineDuration;
		this.draw();
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// Ruler is static unless parameters change
	}

	public draw(): void {
		this.drawRulerBackground();
		this.drawTimeMarkers();
		this.drawTimeLabels();
	}

	public dispose(): void {
		this.timeLabels.removeChildren();
		this.rulerContainer.removeChildren();
		this.events.clear("*");
	}
}

export class PlayheadFeature extends Entity {
	public events: EventEmitter;
	private playheadContainer: PIXI.Container;
	private playheadLine: PIXI.Graphics;
	private playheadHandle: PIXI.Graphics;

	private pixelsPerSecond: number;
	private timelineHeight: number;
	private currentTime = 0;
	private isDragging = false;
	private theme?: TimelineTheme;

	constructor(options: PlayheadFeatureOptions) {
		super();
		this.events = new EventEmitter();
		this.pixelsPerSecond = options.pixelsPerSecond;
		this.timelineHeight = options.timelineHeight;
		this.theme = options.theme;

		this.playheadContainer = new PIXI.Container();
		this.playheadLine = new PIXI.Graphics();
		this.playheadHandle = new PIXI.Graphics();
	}

	async load(): Promise<void> {
		this.setupPlayhead();
		this.draw();
	}

	private setupPlayhead(): void {
		this.playheadContainer.label = "playhead";
		this.playheadContainer.addChild(this.playheadLine);
		this.playheadContainer.addChild(this.playheadHandle);

		// Make playhead interactive
		this.playheadContainer.eventMode = "static";
		this.playheadContainer.cursor = "pointer";

		this.playheadContainer.on("pointerdown", this.onPlayheadPointerDown.bind(this));
		this.playheadContainer.on("pointermove", this.onPlayheadPointerMove.bind(this));
		this.playheadContainer.on("pointerup", this.onPlayheadPointerUp.bind(this));
		this.playheadContainer.on("pointerupoutside", this.onPlayheadPointerUp.bind(this));

		this.getContainer().addChild(this.playheadContainer);
	}

	private drawPlayhead(): void {
		const x = this.currentTime * this.pixelsPerSecond;
		const playheadColor = this.theme?.colors.interaction.playhead || 0xff4444;

		// Draw playhead line
		this.playheadLine.clear();
		this.playheadLine.rect(x, 0, TIMELINE_CONSTANTS.PLAYHEAD.LINE_WIDTH, this.timelineHeight);
		this.playheadLine.fill(playheadColor);

		// Draw playhead handle
		this.playheadHandle.clear();
		this.playheadHandle.rect(
			x - TIMELINE_CONSTANTS.PLAYHEAD.HANDLE_OFFSET_X, 
			TIMELINE_CONSTANTS.PLAYHEAD.HANDLE_OFFSET_Y, 
			TIMELINE_CONSTANTS.PLAYHEAD.HANDLE_WIDTH, 
			TIMELINE_CONSTANTS.PLAYHEAD.HANDLE_HEIGHT
		);
		this.playheadHandle.fill(playheadColor);
	}

	private onPlayheadPointerDown(event: PIXI.FederatedPointerEvent): void {
		this.isDragging = true;
		this.playheadContainer.cursor = "grabbing";
		this.updateTimeFromPointer(event);
	}

	private onPlayheadPointerMove(event: PIXI.FederatedPointerEvent): void {
		if (this.isDragging) {
			this.updateTimeFromPointer(event);
		}
	}

	private onPlayheadPointerUp(): void {
		this.isDragging = false;
		this.playheadContainer.cursor = "pointer";
	}

	private updateTimeFromPointer(event: PIXI.FederatedPointerEvent): void {
		// Convert global to local coordinates within the playhead container's parent
		const localPos = this.playheadContainer.parent.toLocal(event.global);
		const newTime = Math.max(0, localPos.x / this.pixelsPerSecond);
		this.setTime(newTime);
		// Emit seek event so Edit can update its playback time
		this.events.emit("playhead:seeked" as keyof TimelineFeatureEvents, { time: newTime });
	}

	public setTime(time: number): void {
		this.currentTime = time;
		this.draw();
		this.events.emit("playhead:timeChanged" as keyof TimelineFeatureEvents, { time });
	}

	public getTime(): number {
		return this.currentTime;
	}

	public updatePlayhead(pixelsPerSecond: number, timelineHeight: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.timelineHeight = timelineHeight;
		this.draw();
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// Playhead updates are event-driven
	}

	public draw(): void {
		this.drawPlayhead();
	}

	public dispose(): void {
		this.playheadContainer.removeAllListeners();
		this.playheadContainer.removeChildren();
		this.events.clear("*");
	}
}

export class GridFeature extends Entity {
	public events: EventEmitter;
	private gridContainer: PIXI.Container;
	private gridLines: PIXI.Graphics;

	private pixelsPerSecond: number;
	private timelineDuration: number; // Duration in seconds
	private timelineHeight: number;
	private trackHeight: number;
	private isVisible = true;
	private theme?: TimelineTheme;

	constructor(options: GridFeatureOptions) {
		super();
		this.events = new EventEmitter();
		this.pixelsPerSecond = options.pixelsPerSecond;
		this.timelineDuration = options.timelineDuration;
		this.timelineHeight = options.timelineHeight;
		this.trackHeight = options.trackHeight;
		this.theme = options.theme;

		this.gridContainer = new PIXI.Container();
		this.gridLines = new PIXI.Graphics();
	}

	async load(): Promise<void> {
		this.setupGrid();
		this.draw();
	}

	private setupGrid(): void {
		this.gridContainer.label = "grid";
		this.gridContainer.addChild(this.gridLines);
		this.getContainer().addChild(this.gridContainer);
	}

	private drawGrid(): void {
		if (!this.isVisible) {
			this.gridLines.clear();
			return;
		}

		this.gridLines.clear();

		// Calculate width based on duration
		const extendedWidth = this.timelineDuration * this.pixelsPerSecond;

		// Vertical grid lines (time markers)
		const gridInterval = this.pixelsPerSecond > TIMELINE_CONSTANTS.GRID.ZOOM_THRESHOLD 
			? TIMELINE_CONSTANTS.GRID.INTERVAL_ZOOMED 
			: TIMELINE_CONSTANTS.GRID.INTERVAL_DEFAULT;
		const gridColor = this.theme?.colors.interaction.snapGuide || 0x333333;

		for (let time = 0; time <= this.timelineDuration; time += gridInterval) {
			const x = time * this.pixelsPerSecond;
			this.gridLines.rect(x, 0, TIMELINE_CONSTANTS.GRID.LINE_WIDTH, this.timelineHeight);
			this.gridLines.fill(gridColor);
		}

		// Horizontal grid lines (track separators)
		const trackCount = Math.ceil(this.timelineHeight / this.trackHeight);

		for (let track = 0; track <= trackCount; track += 1) {
			const y = track * this.trackHeight;
			this.gridLines.rect(0, y, extendedWidth, TIMELINE_CONSTANTS.GRID.LINE_WIDTH);
			this.gridLines.fill(gridColor);
		}
	}

	public updateGrid(pixelsPerSecond: number, timelineDuration: number, timelineHeight: number, trackHeight: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.timelineDuration = timelineDuration;
		this.timelineHeight = timelineHeight;
		this.trackHeight = trackHeight;
		this.draw();
	}

	public setVisible(visible: boolean): void {
		this.isVisible = visible;
		this.draw();
	}

	public isGridVisible(): boolean {
		return this.isVisible;
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// Grid is static unless parameters change
	}

	public draw(): void {
		this.drawGrid();
	}

	public dispose(): void {
		this.gridContainer.removeChildren();
		this.events.clear("*");
	}
}

export class ScrollManager extends Entity {
	public events: EventEmitter;
	private timeline: Timeline;
	private abortController?: AbortController;

	// Scroll state
	private scrollX = 0;
	private scrollY = 0;

	constructor(options: ScrollManagerOptions) {
		super();
		this.events = new EventEmitter();
		this.timeline = options.timeline;
	}

	async load(): Promise<void> {
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

	public update(_deltaTime: number, _elapsed: number): void {
		// ScrollManager doesn't need frame-based updates
	}

	public draw(): void {
		// ScrollManager doesn't render anything itself
	}

	public dispose(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = undefined;
		}
		this.events.clear("*");
	}
}
