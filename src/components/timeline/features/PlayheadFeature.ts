import { TimelineFeature } from "../core/TimelineFeature";
import { ITimelineRenderer } from "../interfaces";
import { TimelinePointerEvent, TimelineWheelEvent, StateChanges } from "../types";
import * as PIXI from "pixi.js";

/**
 * Handles playhead visualization and interaction for timeline seeking
 * Manages both ruler click-to-seek and playhead handle dragging
 */
export class PlayheadFeature extends TimelineFeature {
	public readonly name = "playhead";

	// Visual components
	private playheadLine: PIXI.Graphics | null = null;
	private playheadHandle: PIXI.Graphics | null = null;
	private playheadContainer: PIXI.Container | null = null;

	// Interaction state
	private isDragging: boolean = false;
	private dragStartX: number = 0;
	private dragStartTime: number = 0;

	// Timeline dimensions
	private timelineHeight: number = 150;
	private rulerHeight: number = 30;

	// Visual properties
	private readonly playheadColor = 0xff0000;
	private readonly playheadWidth = 2;
	private readonly handleSize = 10;

	// Cached state values for performance
	private currentTime: number = 0;
	private pixelsPerSecond: number = 100;
	private scrollX: number = 0;
	private viewportWidth: number = 0;

	public onEnable(): void {
		// Initialize state values from current state
		const state = this.state.getState();
		this.currentTime = state.playback.currentTime;
		this.pixelsPerSecond = state.viewport.zoom;
		this.scrollX = state.viewport.scrollX;
		this.viewportWidth = state.viewport.width;
		this.timelineHeight = state.viewport.height;
		
		// Create playhead visuals when feature is enabled
		this.createPlayheadVisuals();
		
		// Set initial position based on current playback time
		this.updatePlayheadPosition();
	}

	public onDisable(): void {
		// Clean up visuals when feature is disabled
		this.destroyPlayheadVisuals();
	}

	/**
	 * Handle pointer down events for ruler clicks and playhead dragging
	 */
	public handlePointerDown?(event: TimelinePointerEvent): void {
		// Get local coordinates from the event
		const localX = event.global.x;
		const localY = event.global.y;
		
		// Check if click is on ruler area (top 30px)
		if (localY < this.rulerHeight) {
			// Ruler click - seek to position
			this.handleRulerClick(event);
			return; // Consume the event
		}
		
		// Check if click is on playhead handle
		if (this.isOnPlayheadHandle(event)) {
			// Start dragging playhead handle
			this.startDragging(event);
			return; // Consume the event
		}
	}

	/**
	 * Handle pointer move events for playhead dragging
	 */
	public handlePointerMove?(event: TimelinePointerEvent): void {
		if (this.isDragging) {
			this.updateDragging(event);
		}
	}

	/**
	 * Handle pointer up events to end dragging
	 */
	public handlePointerUp?(event: TimelinePointerEvent): void {
		if (this.isDragging) {
			this.endDragging(event);
		}
	}

	/**
	 * Update playhead position when state changes
	 */
	public override onStateChanged?(changes: StateChanges): void {
		const state = this.state.getState();
		
		// Update cached values if they changed
		if (changes.playback) {
			this.currentTime = state.playback.currentTime;
		}
		
		if (changes.viewport) {
			this.pixelsPerSecond = state.viewport.zoom;
			this.scrollX = state.viewport.scrollX;
			this.viewportWidth = state.viewport.width;
			this.timelineHeight = state.viewport.height;
		}
		
		// Update position if playback time or viewport changed
		if (changes.playback || changes.viewport) {
			this.updatePlayheadPosition();
		}
	}

	/**
	 * Render any overlay elements (not used for playhead)
	 */
	public renderOverlay(renderer: ITimelineRenderer): void {
		// Playhead renders to its own layer, not as an overlay
	}

	/**
	 * Create the playhead visual components
	 */
	private createPlayheadVisuals(): void {
		// Get the renderer to access layers
		const renderer = this.getRenderer();
		
		// Create container for all playhead elements
		this.playheadContainer = new PIXI.Container();
		this.playheadContainer.label = "playhead-container";
		
		// Create the playhead line
		this.playheadLine = new PIXI.Graphics();
		this.playheadLine.label = "playhead-line";
		
		// Create the playhead handle (triangle at top)
		this.playheadHandle = new PIXI.Graphics();
		this.playheadHandle.label = "playhead-handle";
		
		// Make handle interactive for dragging
		this.playheadHandle.eventMode = "static";
		this.playheadHandle.cursor = "ew-resize";
		
		// Add components to container
		this.playheadContainer.addChild(this.playheadLine);
		this.playheadContainer.addChild(this.playheadHandle);
		
		// Add container to the playhead layer
		const playheadLayer = renderer.getLayer("playhead");
		playheadLayer.addChild(this.playheadContainer);
		
		// Draw the initial visuals
		this.drawPlayheadVisuals();
	}

	/**
	 * Destroy the playhead visual components
	 */
	private destroyPlayheadVisuals(): void {
		if (this.playheadContainer) {
			// Remove from parent
			this.playheadContainer.parent?.removeChild(this.playheadContainer);
			
			// Destroy graphics
			if (this.playheadLine) {
				this.playheadLine.clear();
				this.playheadLine.destroy();
				this.playheadLine = null;
			}
			
			if (this.playheadHandle) {
				this.playheadHandle.clear();
				this.playheadHandle.destroy();
				this.playheadHandle = null;
			}
			
			// Destroy container
			this.playheadContainer.destroy({ children: true });
			this.playheadContainer = null;
		}
	}

	/**
	 * Update playhead position based on current time and viewport
	 */
	private updatePlayheadPosition(): void {
		if (!this.playheadContainer) return;
		
		// Calculate the x position of the playhead
		const x = this.calculateXFromTime(this.currentTime);
		
		// Update container position
		this.playheadContainer.x = x;
		
		// Hide playhead if it's outside the visible area
		const isVisible = x >= -10 && x <= this.viewportWidth + 10;
		this.playheadContainer.visible = isVisible;
	}

	/**
	 * Handle click on ruler to seek
	 */
	private handleRulerClick(event: TimelinePointerEvent): void {
		// Calculate time from click position
		const clickX = event.global.x;
		const timeAtClick = this.calculateTimeFromX(clickX);
		
		// Clamp time to valid range
		const duration = this.context.edit.getTotalDuration();
		const clampedTime = Math.max(0, Math.min(timeAtClick, duration));
		
		// Seek to the calculated time
		this.seekToTime(clampedTime);
		
		// Visual feedback is handled by state update
		console.log(`Ruler clicked: seeking to ${clampedTime.toFixed(2)}s`);
	}

	/**
	 * Check if pointer is over playhead handle
	 */
	private isOnPlayheadHandle(event: TimelinePointerEvent): boolean {
		// TODO: Implement hit detection
		return false;
	}

	/**
	 * Start dragging the playhead
	 */
	private startDragging(event: TimelinePointerEvent): void {
		// TODO: Implement drag start
		this.isDragging = true;
		console.log("Started dragging playhead");
	}

	/**
	 * Update playhead position while dragging
	 */
	private updateDragging(event: TimelinePointerEvent): void {
		// TODO: Implement drag update
		console.log("Dragging playhead to", event.x);
	}

	/**
	 * End playhead dragging
	 */
	private endDragging(event: TimelinePointerEvent): void {
		// TODO: Implement drag end
		this.isDragging = false;
		console.log("Ended dragging playhead");
	}

	/**
	 * Calculate time from x coordinate
	 */
	private calculateTimeFromX(x: number): number {
		// Convert screen x to timeline time
		const timelineX = x + this.scrollX;
		const time = timelineX / this.pixelsPerSecond;
		return Math.max(0, time);
	}

	/**
	 * Calculate x coordinate from time
	 */
	private calculateXFromTime(time: number): number {
		// Convert timeline time to screen x
		const timelineX = time * this.pixelsPerSecond;
		const screenX = timelineX - this.scrollX;
		return screenX;
	}

	/**
	 * Seek to a specific time
	 */
	private seekToTime(time: number): void {
		// Use edit's seek method to update playback time
		this.context.edit.seek(time * 1000); // Convert to milliseconds
	}

	/**
	 * Get the renderer for accessing layers
	 */
	private getRenderer(): ITimelineRenderer {
		return this.context.timeline.getRenderer();
	}

	/**
	 * Draw the playhead graphics
	 */
	private drawPlayheadVisuals(): void {
		if (!this.playheadLine || !this.playheadHandle) return;
		
		// Clear existing graphics
		this.playheadLine.clear();
		this.playheadHandle.clear();
		
		// Draw the playhead line
		this.playheadLine
			.moveTo(0, 0)
			.lineTo(0, this.timelineHeight)
			.stroke({ width: this.playheadWidth, color: this.playheadColor });
		
		// Draw the playhead handle (triangle at top)
		const handleHalfSize = this.handleSize / 2;
		this.playheadHandle
			.poly([
				0, 0,                    // Top point
				-handleHalfSize, -this.handleSize,  // Bottom left
				handleHalfSize, -this.handleSize    // Bottom right
			])
			.fill({ color: this.playheadColor });
		
		// Set a larger hit area for easier dragging
		this.playheadHandle.hitArea = new PIXI.Rectangle(
			-this.handleSize,
			-this.handleSize * 1.5,
			this.handleSize * 2,
			this.handleSize * 2
		);
	}
}