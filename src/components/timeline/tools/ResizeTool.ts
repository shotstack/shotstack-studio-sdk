import { ResizeClipCommand } from "@core/commands/resize-clip-command";
import * as PIXI from "pixi.js";

import { TimelineTool } from "../core/TimelineTool";
import { TimelinePointerEvent } from "../types";

/**
 * Resize tool for adjusting clip duration by dragging right edge
 */
export class ResizeTool extends TimelineTool {
	public readonly name = "resize";
	public readonly cursor = "default";

	// Resize state tracking
	private isResizing: boolean = false;
	private targetClip: { trackIndex: number; clipIndex: number } | null = null;
	private dragStartX: number = 0;
	private originalDuration: number = 0;
	private previewDuration: number = 0;

	// Edge detection configuration
	private readonly EDGE_THRESHOLD = 8; // Pixels from edge to trigger resize cursor

	public onActivate(): void {
		// Load any saved state
		const savedState = this.loadToolState();
		if (savedState) {
			// Restore tool-specific state if needed
		}
	}

	public onDeactivate(): void {
		// Clean up any active operations
		this.resetState();

		// Reset cursor
		this.updateCursor("default");

		// Save tool state
		this.saveToolState({
			// Add any tool-specific state to persist
		});
	}

	public override onPointerDown(event: TimelinePointerEvent): void {
		// Check if click is on clip edge
		if (this.isOnClipRightEdge(event)) {
			// Get clip info for the resize operation
			const registeredClip = this.context.clipRegistry.findClipByContainer(event.target as PIXI.Container);
			if (registeredClip) {
				const player = this.context.edit.getPlayerClip(registeredClip.trackIndex, registeredClip.clipIndex);
				if (player && player.clipConfiguration) {
					// Start resize operation
					this.isResizing = true;
					this.targetClip = {
						trackIndex: registeredClip.trackIndex,
						clipIndex: registeredClip.clipIndex
					};
					this.dragStartX = event.global.x;
					// Use the current clip duration, not the original
					this.originalDuration = player.clipConfiguration.length || 1;
					this.previewDuration = this.originalDuration;

					// Ensure resize cursor persists during drag
					this.updateCursor("ew-resize");

					// Stop propagation to prevent other tools from handling
					event.stopPropagation();
				}
			}
		}
	}

	public override onPointerMove(event: TimelinePointerEvent): void {
		if (this.isResizing) {
			// Ensure we still have valid target clip
			if (!this.targetClip) {
				this.resetState();
				return;
			}

			// Calculate new duration during drag
			this.previewDuration = this.calculateNewDuration(event.global.x);

			// Update clip visual in real-time
			this.updateClipVisual();

			// Keep resize cursor during drag
			this.updateCursor("ew-resize");
		} else {
			// Update cursor based on edge detection
			const isOnEdge = this.isOnClipRightEdge(event);
			this.updateCursor(isOnEdge ? "ew-resize" : "default");
		}
	}

	public override onPointerUp(event: TimelinePointerEvent): void {
		if (this.isResizing && this.targetClip && this.previewDuration > 0) {
			// Ensure duration is valid before executing command
			const finalDuration = Math.max(0.1, this.previewDuration);

			// Create and execute resize command
			const command = new ResizeClipCommand(this.targetClip.trackIndex, this.targetClip.clipIndex, finalDuration);

			try {
				this.context.executeCommand(command);
			} catch (error) {
				console.error("Failed to execute resize command:", error);
				// Show error feedback to user
				this.handleResizeError(error);
			}
		}

		// Always reset state on pointer up
		this.resetState();

		// Reset cursor
		this.updateCursor("default");

		// Switch back to selection tool
		const { toolManager } = this.context.timeline as any;
		if (toolManager) {
			toolManager.activate("selection");
		}
	}

	/**
	 * Check if pointer is on clip's right edge
	 */
	private isOnClipRightEdge(event: TimelinePointerEvent): boolean {
		try {
			// Find clip at pointer position using clip registry
			const registeredClip = this.context.clipRegistry.findClipByContainer(event.target as PIXI.Container);
			if (!registeredClip || !registeredClip.visual) {
				return false;
			}

			// Get the actual clip object
			const player = this.context.edit.getPlayerClip(registeredClip.trackIndex, registeredClip.clipIndex);
			if (!player || !player.clipConfiguration) {
				return false;
			}

			const clipConfig = player.clipConfiguration;
			const state = this.state.getState();

			// Validate clip dimensions
			if (clipConfig.start === undefined || !clipConfig.length || clipConfig.length <= 0) {
				return false;
			}

			// Get the visual duration directly from the registered clip
			const visualDuration = registeredClip.visual.getDuration();

			// Calculate clip's right edge position in screen coordinates
			const clipEndTime = clipConfig.start + visualDuration;
			const clipRightEdgeX = this.timeToScreen(clipEndTime, state.viewport.zoom, state.viewport.scrollX);

			// Check if pointer is near the right edge
			const distance = Math.abs(event.global.x - clipRightEdgeX);
			return distance <= this.EDGE_THRESHOLD;
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

	/**
	 * Calculate new duration based on drag distance
	 */
	private calculateNewDuration(currentX: number): number {
		// Get current viewport state for zoom
		const state = this.state.getState();
		const pixelsPerSecond = state.viewport.zoom;

		// Calculate the pixel delta from drag start
		const deltaX = currentX - this.dragStartX;

		// Convert pixel delta to time delta
		const deltaTime = deltaX / pixelsPerSecond;

		// Calculate new duration
		const newDuration = this.originalDuration + deltaTime;

		// Apply constraints
		return this.applyDurationConstraints(newDuration);
	}

	/**
	 * Apply duration constraints and validation
	 */
	private applyDurationConstraints(duration: number): number {
		// Minimum duration constraint
		const MIN_DURATION = 0.1;
		duration = Math.max(MIN_DURATION, duration);

		// Check for adjacent clip constraints
		if (this.targetClip) {
			const maxDuration = this.getMaxDurationForClip(this.targetClip);
			if (maxDuration !== null) {
				duration = Math.min(duration, maxDuration);
			}
		}

		return duration;
	}

	/**
	 * Get maximum allowed duration for a clip based on adjacent clips
	 */
	private getMaxDurationForClip(clipInfo: { trackIndex: number; clipIndex: number }): number | null {
		try {
			// Get the clip player to check its start time
			const player = (this.context.edit as any).getPlayerClip(clipInfo.trackIndex, clipInfo.clipIndex);
			if (!player || !player.clipConfiguration) {
				return null;
			}

			const clipStart = player.clipConfiguration.start || 0;

			// Get track data
			const track = (this.context.edit as any).getTrack(clipInfo.trackIndex);
			if (!track || !track.clips) {
				return null;
			}

			const { clips } = track;

			// Find the next clip in the track
			let nextClipStart: number | null = null;

			for (let i = 0; i < clips.length; i++) {
				if (i === clipInfo.clipIndex) continue;

				const otherClip = clips[i];
				const otherStart = otherClip.start || 0;

				// Check if this clip is after our clip
				if (otherStart > clipStart) {
					if (nextClipStart === null || otherStart < nextClipStart) {
						nextClipStart = otherStart;
					}
				}
			}

			// If there's a next clip, calculate max duration to avoid overlap
			if (nextClipStart !== null) {
				const maxDuration = nextClipStart - clipStart;
				// Add a small buffer to prevent exact overlap
				return Math.max(0.1, maxDuration - 0.001);
			}

			// No constraint from adjacent clips
			return null;
		} catch (error) {
			console.warn("Failed to calculate max duration constraint:", error);
			return null;
		}
	}

	/**
	 * Reset all resize state
	 */
	private resetState(): void {
		this.isResizing = false;
		this.targetClip = null;
		this.dragStartX = 0;
		this.originalDuration = 0;
		this.previewDuration = 0;
	}

	/**
	 * Update clip visual during drag
	 */
	private updateClipVisual(): void {
		if (!this.targetClip) return;

		// Get the clip from the timeline renderer
		const renderer = this.context.timeline.getRenderer();
		const tracks = renderer.getTracks();

		if (this.targetClip.trackIndex < tracks.length) {
			const track = tracks[this.targetClip.trackIndex];
			const clips = track.getClips();

			if (this.targetClip.clipIndex < clips.length) {
				const clip = clips[this.targetClip.clipIndex];
				// Update the clip's duration for visual feedback
				clip.setDuration(this.previewDuration);

				// Check if we're at a constraint boundary
				const maxDuration = this.getMaxDurationForClip(this.targetClip);
				if (maxDuration !== null && Math.abs(this.previewDuration - maxDuration) < 0.01) {
					// Visual feedback for constraint (could be enhanced with color change)
					this.updateCursor("not-allowed");
				}
			}
		}
	}

	/**
	 * Handle errors during resize operation
	 */
	private handleResizeError(error: unknown): void {
		// Log detailed error for debugging
		console.error("Resize operation failed:", error);

		// Reset tool state
		this.resetState();

		// Reset cursor
		this.updateCursor("default");

		// Animation loop will handle rendering

		// Could emit an event here for UI to show error message
		// this.context.edit.events.emit("error", { message: "Failed to resize clip" });
	}
}
