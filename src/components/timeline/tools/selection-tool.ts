import * as PIXI from "pixi.js";

import { TimelinePointerEvent } from "../types/timeline.types";

import { TimelineTool } from "./tool";

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

		// Check what was clicked using registry
		const registeredClip = this.context.clipRegistry.findClipByContainer(event.target as PIXI.Container);

		if (registeredClip) {
			// Clicked on a clip - emit the event
			this.context.edit.events.emit("timeline:clip:clicked", {
				trackIndex: registeredClip.trackIndex,
				clipIndex: registeredClip.clipIndex
			});
			event.stopPropagation();
		} else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
			// Clear selection when clicking empty space (unless modifier held)
			this.context.edit.events.emit("timeline:background:clicked", {});
		}
		// TODO: Start box selection for multi-select when modifier keys are held
	}

	public override onPointerMove(_event: TimelinePointerEvent): void {
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
}
