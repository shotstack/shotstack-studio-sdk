import type { Player } from "@canvas/players/player";
import { CreateTrackAndMoveClipCommand } from "@core/commands/create-track-and-move-clip-command";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import { UpdateClipPositionCommand } from "@core/commands/update-clip-position-command";
import { Theme } from "@core/theme/theme-context";
import * as PIXI from "pixi.js";

import { TimelinePointerEvent } from "../types";
import { IToolInterceptor, ITimelineToolContext, ITimelineState } from "../types/timeline.interfaces";

// Drop zone detection types
type DropZoneType = "existing" | "between" | "below" | "above";

interface DropZoneResult {
	type: DropZoneType;
	trackIndex: number;
	insertionIndex?: number; // Only for between/below/above zones
	needsTrackCreation: boolean;
}

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

	// Core drag state
	private isDragging: boolean = false;
	private isPotentialDrag: boolean = false;
	private draggedPlayer: Player | null = null;
	private draggedClipId: string | null = null; // Stable clip ID
	private dragGhost: PIXI.Container | null = null;
	private dropIndicator: PIXI.Graphics | null = null;
	private isExecutingCommand: boolean = false; // Prevent concurrent command execution

	// Initial state snapshot (captured at drag start)
	private dragStartState: {
		mouseX: number;
		mouseY: number;
		clipStart: number;
		trackIndex: number;
		clipIndex: number;
		offsetX: number; // Offset from clip origin to mouse
		offsetY: number;
	} | null = null;

	// Current preview position
	private previewPosition: { trackIndex: number; start: number; dropZone?: DropZoneResult } | null = null;

	// Configuration
	private readonly EDGE_THRESHOLD = 8; // Pixels from edge to exclude (for resize tool)
	private readonly DRAG_THRESHOLD = 5; // Pixels of movement before drag starts
	private readonly MAX_TRACKS = 50; // Maximum number of tracks allowed
	private readonly MIN_TIMELINE_Y = -100; // Minimum Y position for valid drag
	private readonly MAX_TIMELINE_Y_OFFSET = 200; // Maximum Y offset below last track
	
	// Performance optimization - cache values during drag
	private cachedDragValues: {
		trackHeight: number;
		trackGap: number;
		rulerHeight: number;
		dropZoneThreshold: number;
	} | null = null;

	// Throttle expensive updates for performance
	private lastUpdateTime = 0;
	private readonly UPDATE_THROTTLE_MS = 16; // ~60fps (1000/60 ≈ 16.67ms)

	constructor(state: ITimelineState, context: ITimelineToolContext) {
		this.state = state;
		this.context = context;
	}

	public interceptPointerDown(event: TimelinePointerEvent): boolean {
		// Prevent new drag operations while executing commands
		if (this.isExecutingCommand) {
			return false;
		}

		// Check if click is on clip body (not edges)
		if (this.isOnClipBody(event)) {
			// Find the clip using registry
			const registeredClip = this.context.clipRegistry.findClipByContainer(event.target as PIXI.Container);
			if (registeredClip) {
				// Now we can trust the registry indices since we sync immediately on moves
				const player = this.context.edit.getPlayerClip(registeredClip.trackIndex, registeredClip.clipIndex);

				if (player && player.clipConfiguration) {
					// Prepare for potential drag (but don't start yet)
					this.isPotentialDrag = true;
					this.draggedPlayer = player;
					this.draggedClipId = registeredClip.id; // Store stable ID

					// Capture initial state
					this.dragStartState = {
						mouseX: event.global.x,
						mouseY: event.global.y,
						clipStart: player.clipConfiguration.start || 0,
						trackIndex: registeredClip.trackIndex,
						clipIndex: registeredClip.clipIndex,
						offsetX: 0, // Will be calculated when drag starts
						offsetY: 0
					};

					this.previewPosition = {
						trackIndex: registeredClip.trackIndex,
						start: player.clipConfiguration.start || 0
					};

					// Don't stop propagation yet - allow selection to work
					// We'll handle it in pointer move if drag starts
					return false; // Let other handlers process this too
				}
			}
		}
		return false; // Not handled
	}

	public interceptPointerMove(event: TimelinePointerEvent): boolean {
		// Check if we should start dragging
		if (this.isPotentialDrag && !this.isDragging && this.dragStartState) {
			// Calculate distance moved
			const deltaX = Math.abs(event.global.x - this.dragStartState.mouseX);
			const deltaY = Math.abs(event.global.y - this.dragStartState.mouseY);
			const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

			// Start drag if threshold exceeded
			if (distance > this.DRAG_THRESHOLD) {
				this.isDragging = true;
				this.isPotentialDrag = false;

				// Cache values for performance during drag
				this.cachedDragValues = {
					trackHeight: Theme.dimensions.track.height,
					trackGap: Theme.dimensions.track.gap,
					rulerHeight: Theme.dimensions.ruler.height,
					dropZoneThreshold: Math.max(20, Theme.dimensions.track.gap * 2)
				};

				// Create drag preview now
				this.createDragPreview();

				// Update visual immediately - let the logic decide which to show
				if (this.dragGhost) {
					// Initial update to determine which visual feedback to show
					const newPositionResult = this.calculateNewPosition(event);
					if (newPositionResult.dropZone?.needsTrackCreation) {
						this.updateDropIndicator(newPositionResult.dropZone);
						this.hideDragPreview();
					} else {
						this.updateDragPreview(event);
						this.hideDropIndicator();
					}
				} else {
					console.error("Failed to create drag ghost");
				}

				// Now we handle the event
				return true;
			}
		}

		// Handle ongoing drag
		if (this.isDragging && this.draggedPlayer && this.previewPosition) {
			// Throttle expensive updates for performance
			const now = performance.now();
			const shouldUpdate = now - this.lastUpdateTime >= this.UPDATE_THROTTLE_MS;

			// Always calculate new position (this is lightweight)
			const newPositionResult = this.calculateNewPosition(event);
			const newPosition = { trackIndex: newPositionResult.trackIndex, start: newPositionResult.start };
			
			// Handle track creation vs existing track validation differently
			let finalPosition = newPosition;
			if (newPositionResult.dropZone?.needsTrackCreation) {
				// For track creation, the position is always valid - we're creating a new track
				// Use the insertion index as the final track index
				finalPosition = {
					trackIndex: newPositionResult.dropZone.insertionIndex || newPositionResult.trackIndex,
					start: Math.max(0, newPosition.start)
				};
				
				// Debug log to verify track creation logic
				console.log('Track creation zone detected:', {
					dropZoneType: newPositionResult.dropZone.type,
					insertionIndex: newPositionResult.dropZone.insertionIndex,
					finalTrackIndex: finalPosition.trackIndex,
					originalTrackIndex: newPosition.trackIndex
				});
			} else {
				// For existing tracks, use normal validation
				if (!this.isValidPosition(newPosition)) {
					const nearestValid = this.findNearestValidPosition(newPosition);
					if (nearestValid) {
						finalPosition = nearestValid;
					}
				}
			}

			// Update preview position to where the clip will actually land
			this.previewPosition = { ...finalPosition, dropZone: newPositionResult.dropZone };

			// Only update visuals if enough time has passed (throttling)
			if (shouldUpdate) {
				// Update visuals based on drop zone type (mutually exclusive)
				if (newPositionResult.dropZone?.needsTrackCreation) {
					// Show only drop indicator for track creation
					this.updateDropIndicator(newPositionResult.dropZone);
					this.hideDragPreview();
				} else {
					// Show only drag preview for existing track drops
					this.updateDragPreview(event);
					this.hideDropIndicator();
				}
				this.lastUpdateTime = now;
			}

			return true; // Event handled
		}

		return false; // Not handled
	}

	public interceptKeyDown?(event: { key: string }): boolean {
		// Handle ESC key to cancel drag operation
		if (event.key === "Escape" && this.isDragging) {
			this.cancelDrag();
			return true;
		}
		return false;
	}

	public interceptPointerUp(_event: TimelinePointerEvent): boolean {
		// If we were just preparing to drag but didn't move enough, cancel
		if (this.isPotentialDrag && !this.isDragging) {
			this.resetState();
			return false; // Allow click/selection to proceed
		}

		// Handle actual drag completion
		if (this.isDragging && this.draggedPlayer && this.draggedClipId && this.previewPosition) {
			// IMPORTANT: We need to find the current indices from the Edit, not the registry
			// The registry might have stale indices until the next sync
			const currentIndices = this.context.edit.findClipIndices(this.draggedPlayer);
			if (!currentIndices) {
				console.error("Could not find dragged clip in Edit");
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
					this.removeDropIndicator();
					this.resetState();
					return true;
				}
			}

			// Only execute command if position actually changed
			const dropZone = this.previewPosition?.dropZone;
			const positionChanged = this.dragStartState && (
				finalPosition.start !== this.dragStartState.clipStart || 
				finalPosition.trackIndex !== this.dragStartState.trackIndex ||
				dropZone?.needsTrackCreation // Always execute for track creation
			);

			if (positionChanged && !this.isExecutingCommand) {
				this.isExecutingCommand = true;
				
				try {
					let command;

					// Check if we need to create a new track (dropZone already extracted above)
					if (dropZone?.needsTrackCreation && dropZone.insertionIndex !== undefined) {
						// Use compound command for track creation and clip move
						console.log('Executing track creation command:', {
							insertionIndex: dropZone.insertionIndex,
							fromTrack: currentIndices.trackIndex,
							fromClip: currentIndices.clipIndex,
							newStart: finalPosition.start
						});
						
						command = new CreateTrackAndMoveClipCommand(
							dropZone.insertionIndex,
							currentIndices.trackIndex,
							currentIndices.clipIndex,
							finalPosition.start
						);
					} else if (finalPosition.trackIndex !== currentIndices.trackIndex) {
						// Use MoveClipCommand for cross-track moves to existing tracks
						command = new MoveClipCommand(
							currentIndices.trackIndex,
							currentIndices.clipIndex,
							finalPosition.trackIndex,
							finalPosition.start
						);
					} else {
						// Use UpdateClipPositionCommand for same-track moves
						command = new UpdateClipPositionCommand(
							currentIndices.trackIndex,
							currentIndices.clipIndex,
							finalPosition.start
						);
					}

					// Validate command before execution
					if (!this.validateDragCommand(command, dropZone)) {
						console.warn("Drag command validation failed, cancelling operation");
						this.cancelDrag();
						return true;
					}

					this.context.executeCommand(command);
				} catch (error) {
					console.error("Failed to execute drag command:", error);
					this.handleDragError(error);
				} finally {
					this.isExecutingCommand = false;
				}
			}

			// Clean up
			this.removeDragPreview();
			this.removeDropIndicator();
			this.resetState();

			// The command execution will emit clip:updated event,
			// which Timeline listens to and triggers a redraw
			return true; // Event handled
		}

		// Always reset state on pointer up if we were dragging
		if (this.isDragging) {
			this.removeDragPreview();
			this.removeDropIndicator();
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

			// Find clip using registry
			const registeredClip = this.context.clipRegistry.findClipByContainer(target);
			if (!registeredClip || !registeredClip.visual) {
				return false;
			}

			// Get the actual clip object to check its dimensions
			const player = this.context.edit.getPlayerClip(registeredClip.trackIndex, registeredClip.clipIndex);
			if (!player || !player.clipConfiguration) {
				return false;
			}

			const clipConfig = player.clipConfiguration;

			// Validate clip has valid dimensions
			if (clipConfig.start === undefined || !clipConfig.length || clipConfig.length <= 0) {
				return false;
			}

			const clipContainer = registeredClip.visual.getContainer();

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
	 * Enhanced drop zone detection that supports track creation with bounds checking
	 */
	private findDropZone(screenY: number): DropZoneResult {
		try {
			const tracks = this.context.timeline.getRenderer().getTracks();
			
			// Use cached values for performance, fall back to theme if not cached
			const { trackHeight, rulerHeight, dropZoneThreshold } = this.cachedDragValues || {
				trackHeight: Theme.dimensions.track.height,
				trackGap: Theme.dimensions.track.gap,
				rulerHeight: Theme.dimensions.ruler.height,
				dropZoneThreshold: Math.max(20, Theme.dimensions.track.gap * 2)
			};

			// Bounds checking - reject positions that are too far outside timeline
			if (screenY < this.MIN_TIMELINE_Y) {
				console.warn(`Drag position too far above timeline: ${screenY}`);
				return this.getFallbackDropZone(tracks);
			}

			const maxY = tracks.length > 0 
				? tracks[tracks.length - 1].getContainer().y + trackHeight + this.MAX_TIMELINE_Y_OFFSET
				: rulerHeight + this.MAX_TIMELINE_Y_OFFSET;
			
			if (screenY > maxY) {
				console.warn(`Drag position too far below timeline: ${screenY}`);
				return this.getFallbackDropZone(tracks);
			}

			// Check track limit before allowing new track creation
			if (tracks.length >= this.MAX_TRACKS) {
				console.warn(`Maximum track limit reached: ${this.MAX_TRACKS}`);
				return this.getFallbackDropZone(tracks, false); // Force existing track
			}

		// If no tracks exist, create the first one
		if (!tracks.length) {
			return {
				type: "below",
				trackIndex: 0,
				insertionIndex: 0,
				needsTrackCreation: true
			};
		}

		// Handle extreme positions - if way above timeline, treat as above first track
		if (screenY < rulerHeight - 50) {
			return {
				type: "above",
				trackIndex: 0,
				insertionIndex: 0,
				needsTrackCreation: true
			};
		}

		// Handle extreme positions - if way below timeline, treat as below last track
		const lastTrack = tracks[tracks.length - 1];
		const lastTrackBottom = lastTrack.getContainer().y + trackHeight;
		if (screenY > lastTrackBottom + 100) {
			return {
				type: "below",
				trackIndex: tracks.length,
				insertionIndex: tracks.length,
				needsTrackCreation: true
			};
		}

		// Check for above first track
		const firstTrack = tracks[0];
		const firstTrackTop = firstTrack.getContainer().y;
		const aboveZoneTop = rulerHeight;
		const aboveZoneBottom = firstTrackTop - (dropZoneThreshold / 2);

		if (screenY >= aboveZoneTop && screenY <= aboveZoneBottom) {
			return {
				type: "above",
				trackIndex: 0,
				insertionIndex: 0,
				needsTrackCreation: true
			};
		}

		// Check each track and the spaces between them
		for (let i = 0; i < tracks.length; i++) {
			const track = tracks[i];
			const trackContainer = track.getContainer();
			const trackTop = trackContainer.y;
			const trackBottom = trackTop + trackHeight;

			// Define insertion zones (smaller, more precise)
			const insertionZoneSize = Math.min(dropZoneThreshold, 12); // Max 12px insertion zones
			const trackBodyMargin = 8; // 8px margin from track edges for insertion zones

			// Top insertion zone (above this track)
			const topInsertionZoneTop = trackTop - insertionZoneSize;
			const topInsertionZoneBottom = trackTop;

			// Bottom insertion zone (below this track) 
			const bottomInsertionZoneTop = trackBottom;
			const bottomInsertionZoneBottom = trackBottom + insertionZoneSize;

			// Track body zone (middle area for dropping into existing track)
			const trackBodyTop = trackTop + trackBodyMargin;
			const trackBodyBottom = trackBottom - trackBodyMargin;

			if (screenY >= topInsertionZoneTop && screenY <= topInsertionZoneBottom) {
				// In the insertion zone above this track
				return {
					type: "between",
					trackIndex: i,
					insertionIndex: i,
					needsTrackCreation: true
				};
			} else if (screenY >= trackBodyTop && screenY <= trackBodyBottom) {
				// In the main track body (for dropping into existing track)
				return {
					type: "existing",
					trackIndex: i,
					needsTrackCreation: false
				};
			} else if (screenY >= bottomInsertionZoneTop && screenY <= bottomInsertionZoneBottom) {
				// In the insertion zone below this track
				if (i === tracks.length - 1) {
					// This is the last track, so it's a "below" zone
					return {
						type: "below",
						trackIndex: i + 1,
						insertionIndex: i + 1,
						needsTrackCreation: true
					};
				} else {
					// There's another track below, so it's a "between" zone
					return {
						type: "between",
						trackIndex: i + 1,
						insertionIndex: i + 1,
						needsTrackCreation: true
					};
				}
			} else if (screenY > trackTop && screenY < trackBottom && 
					   (screenY <= trackBodyTop || screenY >= trackBodyBottom)) {
				// In the edge areas of the track (near top or bottom edges)
				// Prefer dropping into the track rather than creating new ones
				return {
					type: "existing",
					trackIndex: i,
					needsTrackCreation: false
				};
			}
		}

			// Fallback: find closest existing track by distance to center
			return tracks.reduce((closest, track, index) => {
				const trackY = track.getContainer().y + track.getHeight() / 2;
				const distance = Math.abs(screenY - trackY);
				const closestTrackY = tracks[closest.trackIndex].getContainer().y + tracks[closest.trackIndex].getHeight() / 2;
				const minDistance = Math.abs(screenY - closestTrackY);
				
				if (distance < minDistance) {
					return {
						type: "existing" as DropZoneType,
						trackIndex: index,
						needsTrackCreation: false
					};
				}
				return closest;
			}, {
				type: "existing" as DropZoneType,
				trackIndex: 0,
				needsTrackCreation: false
			});
		} catch (error) {
			console.error("Error in drop zone detection:", error);
			return this.getFallbackDropZone(this.context.timeline.getRenderer().getTracks());
		}
	}

	/**
	 * Get a safe fallback drop zone when detection fails or conditions are invalid
	 */
	private getFallbackDropZone(tracks: any[], allowTrackCreation = true): DropZoneResult {
		if (tracks.length === 0) {
			return {
				type: "below",
				trackIndex: 0,
				insertionIndex: 0,
				needsTrackCreation: true
			};
		}

		if (allowTrackCreation && tracks.length < this.MAX_TRACKS) {
			// Fallback to creating track below last track
			return {
				type: "below",
				trackIndex: tracks.length,
				insertionIndex: tracks.length,
				needsTrackCreation: true
			};
		}

		// Fallback to last existing track
		return {
			type: "existing",
			trackIndex: tracks.length - 1,
			needsTrackCreation: false
		};
	}

	/**
	 * Calculate new position based on current drag coordinates
	 */
	private calculateNewPosition(event: TimelinePointerEvent): { trackIndex: number; start: number; dropZone?: DropZoneResult } {
		const state = this.state.getState();

		// Get the ghost's position in the overlay layer
		const renderer = this.context.timeline.getRenderer();
		const overlayLayer = renderer.getLayer("overlay");
		const localPos = overlayLayer.toLocal(event.global);

		// Calculate the clip's left edge position (accounting for the drag offset)
		const clipLeftX = localPos.x - (this.dragStartState?.offsetX || 0);

		// Convert the left edge position to timeline time
		const newStart = this.screenToTime(clipLeftX, state.viewport.zoom, state.viewport.scrollX);

		// Apply minimum time constraint (can't go before 0)
		const constrainedStart = Math.max(0, newStart);

		// Find drop zone based on Y position
		const dropZone = this.findDropZone(event.global.y);

		return {
			trackIndex: dropZone.trackIndex,
			start: constrainedStart,
			dropZone
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
		const { tracks } = editData.timeline;
		if (position.trackIndex < 0 || position.trackIndex >= tracks.length) {
			return false;
		}

		// Get clips in the target track
		const targetTrack = tracks[position.trackIndex];
		if (!targetTrack || !targetTrack.clips) {
			return false;
		}

		// Check for overlaps with other clips in the target track
		const hasOverlap = targetTrack.clips.some((otherClip, i) => {
			// Skip if this is the dragged clip in its original position
			const isOriginalPosition = position.trackIndex === currentIndices.trackIndex && i === currentIndices.clipIndex;
			if (isOriginalPosition) {
				return false;
			}

			// Skip invalid clips
			if (!otherClip?.length || otherClip.start === undefined) {
				return false;
			}

			// Get the player for this clip to double-check it's not our dragged clip
			const otherPlayer = this.context.edit.getPlayerClip(position.trackIndex, i);
			if (otherPlayer === this.draggedPlayer) {
				// This is our dragged clip, skip it
				return false;
			}

			// Check if clips would overlap
			const otherStart = otherClip.start || 0;
			const otherEnd = otherStart + otherClip.length;
			return position.start < otherEnd && clipEnd > otherStart;
		});

		if (hasOverlap) {
			return false;
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
		const { tracks } = editData.timeline;

		// First, try to find a valid position in the target track
		const targetTrack = tracks[position.trackIndex];
		if (targetTrack && targetTrack.clips) {
			// Collect all occupied time ranges in the track
			const occupiedRanges: Array<{ start: number; end: number }> = [];

			for (let i = 0; i < targetTrack.clips.length; i += 1) {
				// Skip the clip being dragged if it's in the same track
				if (!(position.trackIndex === currentIndices.trackIndex && i === currentIndices.clipIndex)) {
					const otherClip = targetTrack.clips[i];
					if (otherClip && otherClip.start !== undefined && otherClip.length) {
						occupiedRanges.push({
							start: otherClip.start,
							end: otherClip.start + otherClip.length
						});
					}
				}
			}

			// Sort ranges by start time
			occupiedRanges.sort((a, b) => a.start - b.start);

			// Find the nearest valid position
			let nearestPosition = position.start;
			let minDistance = Infinity;

			// Check positions before the first clip
			if (occupiedRanges.length === 0 || occupiedRanges[0].start > 0) {
				// Check position at time 0
				if (occupiedRanges.length === 0 || occupiedRanges[0].start >= clipDuration) {
					const distance = Math.abs(0 - position.start);
					if (distance < minDistance) {
						nearestPosition = 0;
						minDistance = distance;
					}
				}
				
				// If there's a gap before the first clip, check right-aligned position
				if (occupiedRanges.length > 0 && occupiedRanges[0].start >= clipDuration) {
					const rightAlignedPos = occupiedRanges[0].start - clipDuration;
					const distance = Math.abs(rightAlignedPos - position.start);
					if (distance < minDistance) {
						nearestPosition = rightAlignedPos;
						minDistance = distance;
					}
				}
			}

			// Check gaps between clips
			for (let i = 0; i < occupiedRanges.length - 1; i += 1) {
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
		for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
			if (trackIndex !== position.trackIndex) {
				// Skip if already tried this track
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
		}

		return null; // No valid position found
	}

	/**
	 * Create visual drag preview
	 */
	private createDragPreview(): void {
		if (!this.draggedPlayer || !this.draggedClipId || !this.dragStartState || this.dragGhost) return;

		// Get the clip's visual representation using stable ID
		const registeredClip = this.context.clipRegistry.findClipById(this.draggedClipId);
		if (!registeredClip || !registeredClip.visual) return;

		const clip = registeredClip.visual;
		const clipContainer = clip.getContainer();

		// Use the stored player reference
		if (!this.draggedPlayer || !this.draggedPlayer.clipConfiguration) return;

		// Create a ghost container
		this.dragGhost = new PIXI.Container();

		// Calculate clip dimensions using theme values
		const state = this.state.getState();
		const clipDuration = this.draggedPlayer.clipConfiguration.length || 1;
		const clipWidth = clipDuration * state.viewport.zoom;
		const clipHeight = Theme.dimensions.clip.height;
		const clipY = Theme.dimensions.clip.offsetY;

		// Create a semi-transparent rectangle to represent the clip
		const graphics = new PIXI.Graphics();

		// Position the graphics to match the clip's position within the track
		graphics.y = clipY;

		// Draw the ghost rectangle with fill
		graphics.fillStyle = { color: 0x4caf50, alpha: 0.3 };
		graphics.roundRect(0, 0, clipWidth, clipHeight, Theme.dimensions.clip.cornerRadius);
		graphics.fill();

		// Add a border
		graphics.strokeStyle = { width: 2, color: 0x4caf50, alpha: 0.8 };
		graphics.roundRect(0, 0, clipWidth, clipHeight, Theme.dimensions.clip.cornerRadius);
		graphics.stroke();

		this.dragGhost.addChild(graphics);

		// Add ghost to the overlay layer
		// We'll position it in updateDragPreview based on mouse position
		const renderer = this.context.timeline.getRenderer();
		const overlayLayer = renderer.getLayer("overlay");
		overlayLayer.addChild(this.dragGhost);

		// Make the original clip slightly transparent
		clipContainer.alpha = 0.5;

		// Calculate and store the offset from the clip's top-left to where the mouse grabbed it
		const clipStartTime = this.draggedPlayer.clipConfiguration.start || 0;
		const clipX = this.timeToScreen(clipStartTime, state.viewport.zoom, state.viewport.scrollX);

		// Get track container for Y position
		const tracks = renderer.getTracks();
		const track = tracks[registeredClip.trackIndex];
		const trackContainer = track ? track.getContainer() : null;

		// Update the drag start state with the calculated offsets
		if (this.dragStartState && trackContainer) {
			this.dragStartState.offsetX = this.dragStartState.mouseX - clipX;
			this.dragStartState.offsetY = this.dragStartState.mouseY - trackContainer.y;
		}
	}

	/**
	 * Update the position of the drag preview
	 */
	private updateDragPreview(event?: TimelinePointerEvent): void {
		if (!this.draggedPlayer || !this.previewPosition || !this.dragGhost) return;

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

		// Update visual feedback based on validity and drop zone
		const isValid = this.isValidPosition(this.previewPosition);
		const dropZone = this.previewPosition?.dropZone;
		const graphics = this.dragGhost.children[0] as PIXI.Graphics;

		// Get clip dimensions
		if (!this.draggedPlayer || !this.draggedPlayer.clipConfiguration) return;

		const state = this.state.getState();
		const clipDuration = this.draggedPlayer.clipConfiguration.length || 1;
		const clipWidth = clipDuration * state.viewport.zoom;
		const clipHeight = Theme.dimensions.clip.height;

		// Determine color based on drop zone and validity
		let fillColor: number;
		let strokeColor: number;

		if (dropZone?.needsTrackCreation) {
			// Drop zone that will create a new track - blue (info state)
			// TODO: Use Theme.colors.states.info when it's added to the theme system
			fillColor = 0x2196f3; // Material Design Blue 500
			strokeColor = 0x2196f3;
		} else if (isValid) {
			// Valid position in existing track - green
			fillColor = Theme.colors.states.valid;
			strokeColor = Theme.colors.states.valid;
		} else {
			// Invalid position - red
			fillColor = Theme.colors.states.invalid;
			strokeColor = Theme.colors.states.invalid;
		}

		// Apply the color
		graphics.clear();
		graphics.fillStyle = { color: fillColor, alpha: 0.3 };
		graphics.roundRect(0, 0, clipWidth, clipHeight, Theme.dimensions.clip.cornerRadius);
		graphics.fill();
		graphics.strokeStyle = { width: 2, color: strokeColor, alpha: 0.8 };
		graphics.roundRect(0, 0, clipWidth, clipHeight, Theme.dimensions.clip.cornerRadius);
		graphics.stroke();

		// Make sure ghost is visible when updating
		this.dragGhost.visible = true;
	}

	/**
	 * Create and update drop zone indicator
	 */
	private updateDropIndicator(dropZone?: DropZoneResult): void {
		// Only show indicator for track creation zones
		if (!dropZone || !dropZone.needsTrackCreation) {
			this.hideDropIndicator();
			return;
		}

		const renderer = this.context.timeline.getRenderer();
		const overlayLayer = renderer.getLayer("overlay");
		const state = this.state.getState();
		const tracks = renderer.getTracks();

		// Create indicator if it doesn't exist
		if (!this.dropIndicator) {
			this.dropIndicator = new PIXI.Graphics();
			overlayLayer.addChild(this.dropIndicator);
		}

		// Calculate indicator position
		let indicatorY = 0;
		const trackHeight = Theme.dimensions.track.height;
		const trackGap = Theme.dimensions.track.gap;
		const rulerHeight = Theme.dimensions.ruler.height;

		switch (dropZone.type) {
			case "above":
				// Above first track
				indicatorY = rulerHeight + (trackGap / 2);
				break;
			case "between":
				// Between tracks
				if (dropZone.insertionIndex !== undefined && dropZone.insertionIndex > 0) {
					const prevTrack = tracks[dropZone.insertionIndex - 1];
					if (prevTrack) {
						const prevTrackBottom = prevTrack.getContainer().y + trackHeight;
						indicatorY = prevTrackBottom + (trackGap / 2);
					}
				} else {
					// Above first track (same as "above")
					indicatorY = rulerHeight + (trackGap / 2);
				}
				break;
			case "below":
				// Below last track
				if (tracks.length > 0) {
					const lastTrack = tracks[tracks.length - 1];
					const lastTrackBottom = lastTrack.getContainer().y + trackHeight;
					indicatorY = lastTrackBottom + (trackGap / 2);
				} else {
					indicatorY = rulerHeight + (trackGap / 2);
				}
				break;
		}

		// Clear previous graphics and redraw
		this.dropIndicator.clear();

		// Get timeline width (visible area + some buffer)
		const timelineWidth = state.viewport.width + Math.abs(state.viewport.scrollX);

		// Draw the main indicator line
		const indicatorColor = Theme.colors.states.valid;
		const lineWidth = 2;
		const glowWidth = 6;

		// Draw glow effect first (wider, more transparent)
		this.dropIndicator.strokeStyle = {
			width: glowWidth,
			color: indicatorColor,
			alpha: 0.3
		};
		this.dropIndicator.moveTo(0, indicatorY);
		this.dropIndicator.lineTo(timelineWidth, indicatorY);
		this.dropIndicator.stroke();

		// Draw main line (sharper, more opaque)
		this.dropIndicator.strokeStyle = {
			width: lineWidth,
			color: indicatorColor,
			alpha: 0.8
		};
		this.dropIndicator.moveTo(0, indicatorY);
		this.dropIndicator.lineTo(timelineWidth, indicatorY);
		this.dropIndicator.stroke();

		// Make sure it's visible
		this.dropIndicator.visible = true;
	}

	/**
	 * Hide drop zone indicator (but keep it for reuse)
	 */
	private hideDropIndicator(): void {
		if (this.dropIndicator) {
			this.dropIndicator.visible = false;
			this.dropIndicator.clear();
		}
	}

	/**
	 * Remove drop zone indicator (destroy it completely)
	 */
	private removeDropIndicator(): void {
		if (this.dropIndicator) {
			if (this.dropIndicator.parent) {
				this.dropIndicator.parent.removeChild(this.dropIndicator);
			}
			this.dropIndicator.destroy();
			this.dropIndicator = null;
		}
	}

	/**
	 * Hide the drag preview (but keep it for reuse)
	 */
	private hideDragPreview(): void {
		if (this.dragGhost) {
			this.dragGhost.visible = false;
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
		if (this.draggedClipId) {
			const registeredClip = this.context.clipRegistry.findClipById(this.draggedClipId);
			if (registeredClip && registeredClip.visual) {
				const clipContainer = registeredClip.visual.getContainer();
				// Restore full opacity
				clipContainer.alpha = 1.0;
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
	 * Validate drag command before execution
	 */
	private validateDragCommand(command: any, dropZone?: DropZoneResult): boolean {
		try {
			// Check if we have required dependencies
			if (!this.draggedPlayer || !this.context || !command) {
				console.warn("Missing required dependencies for drag command");
				return false;
			}

			// Validate track creation limits
			if (dropZone?.needsTrackCreation) {
				const tracks = this.context.timeline.getRenderer().getTracks();
				if (tracks.length >= this.MAX_TRACKS) {
					console.warn(`Cannot create track: maximum limit of ${this.MAX_TRACKS} reached`);
					return false;
				}

				// Validate insertion index
				if (dropZone.insertionIndex !== undefined && 
					(dropZone.insertionIndex < 0 || dropZone.insertionIndex > tracks.length)) {
					console.warn(`Invalid insertion index: ${dropZone.insertionIndex}`);
					return false;
				}
			}

			// Validate clip compatibility (basic check)
			if (!this.draggedPlayer.clipConfiguration) {
				console.warn("Dragged clip has no configuration");
				return false;
			}

			return true;
		} catch (error) {
			console.error("Error validating drag command:", error);
			return false;
		}
	}

	/**
	 * Handle errors during drag operation
	 */
	private handleDragError(error: unknown): void {
		// Log detailed error for debugging
		console.error("Drag operation failed:", error);

		// Attempt graceful recovery
		try {
			// Animate back to original position
			this.animateBackToOriginal();
			
			// Clean up visual elements
			this.removeDragPreview();
			this.removeDropIndicator();
		} catch (cleanupError) {
			console.error("Error during drag error cleanup:", cleanupError);
		}

		// Reset tool state
		this.resetState();

		// Emit error event for UI feedback (if the context supports custom events)
		try {
			// We could emit a custom event here, but for now just log the error
			// since the executeCommand interface only accepts EditCommand types
			console.warn("Drag error occurred:", error instanceof Error ? error.message : "Unknown drag error");
		} catch (eventError) {
			console.error("Failed to handle drag error event:", eventError);
		}
	}

	/**
	 * Cancel the current drag operation
	 */
	private cancelDrag(): void {
		if (this.isDragging) {
			// Animate back to original position if desired
			this.animateBackToOriginal();
			
			// Clean up visual elements
			this.removeDragPreview();
			this.removeDropIndicator();
			
			// Reset state
			this.resetState();
		}
	}

	/**
	 * Reset all drag state
	 */
	private resetState(): void {
		this.isDragging = false;
		this.isPotentialDrag = false;
		this.draggedPlayer = null;
		this.draggedClipId = null; // Clear stable ID
		this.dragStartState = null;
		this.previewPosition = null;
		this.cachedDragValues = null; // Clear cached values
		this.lastUpdateTime = 0; // Reset throttle timer
		this.isExecutingCommand = false; // Reset command execution flag

		// Clean up ghost and drop indicator if they exist
		if (this.dragGhost) {
			this.removeDragPreview();
		}
		if (this.dropIndicator) {
			this.removeDropIndicator();
		}
	}
}
