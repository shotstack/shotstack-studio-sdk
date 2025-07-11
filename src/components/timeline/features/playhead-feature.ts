import * as PIXI from "pixi.js";

import { TimelinePointerEvent, StateChanges } from "../types";
import { ITimelineRenderer } from "../types/timeline.interfaces";

import { TimelineFeature } from "./feature";

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

	// Visual configuration with relative sizing
	private readonly visualConfig = {
		playheadColor: 0xff0000,
		playheadWidth: 2,
		handleSizeRatio: 0.8, // Handle size as ratio of ruler height
		handleOutlineColor: 0xffffff,
		handleOutlineAlpha: 0.5,
		handleHitAreaPaddingRatio: 0.2, // Padding as ratio of handle size
		// Hit area bounds as ratios of handle size
		handleHitAreaTopRatio: -1.7, // Top boundary ratio
		handleHitAreaBottomRatio: 0.7, // Bottom boundary ratio
		// Default dimensions (overridden by state)
		defaultTimelineHeight: 150,
		defaultRulerHeight: 30
	};

	// Cached state values for performance
	private currentTime: number = 0;
	private pixelsPerSecond: number = 100;
	private scrollX: number = 0;
	private viewportWidth: number = 0;
	private timelineHeight: number = 0;
	private rulerHeight: number = 0;

	// Cached handle size (updated when ruler height changes)
	private handleSize: number = 0;

	public onEnable(): void {
		// Initialize state values from current state
		const state = this.state.getState();
		this.currentTime = state.playback.currentTime;
		this.pixelsPerSecond = state.viewport.zoom;
		this.scrollX = state.viewport.scrollX;
		this.viewportWidth = state.viewport.width;
		this.timelineHeight = state.viewport.height || this.visualConfig.defaultTimelineHeight;
		this.rulerHeight = this.visualConfig.defaultRulerHeight; // Could come from state.layout?.rulerHeight

		// Calculate handle size based on ruler height
		this.handleSize = this.rulerHeight * this.visualConfig.handleSizeRatio;

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
	public handlePointerDown?(event: TimelinePointerEvent): boolean {
		// Check if click is on playhead handle FIRST
		if (this.isOnPlayheadHandle(event)) {
			// Start dragging playhead handle
			this.startDragging(event);
			return true; // Event handled
		}

		// Get local Y coordinate from the event
		const localY = event.global.y;

		// Check if click is on ruler area (top 30px)
		if (localY < this.rulerHeight) {
			// Ruler click - seek to position
			this.handleRulerClick(event);
			return true; // Event handled
		}

		return false; // Event not handled
	}

	/**
	 * Handle pointer move events for playhead dragging
	 */
	public handlePointerMove?(event: TimelinePointerEvent): boolean {
		// Always handle move events when dragging, regardless of position
		if (this.isDragging) {
			this.updateDragging(event);
			return true; // Event handled - prevent other features from getting it
		}
		return false; // Event not handled
	}

	/**
	 * Handle pointer up events to end dragging
	 */
	public handlePointerUp?(event: TimelinePointerEvent): boolean {
		// Always handle up events when dragging, regardless of position
		if (this.isDragging) {
			this.endDragging(event);
			return true; // Event handled - prevent other features from getting it
		}
		return false; // Event not handled
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

		let needsRedraw = false;
		if (changes.viewport) {
			this.pixelsPerSecond = state.viewport.zoom;
			this.scrollX = state.viewport.scrollX;
			this.viewportWidth = state.viewport.width;

			// Check if height changed
			if (this.timelineHeight !== state.viewport.height) {
				this.timelineHeight = state.viewport.height;
				needsRedraw = true;
			}
		}

		// Recalculate handle size if dimensions changed
		if (needsRedraw) {
			this.handleSize = this.rulerHeight * this.visualConfig.handleSizeRatio;
			this.drawPlayheadVisuals();
		}

		// Update position if playback time or viewport changed
		if (changes.playback || changes.viewport) {
			this.updatePlayheadPosition();
		}
	}

	/**
	 * Render any overlay elements (not used for playhead)
	 */
	public renderOverlay(_renderer: ITimelineRenderer): void {
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

		// Ensure visibility
		this.playheadLine.visible = true;
		this.playheadHandle.visible = true;

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
	}

	/**
	 * Check if pointer is over playhead handle
	 */
	private isOnPlayheadHandle(event: TimelinePointerEvent): boolean {
		if (!this.playheadHandle || !this.playheadContainer) return false;

		// Get the playhead's screen position
		const playheadX = this.playheadContainer.x;

		// Check if click is within handle bounds
		const localX = event.global.x - playheadX;
		const localY = event.global.y;

		// Simple inline calculations
		const halfSize = this.handleSize / 2;
		const hitAreaTop = this.handleSize * this.visualConfig.handleHitAreaTopRatio;
		const hitAreaBottom = this.handleSize * this.visualConfig.handleHitAreaBottomRatio;

		return localX >= -halfSize && localX <= halfSize && localY >= hitAreaTop && localY <= hitAreaBottom;
	}

	/**
	 * Start dragging the playhead
	 */
	private startDragging(event: TimelinePointerEvent): void {
		this.isDragging = true;

		// Store the initial drag position and time
		this.dragStartX = event.global.x;
		this.dragStartTime = this.currentTime;

		// Change cursor to indicate dragging
		if (this.playheadHandle) {
			this.playheadHandle.cursor = "grabbing";
		}
	}

	/**
	 * Update playhead position while dragging
	 */
	private updateDragging(event: TimelinePointerEvent): void {
		if (!this.isDragging) return;

		// Calculate the drag delta
		const currentX = event.global.x;
		const deltaX = currentX - this.dragStartX;

		// Convert delta to time difference
		const timeDelta = deltaX / this.pixelsPerSecond;
		const newTime = this.dragStartTime + timeDelta;

		// Clamp to valid range
		const duration = this.context.edit.getTotalDuration();
		const clampedTime = Math.max(0, Math.min(newTime, duration));

		// Seek to the new time
		this.seekToTime(clampedTime);
	}

	/**
	 * End playhead dragging
	 */
	private endDragging(event: TimelinePointerEvent): void {
		if (!this.isDragging) return;

		this.isDragging = false;

		// Restore cursor
		if (this.playheadHandle) {
			this.playheadHandle.cursor = "ew-resize";
		}

		// Final position update
		this.updateDragging(event);
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
			.stroke({ width: this.visualConfig.playheadWidth, color: this.visualConfig.playheadColor });

		// Calculate dimensions inline
		const halfSize = this.handleSize / 2;
		const strokeWidth = Math.max(2, this.handleSize / 12);

		// Draw a diamond shape at the top of the playhead
		this.playheadHandle
			.poly([
				0,
				this.handleSize * 0.5, // Bottom point
				-halfSize,
				-this.handleSize * 0.5, // Left point
				0,
				-this.handleSize * 1.5, // Top point
				halfSize,
				-this.handleSize * 0.5 // Right point
			])
			.fill({ color: this.visualConfig.playheadColor })
			.stroke({
				width: strokeWidth,
				color: this.visualConfig.handleOutlineColor,
				alpha: this.visualConfig.handleOutlineAlpha
			});

		// Set hit area for easier dragging
		const hitAreaPadding = this.handleSize * this.visualConfig.handleHitAreaPaddingRatio;
		const hitAreaTop = this.handleSize * this.visualConfig.handleHitAreaTopRatio;
		const hitAreaBottom = this.handleSize * this.visualConfig.handleHitAreaBottomRatio;

		this.playheadHandle.hitArea = new PIXI.Rectangle(
			-this.handleSize - hitAreaPadding,
			hitAreaTop,
			(this.handleSize + hitAreaPadding) * 2,
			hitAreaBottom - hitAreaTop
		);
	}
}
