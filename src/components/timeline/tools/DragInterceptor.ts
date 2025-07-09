import * as PIXI from "pixi.js";
import { UpdateClipPositionCommand } from "@core/commands/update-clip-position-command";
import { MoveClipCommand } from "@core/commands/move-clip-command";

import { IToolInterceptor, ITimelineToolContext, ITimelineState } from "../interfaces";
import { TimelinePointerEvent } from "../types";
import type { Player } from "@canvas/players/player";

/**
 * Drag interceptor for moving clips within and between tracks
 * This runs with medium priority to allow resize operations to take precedence
 */
export class DragInterceptor implements IToolInterceptor {
	public readonly name = "drag-interceptor";
	public readonly priority = 90; // Lower than resize (100) but higher than selection

	// Dependencies
	private state: ITimelineState;
	private context: ITimelineToolContext;

	// Drag state tracking
	private isDragging: boolean = false;
	private isPotentialDrag: boolean = false; // Track if we might start dragging
	private dragTarget: { trackIndex: number; clipIndex: number } | null = null;
	private draggedPlayer: Player | null = null; // Store the actual player reference
	private dragStartX: number = 0;
	private dragStartY: number = 0;
	private dragOffsetX: number = 0; // Offset from clip origin to mouse
	private dragOffsetY: number = 0;
	private originalStart: number = 0;
	private originalTrackIndex: number = 0;
	private previewPosition: { trackIndex: number; start: number } | null = null;
	private dragGhost: PIXI.Container | null = null; // Ghost preview container

	// Configuration
	private readonly EDGE_THRESHOLD = 8; // Pixels from edge to exclude (for resize tool)
	private readonly DRAG_THRESHOLD = 5; // Pixels of movement before drag starts

	constructor(state: ITimelineState, context: ITimelineToolContext) {
		this.state = state;
		this.context = context;
	}

	public interceptPointerDown(event: TimelinePointerEvent): boolean {
		// Check if click is on clip body (not edges)
		if (this.isOnClipBody(event)) {
			// Find the clip by checking the actual visual position
			const clipPlayer = this.findClipAtVisualPosition(event);
			if (clipPlayer) {
				// Prepare for potential drag (but don't start yet)
				this.isPotentialDrag = true;
				this.draggedPlayer = clipPlayer.player; // Store the player reference
				this.dragTarget = { trackIndex: clipPlayer.trackIndex, clipIndex: clipPlayer.clipIndex }; // Store for compatibility
				this.dragStartX = event.global.x;
				this.dragStartY = event.global.y;
				this.originalStart = clipPlayer.player.clipConfiguration.start || 0;
				this.originalTrackIndex = clipPlayer.trackIndex;
				this.previewPosition = {
					trackIndex: clipPlayer.trackIndex,
					start: this.originalStart
				};

				// Don't stop propagation yet - allow selection to work
				// We'll handle it in pointer move if drag starts
				return false; // Let other handlers process this too
			}
		}
		return false; // Not handled
	}

	public interceptPointerMove(event: TimelinePointerEvent): boolean {
		// Check if we should start dragging
		if (this.isPotentialDrag && !this.isDragging) {
			// Calculate distance moved
			const deltaX = Math.abs(event.global.x - this.dragStartX);
			const deltaY = Math.abs(event.global.y - this.dragStartY);
			const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

			// Start drag if threshold exceeded
			if (distance > this.DRAG_THRESHOLD) {
				this.isDragging = true;
				this.isPotentialDrag = false;

				// Create drag preview now
				this.createDragPreview();

				// Update visual immediately
				if (this.dragGhost) {
					this.updateDragPreview(event);
				} else {
					console.error("Failed to create drag ghost");
				}

				// Now we handle the event
				return true;
			}
		}

		// Handle ongoing drag
		if (this.isDragging) {
			// Ensure we still have valid target clip
			if (!this.dragTarget || !this.previewPosition) {
				this.resetState();
				return false;
			}

			// Calculate new position
			const newPosition = this.calculateNewPosition(event);

			// Update preview position
			this.previewPosition = newPosition;

			// Update visual preview
			this.updateDragPreview(event);

			return true; // Event handled
		}

		return false; // Not handled
	}

	public interceptPointerUp(event: TimelinePointerEvent): boolean {
		// If we were just preparing to drag but didn't move enough, cancel
		if (this.isPotentialDrag && !this.isDragging) {
			this.resetState();
			return false; // Allow click/selection to proceed
		}

		// Handle actual drag completion
		if (this.isDragging && this.draggedPlayer && this.previewPosition) {
			// Find the current indices of the dragged player using Edit's method
			const currentIndices = this.context.edit.findClipIndices(this.draggedPlayer);
			if (!currentIndices) {
				console.error("Could not find dragged player in tracks");
				this.removeDragPreview();
				this.resetState();
				return true;
			}

			// Validate final position
			let finalPosition = this.previewPosition;
			const isValid = this.isValidPosition(this.previewPosition);

			if (!isValid) {
				// Try to find nearest valid position
				const nearestValid = this.findNearestValidPosition(this.previewPosition);
				if (nearestValid) {
					finalPosition = nearestValid;
				} else {
					// No valid position found, animate back to original
					this.animateBackToOriginal();
					this.removeDragPreview();
					this.resetState();
					return true;
				}
			}

			// Only execute command if position actually changed
			const positionChanged = finalPosition.start !== this.originalStart || finalPosition.trackIndex !== this.originalTrackIndex;

			if (positionChanged) {
				let command;

				// Use different commands based on whether we're changing tracks
				if (finalPosition.trackIndex !== currentIndices.trackIndex) {
					// Use MoveClipCommand for cross-track moves

					command = new MoveClipCommand(currentIndices.trackIndex, currentIndices.clipIndex, finalPosition.trackIndex, finalPosition.start);
				} else {
					// Use UpdateClipPositionCommand for same-track moves

					command = new UpdateClipPositionCommand(currentIndices.trackIndex, currentIndices.clipIndex, finalPosition.start);
				}

				try {
					this.context.executeCommand(command);
				} catch (error) {
					console.error("Failed to execute drag command:", error);
					this.handleDragError(error);
				}
			}

			// Clean up
			this.removeDragPreview();
			this.resetState();

			// Force a re-render to ensure state is synchronized
			if (this.context.timeline) {
				this.context.timeline.draw();
			}

			return true; // Event handled
		}

		// Always reset state on pointer up if we were dragging
		if (this.isDragging) {
			this.removeDragPreview();
			this.resetState();
			return true;
		}

		return false; // Not handled
	}

	public getCursor(event: TimelinePointerEvent): string | null {
		// If we're actively dragging, show grabbing cursor
		if (this.isDragging) {
			return "grabbing";
		}

		// Check if we're over a draggable clip body
		if (this.isOnClipBody(event)) {
			return "grab";
		}

		return null; // No specific cursor
	}

	/**
	 * Check if pointer is on clip body (excluding resize edges)
	 */
	private isOnClipBody(event: TimelinePointerEvent): boolean {
		try {
			// Get the event target which should be the clip container
			const target = event.target as PIXI.Container;
			if (!target) {
				return false;
			}

			// Find clip at visual position
			const clipInfo = this.findClipAtVisualPosition(event);
			if (!clipInfo) {
				return false;
			}

			const clipConfig = clipInfo.player.clipConfiguration;
			const state = this.state.getState();

			// Validate clip has valid dimensions
			if (clipConfig.start === undefined || !clipConfig.length || clipConfig.length <= 0) {
				return false;
			}

			// Get the visual clip container bounds
			const renderer = this.context.timeline.getRenderer();
			const tracks = renderer.getTracks();

			if (clipInfo.trackIndex >= tracks.length) {
				return false;
			}

			const track = tracks[clipInfo.trackIndex];
			const clips = track.getClips();

			if (clipInfo.clipIndex >= clips.length) {
				return false;
			}

			const visualClip = clips[clipInfo.clipIndex];
			const clipContainer = visualClip.getContainer();

			// Get local position within the clip
			const localPos = clipContainer.toLocal(event.global);

			// Get clip bounds
			const clipBounds = clipContainer.getLocalBounds();

			// Check if we're within the body area (excluding edges)
			const leftEdge = clipBounds.x + this.EDGE_THRESHOLD;
			const rightEdge = clipBounds.x + clipBounds.width - this.EDGE_THRESHOLD;

			// For very small clips, reduce the threshold
			const clipWidth = clipBounds.width;
			if (clipWidth < this.EDGE_THRESHOLD * 2 + 4) {
				const reducedThreshold = Math.min(2, Math.floor(clipWidth / 4));
				return localPos.x > clipBounds.x + reducedThreshold && localPos.x < clipBounds.x + clipBounds.width - reducedThreshold;
			}

			// Check if pointer is in the body area
			return localPos.x >= leftEdge && localPos.x <= rightEdge;
		} catch (error) {
			// Fail gracefully on any error
			console.warn("Error in clip body detection:", error);
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
	 * Convert screen X coordinate to timeline time
	 */
	private screenToTime(screenX: number, zoom: number, scrollX: number): number {
		const timelineX = screenX + scrollX;
		return timelineX / zoom;
	}

	/**
	 * Find target track based on Y coordinate
	 */
	private findTargetTrack(screenY: number): number {
		const renderer = this.context.timeline.getRenderer();
		const tracks = renderer.getTracks();

		// Simple implementation: assume fixed track height
		// TODO: Get actual track heights from renderer
		const TRACK_HEIGHT = 50; // Default track height
		const trackIndex = Math.floor(screenY / TRACK_HEIGHT);

		// Clamp to valid track range
		return Math.max(0, Math.min(trackIndex, tracks.length - 1));
	}

	/**
	 * Calculate new position based on current drag coordinates
	 */
	private calculateNewPosition(event: TimelinePointerEvent): { trackIndex: number; start: number } {
		const state = this.state.getState();

		// Get the ghost's position in the overlay layer
		const renderer = this.context.timeline.getRenderer();
		const overlayLayer = renderer.getLayer("overlay");
		const localPos = overlayLayer.toLocal(event.global);

		// Calculate the clip's left edge position (accounting for the drag offset)
		const clipLeftX = localPos.x - this.dragOffsetX;

		// Convert the left edge position to timeline time
		const newStart = this.screenToTime(clipLeftX, state.viewport.zoom, state.viewport.scrollX);

		// Apply minimum time constraint (can't go before 0)
		const constrainedStart = Math.max(0, newStart);

		// Find target track based on Y position
		const targetTrack = this.findTargetTrack(event.global.y);

		return {
			trackIndex: targetTrack,
			start: constrainedStart
		};
	}

	/**
	 * Check if the position is valid (no overlaps, within bounds)
	 */
	private isValidPosition(position: { trackIndex: number; start: number }): boolean {
		if (!this.draggedPlayer) return false;

		// Get the current indices of the dragged player using Edit's method
		const currentIndices = this.context.edit.findClipIndices(this.draggedPlayer);
		if (!currentIndices) return false;

		const clipDuration = this.draggedPlayer.clipConfiguration.length || 0;
		const clipEnd = position.start + clipDuration;

		// Check timeline bounds
		if (position.start < 0) {
			return false;
		}

		// Check track bounds
		const editData = this.context.edit.getEdit();
		const tracks = editData.timeline.tracks;
		if (position.trackIndex < 0 || position.trackIndex >= tracks.length) {
			return false;
		}

		// Get clips in the target track
		const targetTrack = tracks[position.trackIndex];
		if (!targetTrack || !targetTrack.clips) {
			return false;
		}

		// Check for overlaps with other clips
		for (let i = 0; i < targetTrack.clips.length; i++) {
			// Skip the clip being dragged if it's in the same track
			if (position.trackIndex === currentIndices.trackIndex && i === currentIndices.clipIndex) {
				continue;
			}

			const otherClip = targetTrack.clips[i];
			if (!otherClip || otherClip.start === undefined || !otherClip.length) {
				continue;
			}

			const otherStart = otherClip.start || 0;
			const otherEnd = otherStart + (otherClip.length || 0);

			// Check for overlap
			// Two clips overlap if one starts before the other ends
			if (position.start < otherEnd && clipEnd > otherStart) {
				return false; // Overlap detected
			}
		}

		return true; // No overlaps, position is valid
	}

	/**
	 * Find the nearest valid position for a clip if the current position is invalid
	 */
	private findNearestValidPosition(position: { trackIndex: number; start: number }): { trackIndex: number; start: number } | null {
		if (!this.draggedPlayer) return null;

		// Get the current indices of the dragged player using Edit's method
		const currentIndices = this.context.edit.findClipIndices(this.draggedPlayer);
		if (!currentIndices) return null;

		const clipDuration = this.draggedPlayer.clipConfiguration.length || 0;
		const editData = this.context.edit.getEdit();
		const tracks = editData.timeline.tracks;

		// First, try to find a valid position in the target track
		const targetTrack = tracks[position.trackIndex];
		if (targetTrack && targetTrack.clips) {
			// Collect all occupied time ranges in the track
			const occupiedRanges: Array<{ start: number; end: number }> = [];

			for (let i = 0; i < targetTrack.clips.length; i++) {
				// Skip the clip being dragged if it's in the same track
				if (position.trackIndex === currentIndices.trackIndex && i === currentIndices.clipIndex) {
					continue;
				}

				const otherClip = targetTrack.clips[i];
				if (otherClip && otherClip.start !== undefined && otherClip.length) {
					occupiedRanges.push({
						start: otherClip.start,
						end: otherClip.start + otherClip.length
					});
				}
			}

			// Sort ranges by start time
			occupiedRanges.sort((a, b) => a.start - b.start);

			// Find the nearest valid position
			let nearestPosition = position.start;
			let minDistance = Infinity;

			// Check position at the beginning (time 0)
			if (occupiedRanges.length === 0 || occupiedRanges[0].start >= clipDuration) {
				const distance = Math.abs(0 - position.start);
				if (distance < minDistance) {
					nearestPosition = 0;
					minDistance = distance;
				}
			}

			// Check gaps between clips
			for (let i = 0; i < occupiedRanges.length - 1; i++) {
				const gapStart = occupiedRanges[i].end;
				const gapEnd = occupiedRanges[i + 1].start;
				const gapSize = gapEnd - gapStart;

				if (gapSize >= clipDuration) {
					// Check position at the start of the gap
					const distance1 = Math.abs(gapStart - position.start);
					if (distance1 < minDistance) {
						nearestPosition = gapStart;
						minDistance = distance1;
					}

					// Check position at the end of the gap (right-aligned)
					const rightAlignedPos = gapEnd - clipDuration;
					const distance2 = Math.abs(rightAlignedPos - position.start);
					if (distance2 < minDistance) {
						nearestPosition = rightAlignedPos;
						minDistance = distance2;
					}
				}
			}

			// Check position after the last clip
			if (occupiedRanges.length > 0) {
				const afterLastClip = occupiedRanges[occupiedRanges.length - 1].end;
				const distance = Math.abs(afterLastClip - position.start);
				if (distance < minDistance) {
					nearestPosition = afterLastClip;
					minDistance = distance;
				}
			}

			// Ensure the position is not negative
			nearestPosition = Math.max(0, nearestPosition);

			// Verify the found position is actually valid
			const validatedPosition = { trackIndex: position.trackIndex, start: nearestPosition };
			if (this.isValidPosition(validatedPosition)) {
				return validatedPosition;
			}
		}

		// If no valid position found in target track, try other tracks
		// This is a fallback - in practice, we might want to limit this to nearby tracks
		for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
			if (trackIndex === position.trackIndex) continue; // Already tried this track

			const testPosition = { trackIndex, start: position.start };
			if (this.isValidPosition(testPosition)) {
				return testPosition;
			}

			// Also try start of track
			const startPosition = { trackIndex, start: 0 };
			if (this.isValidPosition(startPosition)) {
				return startPosition;
			}
		}

		return null; // No valid position found
	}

	/**
	 * Create visual drag preview
	 */
	private createDragPreview(): void {
		if (!this.dragTarget || this.dragGhost) return;

		// Get the clip being dragged
		const renderer = this.context.timeline.getRenderer();
		const tracks = renderer.getTracks();

		if (this.dragTarget.trackIndex >= tracks.length) return;

		const track = tracks[this.dragTarget.trackIndex];
		const clips = track.getClips();

		if (this.dragTarget.clipIndex >= clips.length) return;

		const clip = clips[this.dragTarget.clipIndex];
		const clipContainer = clip.getContainer();

		// Use the stored player reference
		if (!this.draggedPlayer || !this.draggedPlayer.clipConfiguration) return;

		// Create a ghost container
		this.dragGhost = new PIXI.Container();

		// Calculate clip width based on duration and zoom
		const state = this.state.getState();
		const clipDuration = this.draggedPlayer.clipConfiguration.length || 1;
		const clipWidth = clipDuration * state.viewport.zoom;
		const clipHeight = 40; // Standard clip height

		// Create a semi-transparent rectangle to represent the clip
		const graphics = new PIXI.Graphics();

		// Draw the ghost rectangle
		graphics.beginFill(0x4caf50, 0.3); // Green with 30% opacity
		graphics.roundRect(0, 0, clipWidth, clipHeight, 4);
		graphics.fill();

		// Add a border
		graphics.lineStyle(2, 0x4caf50, 0.8);
		graphics.roundRect(0, 0, clipWidth, clipHeight, 4);
		graphics.stroke();

		this.dragGhost.addChild(graphics);

		// Add ghost to the overlay layer
		// We'll position it in updateDragPreview based on mouse position
		const overlayLayer = renderer.getLayer("overlay");
		overlayLayer.addChild(this.dragGhost);

		// Make the original clip slightly transparent
		clipContainer.alpha = 0.5;

		// Store the offset from the clip's top-left to where the mouse grabbed it
		const clipStartTime = this.draggedPlayer.clipConfiguration.start || 0;
		const clipX = this.timeToScreen(clipStartTime, state.viewport.zoom, state.viewport.scrollX);
		const trackContainer = track.getContainer();
		this.dragOffsetX = this.dragStartX - clipX;
		this.dragOffsetY = this.dragStartY - trackContainer.y;
	}

	/**
	 * Update the position of the drag preview
	 */
	private updateDragPreview(event?: TimelinePointerEvent): void {
		if (!this.dragTarget || !this.previewPosition || !this.dragGhost) return;

		// If we have a current event, update ghost to follow mouse
		if (event) {
			// Get the calculated position
			const state = this.state.getState();
			const calculatedX = this.timeToScreen(this.previewPosition.start, state.viewport.zoom, state.viewport.scrollX);

			// Get the target track Y position
			const renderer = this.context.timeline.getRenderer();
			const tracks = renderer.getTracks();
			let calculatedY = this.dragGhost.y;

			if (this.previewPosition.trackIndex < tracks.length) {
				const targetTrack = tracks[this.previewPosition.trackIndex];
				const trackContainer = targetTrack.getContainer();
				calculatedY = trackContainer.y;
			}

			// Position ghost at the calculated position (where it will actually drop)
			this.dragGhost.x = calculatedX;
			this.dragGhost.y = calculatedY;
		} else {
			// Fallback: position based on preview position
			const state = this.state.getState();
			const newX = this.timeToScreen(this.previewPosition.start, state.viewport.zoom, state.viewport.scrollX);

			// Get the target track Y position
			const renderer = this.context.timeline.getRenderer();
			const tracks = renderer.getTracks();
			let newY = this.dragGhost.y; // Default to current Y

			if (this.previewPosition.trackIndex < tracks.length) {
				const targetTrack = tracks[this.previewPosition.trackIndex];
				const trackContainer = targetTrack.getContainer();
				newY = trackContainer.y;
			}

			// Update ghost position
			this.dragGhost.x = newX;
			this.dragGhost.y = newY;
		}

		// Update visual feedback based on validity
		const isValid = this.isValidPosition(this.previewPosition);
		const graphics = this.dragGhost.children[0] as PIXI.Graphics;

		// Get clip dimensions
		if (!this.draggedPlayer || !this.draggedPlayer.clipConfiguration) return;

		const state = this.state.getState();
		const clipDuration = this.draggedPlayer.clipConfiguration.length || 1;
		const clipWidth = clipDuration * state.viewport.zoom;
		const clipHeight = 40;

		if (isValid) {
			// Valid position - green
			graphics.clear();
			graphics.beginFill(0x4caf50, 0.3);
			graphics.roundRect(0, 0, clipWidth, clipHeight, 4);
			graphics.fill();
			graphics.lineStyle(2, 0x4caf50, 0.8);
			graphics.roundRect(0, 0, clipWidth, clipHeight, 4);
			graphics.stroke();
		} else {
			// Invalid position - red
			graphics.clear();
			graphics.beginFill(0xff5252, 0.3);
			graphics.roundRect(0, 0, clipWidth, clipHeight, 4);
			graphics.fill();
			graphics.lineStyle(2, 0xff5252, 0.8);
			graphics.roundRect(0, 0, clipWidth, clipHeight, 4);
			graphics.stroke();
		}
	}

	/**
	 * Remove the drag preview
	 */
	private removeDragPreview(): void {
		// Remove the ghost
		if (this.dragGhost) {
			if (this.dragGhost.parent) {
				this.dragGhost.parent.removeChild(this.dragGhost);
			}
			this.dragGhost.destroy();
			this.dragGhost = null;
		}

		// Restore the original clip's opacity
		if (this.dragTarget) {
			const renderer = this.context.timeline.getRenderer();
			const tracks = renderer.getTracks();

			if (this.dragTarget.trackIndex < tracks.length) {
				const track = tracks[this.dragTarget.trackIndex];
				const clips = track.getClips();

				if (this.dragTarget.clipIndex < clips.length) {
					const clip = clips[this.dragTarget.clipIndex];
					const clipContainer = clip.getContainer();

					// Restore full opacity
					clipContainer.alpha = 1.0;
				}
			}
		}
	}

	/**
	 * Animate clip back to original position on invalid drop
	 */
	private animateBackToOriginal(): void {
		// TODO: Implement animation back to original
		// This will be implemented in task 12
		console.warn("Invalid drop position - would animate back to original");
	}

	/**
	 * Handle errors during drag operation
	 */
	private handleDragError(error: unknown): void {
		// Log detailed error for debugging
		console.error("Drag operation failed:", error);

		// Reset tool state
		this.resetState();

		// Force redraw to ensure visual consistency
		if (this.context.timeline) {
			this.context.timeline.draw();
		}
	}

	/**
	 * Find clip at visual position by checking actual timeline coordinates
	 */
	private findClipAtVisualPosition(event: TimelinePointerEvent): { player: Player; trackIndex: number; clipIndex: number } | null {
		const state = this.state.getState();
		const renderer = this.context.timeline.getRenderer();
		const tracks = renderer.getTracks();

		// Convert mouse position to local timeline coordinates
		// Use the tracks layer as our reference
		const tracksLayer = renderer.getLayer("tracks");
		const localPos = tracksLayer.toLocal(event.global);
		const mouseX = localPos.x;
		const mouseY = localPos.y;

		// Find which track the mouse is over
		let targetTrackIndex = -1;
		for (let i = 0; i < tracks.length; i++) {
			const trackContainer = tracks[i].getContainer();
			const bounds = trackContainer.getBounds();
			if (mouseY >= bounds.y && mouseY <= bounds.y + bounds.height) {
				targetTrackIndex = i;
				break;
			}
		}

		if (targetTrackIndex === -1) return null;

		// Convert mouse X to timeline time
		const timelineTime = this.screenToTime(mouseX, state.viewport.zoom, state.viewport.scrollX);

		// Find which clip in this track contains this time
		const editData = this.context.edit.getEdit();
		const track = editData.timeline.tracks[targetTrackIndex];
		if (!track || !track.clips) return null;

		// Sort clips by start time to ensure we're checking them in order
		const sortedClips = track.clips
			.map((clip, index) => ({ clip, index }))
			.filter(item => item.clip && item.clip.start !== undefined && item.clip.length)
			.sort((a, b) => (a.clip.start || 0) - (b.clip.start || 0));

		for (const item of sortedClips) {
			const clip = item.clip;
			const clipIndex = item.index;
			const clipStart = clip.start || 0;
			const clipEnd = clipStart + (clip.length || 0);

			if (timelineTime >= clipStart && timelineTime <= clipEnd) {
				const player = this.context.edit.getPlayerClip(targetTrackIndex, clipIndex);
				if (player) {
					return { player, trackIndex: targetTrackIndex, clipIndex };
				}
			}
		}

		return null;
	}

	/**
	 * Check if child is a descendant of parent
	 */
	private isChildOf(child: PIXI.Container, parent: PIXI.Container): boolean {
		let current: PIXI.Container | null = child;
		while (current) {
			if (current === parent) return true;
			current = current.parent;
		}
		return false;
	}

	/**
	 * Reset all drag state
	 */
	private resetState(): void {
		this.isDragging = false;
		this.isPotentialDrag = false;
		this.dragTarget = null;
		this.draggedPlayer = null;
		this.dragStartX = 0;
		this.dragStartY = 0;
		this.dragOffsetX = 0;
		this.dragOffsetY = 0;
		this.originalStart = 0;
		this.originalTrackIndex = 0;
		this.previewPosition = null;

		// Clean up ghost if it exists
		if (this.dragGhost) {
			this.removeDragPreview();
		}
	}
}
