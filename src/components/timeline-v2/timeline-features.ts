import { Entity } from "@core/shared/entity";
import { EventEmitter } from "@core/events/event-emitter";
import * as PIXI from "pixi.js";

export interface TimelineFeatures {
	ruler: RulerFeature;
	playhead: PlayheadFeature;
	grid: GridFeature;
	scroll: ScrollManager;
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
	
	constructor(pixelsPerSecond: number, timelineDuration: number, rulerHeight = 40) {
		super();
		this.events = new EventEmitter();
		this.pixelsPerSecond = pixelsPerSecond;
		this.timelineDuration = timelineDuration;
		this.rulerHeight = rulerHeight;
		
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
		
		this.getContainer().addChild(this.rulerContainer);
	}
	
	private drawRulerBackground(): void {
		this.rulerBackground.clear();
		this.rulerBackground.rect(0, 0, this.timelineDuration * this.pixelsPerSecond, this.rulerHeight);
		this.rulerBackground.fill(0x404040);
		this.rulerBackground.rect(0, this.rulerHeight - 1, this.timelineDuration * this.pixelsPerSecond, 1);
		this.rulerBackground.fill(0x606060);
	}
	
	private drawTimeMarkers(): void {
		this.timeMarkers.clear();
		
		// Major markers every second
		for (let second = 0; second <= this.timelineDuration; second++) {
			const x = second * this.pixelsPerSecond;
			const height = second % 5 === 0 ? this.rulerHeight * 0.8 : this.rulerHeight * 0.6;
			
			this.timeMarkers.rect(x, this.rulerHeight - height, 1, height);
			this.timeMarkers.fill(0x888888);
		}
		
		// Minor markers every 0.1 seconds if zoomed in enough
		if (this.pixelsPerSecond > 20) {
			for (let tenth = 0; tenth <= this.timelineDuration * 10; tenth++) {
				if (tenth % 10 !== 0) { // Skip major markers
					const x = (tenth / 10) * this.pixelsPerSecond;
					const height = this.rulerHeight * 0.3;
					
					this.timeMarkers.rect(x, this.rulerHeight - height, 1, height);
					this.timeMarkers.fill(0x666666);
				}
			}
		}
	}
	
	private drawTimeLabels(): void {
		this.timeLabels.removeChildren();
		
		// Labels every 5 seconds or every second if zoomed in
		const labelInterval = this.pixelsPerSecond > 50 ? 1 : 5;
		
		for (let second = 0; second <= this.timelineDuration; second += labelInterval) {
			const x = second * this.pixelsPerSecond;
			const timeText = this.formatTime(second);
			
			const label = new PIXI.Text({
				text: timeText,
				style: {
					fontSize: 10,
					fill: 0xcccccc,
					fontFamily: 'Arial'
				}
			});
			
			label.x = x + 2;
			label.y = 2;
			this.timeLabels.addChild(label);
		}
	}
	
	private formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
	
	constructor(pixelsPerSecond: number, timelineHeight: number) {
		super();
		this.events = new EventEmitter();
		this.pixelsPerSecond = pixelsPerSecond;
		this.timelineHeight = timelineHeight;
		
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
		this.playheadContainer.eventMode = 'static';
		this.playheadContainer.cursor = 'pointer';
		
		this.playheadContainer.on('pointerdown', this.onPlayheadPointerDown.bind(this));
		this.playheadContainer.on('pointermove', this.onPlayheadPointerMove.bind(this));
		this.playheadContainer.on('pointerup', this.onPlayheadPointerUp.bind(this));
		this.playheadContainer.on('pointerupoutside', this.onPlayheadPointerUp.bind(this));
		
		this.getContainer().addChild(this.playheadContainer);
	}
	
	private drawPlayhead(): void {
		const x = this.currentTime * this.pixelsPerSecond;
		
		// Draw playhead line
		this.playheadLine.clear();
		this.playheadLine.rect(x, 0, 2, this.timelineHeight);
		this.playheadLine.fill(0xff4444);
		
		// Draw playhead handle
		this.playheadHandle.clear();
		this.playheadHandle.rect(x - 5, -10, 10, 10);
		this.playheadHandle.fill(0xff4444);
	}
	
	private onPlayheadPointerDown(event: PIXI.FederatedPointerEvent): void {
		this.isDragging = true;
		this.playheadContainer.cursor = 'grabbing';
		this.updateTimeFromPointer(event);
	}
	
	private onPlayheadPointerMove(event: PIXI.FederatedPointerEvent): void {
		if (this.isDragging) {
			this.updateTimeFromPointer(event);
		}
	}
	
	private onPlayheadPointerUp(): void {
		this.isDragging = false;
		this.playheadContainer.cursor = 'pointer';
	}
	
	private updateTimeFromPointer(event: PIXI.FederatedPointerEvent): void {
		const localX = event.global.x - this.playheadContainer.parent.x;
		const newTime = Math.max(0, localX / this.pixelsPerSecond);
		this.setTime(newTime);
	}
	
	public setTime(time: number): void {
		this.currentTime = time;
		this.draw();
		this.events.emit("playhead:timeChanged", { time });
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
	private timelineWidth: number;
	private timelineHeight: number;
	private trackHeight: number;
	private isVisible = true;
	
	constructor(pixelsPerSecond: number, timelineWidth: number, timelineHeight: number, trackHeight: number) {
		super();
		this.events = new EventEmitter();
		this.pixelsPerSecond = pixelsPerSecond;
		this.timelineWidth = timelineWidth;
		this.timelineHeight = timelineHeight;
		this.trackHeight = trackHeight;
		
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
		
		// Vertical grid lines (time markers)
		const gridInterval = this.pixelsPerSecond > 50 ? 1 : 5; // Every second or every 5 seconds
		const maxTime = this.timelineWidth / this.pixelsPerSecond;
		
		for (let time = 0; time <= maxTime; time += gridInterval) {
			const x = time * this.pixelsPerSecond;
			this.gridLines.rect(x, 0, 1, this.timelineHeight);
			this.gridLines.fill(0x333333);
		}
		
		// Horizontal grid lines (track separators)
		const trackCount = Math.ceil(this.timelineHeight / this.trackHeight);
		
		for (let track = 0; track <= trackCount; track++) {
			const y = track * this.trackHeight;
			this.gridLines.rect(0, y, this.timelineWidth, 1);
			this.gridLines.fill(0x333333);
		}
	}
	
	public updateGrid(pixelsPerSecond: number, timelineWidth: number, timelineHeight: number, trackHeight: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.timelineWidth = timelineWidth;
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
	private timeline: any; // Reference to Timeline v2
	private abortController?: AbortController;
	
	// Scroll state
	private scrollX = 0;
	private scrollY = 0;
	
	constructor(timeline: any) {
		super();
		this.events = new EventEmitter();
		this.timeline = timeline;
	}

	async load(): Promise<void> {
		this.setupEventListeners();
	}
	
	private setupEventListeners(): void {
		this.abortController = new AbortController();
		
		// Get the PIXI canvas element
		const canvas = this.timeline.getPixiApp().canvas;
		
		// Add wheel event listener for scrolling
		canvas.addEventListener('wheel', this.handleWheel.bind(this), {
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
		let deltaX = event.deltaX;
		let deltaY = event.deltaY;
		
		// Shift key converts vertical scroll to horizontal scroll
		if (event.shiftKey) {
			deltaX = deltaY;
			deltaY = 0;
		}
		
		// Different scroll speeds for horizontal vs vertical
		const horizontalScrollSpeed = 2;
		const verticalScrollSpeed = 0.5;
		
		// Update scroll position
		this.scrollX += deltaX * horizontalScrollSpeed;
		this.scrollY += deltaY * verticalScrollSpeed;
		
		// Apply bounds (prevent negative scrolling and limit based on content)
		this.scrollX = Math.max(0, this.scrollX);
		this.scrollY = this.clampScrollY(this.scrollY);
		
		// Update timeline viewport
		this.timeline.setScroll(this.scrollX, this.scrollY);
		
		// Emit scroll event
		this.events.emit('scroll', { x: this.scrollX, y: this.scrollY });
	}
	
	
	public setScroll(x: number, y: number): void {
		this.scrollX = Math.max(0, x);
		this.scrollY = this.clampScrollY(y);
		this.timeline.setScroll(this.scrollX, this.scrollY);
		this.events.emit('scroll', { x: this.scrollX, y: this.scrollY });
	}

	private clampScrollY(y: number): number {
		const layout = this.timeline.getLayout();
		const trackCount = this.timeline.getVisualTracks().length;
		const maxScroll = Math.max(0, trackCount * layout.trackHeight - (this.timeline.getOptions().height - layout.rulerHeight));
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