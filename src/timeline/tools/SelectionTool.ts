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
	
	public override onPointerMove(_event: TimelinePointerEvent): void {
		if (!this.isDragging) {
			return;
		}
		
		// Calculate drag delta for future use
		// const dx = _event.global.x - this.dragStartX;
		// const dy = _event.global.y - this.dragStartY;
		
		// TODO: Implement drag selection or clip moving
	}
	
	public override onPointerUp(_event: TimelinePointerEvent): void {
		this.isDragging = false;
		
		// TODO: Finalize selection or movement
	}
	
	public override onKeyDown(_event: KeyboardEvent): void {
		// Handle keyboard shortcuts
		if (_event.key === "Delete" || _event.key === "Backspace") {
			// TODO: Delete selected clips
			_event.preventDefault();
		}
	}
}