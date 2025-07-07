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
		this.dragStartX = event.x;
		this.dragStartY = event.y;
		
		// If we reach here, it means we clicked on empty space (not a clip)
		// Clips handle their own click events via PIXI
		if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
			// Clear selection when clicking empty space (unless modifier held)
			this.executeCommand({
				type: 'CLEAR_SELECTION'
			} as any);
		}
		
		// TODO: Start box selection
	}
	
	public override onPointerMove(event: TimelinePointerEvent): void {
		if (!this.isDragging) return;
		
		const dx = event.x - this.dragStartX;
		const dy = event.y - this.dragStartY;
		
		// TODO: Implement drag selection or clip moving
	}
	
	public override onPointerUp(event: TimelinePointerEvent): void {
		this.isDragging = false;
		
		// TODO: Finalize selection or movement
	}
	
	public override onKeyDown(event: KeyboardEvent): void {
		// Handle keyboard shortcuts
		if (event.key === "Delete" || event.key === "Backspace") {
			// TODO: Delete selected clips
			event.preventDefault();
		}
	}
}