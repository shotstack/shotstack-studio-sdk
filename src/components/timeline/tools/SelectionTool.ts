import * as PIXI from "pixi.js";

import { TimelineTool } from "../core/TimelineTool";
import { TimelinePointerEvent } from "../types";

/**
 * Selection tool for selecting and manipulating timeline clips
 */
export class SelectionTool extends TimelineTool {
	public readonly name = "selection";
	public readonly cursor = "default";
	
	private isDragging = false;
	private dragStartX = 0;
	private dragStartY = 0;
	
	public onActivate(): void {
		// Load any saved state
		const savedState = this.loadToolState();
		if (savedState) {
			// Restore tool-specific state if needed
		}
	}
	
	public onDeactivate(): void {
		// Clean up any active operations
		this.isDragging = false;
		
		// Save tool state
		this.saveToolState({
			// Add any tool-specific state to persist
		});
	}
	
	public override onPointerDown(event: TimelinePointerEvent): void {
		// Check if we're on a resize edge first
		if (this.isOnClipRightEdge(event)) {
			// Switch to resize tool temporarily
			const toolManager = (this.context.timeline as any).toolManager;
			if (toolManager) {
				toolManager.activate("resize");
				// Let the resize tool handle this event
				const resizeTool = toolManager.getAllTools().get("resize");
				if (resizeTool && resizeTool.onPointerDown) {
					resizeTool.onPointerDown(event);
				}
			}
			return;
		}
		
		this.isDragging = true;
		this.dragStartX = event.global.x;
		this.dragStartY = event.global.y;
		
		// Check what was clicked using Timeline's query method via context
		const clipInfo = this.context.timeline.findClipAtPoint(event.target as PIXI.Container);
		
		if (clipInfo) {
			// Clicked on a clip - emit the event
			this.context.edit.events.emit("timeline:clip:clicked", clipInfo);
			event.stopPropagation();
		} else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
			// Clear selection when clicking empty space (unless modifier held)
			this.context.edit.events.emit("timeline:background:clicked", {});
		}
		// TODO: Start box selection for multi-select when modifier keys are held
	}
	
	public override onPointerMove(event: TimelinePointerEvent): void {
		// Update cursor based on edge detection
		const isOnEdge = this.isOnClipRightEdge(event);
		this.updateCursor(isOnEdge ? "ew-resize" : "default");
		
		if (this.isDragging) {
			// Calculate drag delta for future use
			// const dx = event.global.x - this.dragStartX;
			// const dy = event.global.y - this.dragStartY;
			
			// TODO: Implement drag selection or clip moving
		}
	}
	
	public override onPointerUp(__event: TimelinePointerEvent): void {
		this.isDragging = false;
		
		// TODO: Finalize selection or movement
	}
	
	public override onKeyDown(__event: KeyboardEvent): void {
		// Handle keyboard shortcuts
		if (__event.key === "Delete" || __event.key === "Backspace") {
			// TODO: Delete selected clips
			__event.preventDefault();
		}
	}

	/**
	 * Check if pointer is on clip's right edge for resize detection
	 */
	private isOnClipRightEdge(event: TimelinePointerEvent): boolean {
		try {
			// Find clip at pointer position
			const clipInfo = this.context.timeline.findClipAtPoint(event.target as PIXI.Container);
			if (!clipInfo) {
				return false;
			}
			
			// Get the actual clip object
			const player = (this.context.edit as any).getPlayerClip(clipInfo.trackIndex, clipInfo.clipIndex);
			if (!player || !player.clipConfiguration) {
				return false;
			}
			
			const clipConfig = player.clipConfiguration;
			const state = this.state.getState();
			
			// Validate clip dimensions
			if (clipConfig.start === undefined || !clipConfig.length || clipConfig.length <= 0) {
				return false;
			}
			
			// Get the visual clip to check its current duration
			const renderer = this.context.timeline.getRenderer();
			const tracks = renderer.getTracks();
			let visualDuration = clipConfig.length; // Default to config length
			
			if (clipInfo.trackIndex < tracks.length) {
				const track = tracks[clipInfo.trackIndex];
				const clips = track.getClips();
				if (clipInfo.clipIndex < clips.length) {
					const visualClip = clips[clipInfo.clipIndex];
					visualDuration = visualClip.getDuration(); // Use actual visual duration
				}
			}
			
			// Calculate clip's right edge position in screen coordinates
			const clipEndTime = clipConfig.start + visualDuration;
			const clipRightEdgeX = this.timeToScreen(clipEndTime, state.viewport.zoom, state.viewport.scrollX);
			
			// Check if pointer is near the right edge (8 pixel threshold)
			const distance = Math.abs(event.global.x - clipRightEdgeX);
			return distance <= 8;
		} catch (error) {
			// Fail gracefully on any error
			return false;
		}
	}

	/**
	 * Convert timeline time to screen X coordinate
	 */
	private timeToScreen(time: number, zoom: number, scrollX: number): number {
		const timelineX = time * zoom;
		return timelineX - scrollX;
	}

	/**
	 * Update the cursor style
	 */
	private updateCursor(cursor: string): void {
		// Get the timeline container element to update cursor
		const container = this.context.timeline.getRenderer().getApplication().canvas;
		if (container && container.style) {
			container.style.cursor = cursor;
		}
	}
}