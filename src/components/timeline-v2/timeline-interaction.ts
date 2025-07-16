import { TimelineV2 } from "./timeline-v2";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import { ResizeClipCommand } from "@core/commands/resize-clip-command";
import { CreateTrackAndMoveClipCommand } from "@core/commands/create-track-and-move-clip-command";
import * as PIXI from "pixi.js";

interface DragInfo {
	trackIndex: number;
	clipIndex: number;
	startTime: number;
	offsetX: number;
	offsetY: number;
}

interface ResizeInfo {
	trackIndex: number;
	clipIndex: number;
	originalLength: number;
	startX: number;
}

enum InteractionState {
	IDLE = "idle",
	SELECTING = "selecting", 
	DRAGGING = "dragging",
	RESIZING = "resizing"
}

export class TimelineInteraction {
	private timeline: TimelineV2;
	private state: InteractionState = InteractionState.IDLE;
	private abortController?: AbortController;
	
	// Drag detection
	private startPointerPos: { x: number; y: number } | null = null;
	private currentClipInfo: { trackIndex: number; clipIndex: number } | null = null;
	private dragInfo: DragInfo | null = null;
	private resizeInfo: ResizeInfo | null = null;
	
	// Drop zone visualization
	private dropZoneIndicator: PIXI.Graphics | null = null;
	private currentDropZone: { type: 'above' | 'between' | 'below'; position: number } | null = null;
	
	// Distance threshold for drag detection (3px)
	private static readonly DRAG_THRESHOLD = 3;
	// Distance threshold for resize edge detection (15px)
	private static readonly RESIZE_EDGE_THRESHOLD = 15;
	// Distance threshold for drop zone detection (20px from track boundaries)
	private static readonly DROP_ZONE_THRESHOLD = 20;

	constructor(timeline: TimelineV2) {
		this.timeline = timeline;
	}

	public activate(): void {
		this.abortController = new AbortController();
		this.setupEventListeners();
	}

	public deactivate(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = undefined;
		}
		this.resetState();
	}

	private setupEventListeners(): void {
		const pixiApp = this.timeline.getPixiApp();
		
		pixiApp.stage.interactive = true;
		
		pixiApp.stage.on('pointerdown', this.handlePointerDown.bind(this), {
			signal: this.abortController?.signal
		});
		pixiApp.stage.on('pointermove', this.handlePointerMove.bind(this), {
			signal: this.abortController?.signal
		});
		pixiApp.stage.on('pointerup', this.handlePointerUp.bind(this), {
			signal: this.abortController?.signal
		});
		pixiApp.stage.on('pointerupoutside', this.handlePointerUp.bind(this), {
			signal: this.abortController?.signal
		});
	}

	private handlePointerDown(event: PIXI.FederatedPointerEvent): void {
		const target = event.target as PIXI.Container;
		
		// Check if clicked on a clip
		if (target.label) {
			const clipInfo = this.parseClipLabel(target.label);
			if (clipInfo) {
				// Check if clicking on resize edge
				if (this.isOnClipRightEdge(clipInfo, event)) {
					this.startResize(clipInfo, event);
					return;
				}
				
				this.startInteraction(clipInfo, event);
				return;
			}
		}
		
		// Clicked on empty space - clear selection
		this.timeline.getEdit().clearSelection();
	}

	private handlePointerMove(event: PIXI.FederatedPointerEvent): void {
		if (this.state === InteractionState.SELECTING && this.startPointerPos && this.currentClipInfo) {
			// Check if we've moved far enough to start dragging
			const currentPos = { x: event.global.x, y: event.global.y };
			const distance = Math.sqrt(
				Math.pow(currentPos.x - this.startPointerPos.x, 2) +
				Math.pow(currentPos.y - this.startPointerPos.y, 2)
			);
			
			if (distance > TimelineInteraction.DRAG_THRESHOLD) {
				this.startDrag(this.currentClipInfo, event);
			}
		} else if (this.state === InteractionState.DRAGGING) {
			this.updateDragPreview(event);
		} else if (this.state === InteractionState.RESIZING) {
			this.updateResizePreview(event);
		} else if (this.state === InteractionState.IDLE) {
			// Update cursor based on hover position
			this.updateCursorForPosition(event);
		}
	}

	private handlePointerUp(event: PIXI.FederatedPointerEvent): void {
		if (this.state === InteractionState.SELECTING && this.currentClipInfo) {
			// Complete selection using proper command system
			this.timeline.getEdit().selectClip(this.currentClipInfo.trackIndex, this.currentClipInfo.clipIndex);
		} else if (this.state === InteractionState.DRAGGING) {
			this.completeDrag(event);
		} else if (this.state === InteractionState.RESIZING) {
			this.completeResize(event);
		}
		
		this.resetState();
	}

	private startInteraction(clipInfo: { trackIndex: number; clipIndex: number }, event: PIXI.FederatedPointerEvent): void {
		this.state = InteractionState.SELECTING;
		this.startPointerPos = { x: event.global.x, y: event.global.y };
		this.currentClipInfo = clipInfo;
		
		// Set cursor to indicate draggable
		this.timeline.getPixiApp().canvas.style.cursor = 'grab';
	}

	private startDrag(clipInfo: { trackIndex: number; clipIndex: number }, event: PIXI.FederatedPointerEvent): void {
		// Check if clip data exists
		const clipData = this.timeline.getClipData(clipInfo.trackIndex, clipInfo.clipIndex);
		if (!clipData) {
			console.warn(`Clip data not found for track ${clipInfo.trackIndex}, clip ${clipInfo.clipIndex}`);
			return;
		}

		// Calculate offset from clip start to mouse position
		const localPos = this.timeline.getContainer().toLocal(event.global);
		const layout = this.timeline.getLayout();
		const clipStartX = layout.getXAtTime(clipData.start || 0);
		const clipStartY = layout.getYAtTrack(clipInfo.trackIndex);
		
		this.dragInfo = {
			trackIndex: clipInfo.trackIndex,
			clipIndex: clipInfo.clipIndex,
			startTime: clipData.start || 0,
			offsetX: localPos.x - clipStartX,
			offsetY: localPos.y - clipStartY
		};

		this.state = InteractionState.DRAGGING;
		
		// Set cursor to indicate dragging
		this.timeline.getPixiApp().canvas.style.cursor = 'grabbing';
		
		// Emit drag started event for visual feedback
		this.timeline.getEdit().events.emit('drag:started', this.dragInfo);
	}

	private updateDragPreview(event: PIXI.FederatedPointerEvent): void {
		if (!this.dragInfo) return;

		// Calculate current drag position
		const localPos = this.timeline.getContainer().toLocal(event.global);
		const layout = this.timeline.getLayout();
		const dragTime = Math.max(0, layout.getTimeAtX(localPos.x - this.dragInfo.offsetX));
		const dragY = localPos.y - this.dragInfo.offsetY;
		
		// Check if we're in a drop zone
		const dropZone = this.getDropZone(dragY);
		
		if (dropZone) {
			// Show drop zone indicator
			if (!this.currentDropZone || 
			    this.currentDropZone.type !== dropZone.type || 
			    this.currentDropZone.position !== dropZone.position) {
				this.currentDropZone = dropZone;
				this.showDropZoneIndicator(dropZone.position);
			}
			
			// Emit drag moved event with drop zone info
			this.timeline.getEdit().events.emit('drag:moved', {
			    ...this.dragInfo,
			    currentTime: dragTime,
			    currentTrack: -1, // Indicate no specific track
			    inDropZone: true
			});
		} else {
			// Hide drop zone indicator if we were showing one
			if (this.currentDropZone || this.dropZoneIndicator) {
				this.hideDropZoneIndicator();
				this.currentDropZone = null;
			}
			
			// Normal drag on existing track
			const dragTrack = Math.max(0, Math.floor(dragY / layout.trackHeight));
			this.timeline.getEdit().events.emit('drag:moved', {
			    ...this.dragInfo,
			    currentTime: dragTime,
			    currentTrack: dragTrack,
			    inDropZone: false
			});
		}
	}

	private completeDrag(event: PIXI.FederatedPointerEvent): void {
		if (!this.dragInfo) return;

		// Store drag info before ending drag
		const dragInfo = { ...this.dragInfo };

		// Calculate drop position
		const localPos = this.timeline.getContainer().toLocal(event.global);
		const layout = this.timeline.getLayout();
		const dropTime = Math.max(0, layout.getTimeAtX(localPos.x - dragInfo.offsetX));
		const dropY = localPos.y - dragInfo.offsetY;
		
		// Check if dropping in a drop zone
		const dropZone = this.getDropZone(dropY);
		
		// End drag to ensure visual cleanup happens first
		this.endDrag();
		
		if (dropZone) {
			// Use the CreateTrackAndMoveClipCommand for atomic operation
			const command = new CreateTrackAndMoveClipCommand(
				dropZone.position,      // Insert track at this position
				dragInfo.trackIndex,    // Source track
				dragInfo.clipIndex,     // Source clip
				dropTime               // New start time
			);
			this.timeline.getEdit().executeEditCommand(command);
		} else {
			// Normal drop on existing track
			const dropTrack = Math.max(0, Math.floor(dropY / layout.trackHeight));
			
			const dropPosition = {
				track: dropTrack,
				time: dropTime,
				x: layout.getXAtTime(dropTime),
				y: layout.getYAtTrack(dropTrack)
			};
			
			// Only execute move if position actually changed
			const hasChanged = 
				dropPosition.track !== dragInfo.trackIndex ||
				Math.abs(dropPosition.time - dragInfo.startTime) > 0.01; // Small tolerance for floating point

			if (hasChanged) {
				// Use existing MoveClipCommand
				const command = new MoveClipCommand(
					dragInfo.trackIndex,    // from track
					dragInfo.clipIndex,     // from clip index  
					dropPosition.track,     // to track
					dropPosition.time       // new start time
				);
				
				this.timeline.getEdit().executeEditCommand(command);
			}
		}
	}

	private endDrag(): void {
		this.dragInfo = null;
		
		// Hide drop zone indicator if showing
		this.hideDropZoneIndicator();
		
		// Reset cursor
		this.timeline.getPixiApp().canvas.style.cursor = 'default';
		
		// Emit drag ended event for visual feedback cleanup
		this.timeline.getEdit().events.emit('drag:ended', {});
	}

	private resetState(): void {
		this.state = InteractionState.IDLE;
		this.startPointerPos = null;
		this.currentClipInfo = null;
		this.dragInfo = null;
		this.resizeInfo = null;
		
		// Hide drop zone indicator if showing
		this.hideDropZoneIndicator();
		
		// Reset cursor
		this.timeline.getPixiApp().canvas.style.cursor = 'default';
	}

	private parseClipLabel(label: string): { trackIndex: number; clipIndex: number } | null {
		if (!label?.startsWith('clip-')) {
			return null;
		}

		const parts = label.split('-');
		if (parts.length !== 3) {
			return null;
		}

		const trackIndex = parseInt(parts[1], 10);
		const clipIndex = parseInt(parts[2], 10);

		if (isNaN(trackIndex) || isNaN(clipIndex)) {
			return null;
		}

		return { trackIndex, clipIndex };
	}

	public dispose(): void {
		this.deactivate();
	}

	// Resize-related methods
	private isOnClipRightEdge(clipInfo: { trackIndex: number; clipIndex: number }, event: PIXI.FederatedPointerEvent): boolean {
		const track = this.timeline.getVisualTracks()[clipInfo.trackIndex];
		if (!track) return false;
		
		const clip = track.getClip(clipInfo.clipIndex);
		if (!clip) return false;
		
		// Get the clip's right edge position in global coordinates
		const clipContainer = clip.getContainer();
		const clipBounds = clipContainer.getBounds();
		const rightEdgeX = clipBounds.x + clipBounds.width;
		
		// Check if mouse is within threshold of right edge
		const distance = Math.abs(event.global.x - rightEdgeX);
		return distance <= TimelineInteraction.RESIZE_EDGE_THRESHOLD;
	}

	private startResize(clipInfo: { trackIndex: number; clipIndex: number }, event: PIXI.FederatedPointerEvent): void {
		const clipData = this.timeline.getClipData(clipInfo.trackIndex, clipInfo.clipIndex);
		if (!clipData) return;

		this.resizeInfo = {
			trackIndex: clipInfo.trackIndex,
			clipIndex: clipInfo.clipIndex,
			originalLength: clipData.length || 0,
			startX: event.global.x
		};

		this.state = InteractionState.RESIZING;
		
		// Set cursor to indicate resizing
		this.timeline.getPixiApp().canvas.style.cursor = 'ew-resize';
		
		// Set visual feedback on the clip
		const track = this.timeline.getVisualTracks()[clipInfo.trackIndex];
		if (track) {
			const clip = track.getClip(clipInfo.clipIndex);
			if (clip) {
				clip.setResizing(true);
			}
		}
	}

	private updateResizePreview(event: PIXI.FederatedPointerEvent): void {
		if (!this.resizeInfo) return;

		// Calculate new duration based on mouse movement
		const deltaX = event.global.x - this.resizeInfo.startX;
		const pixelsPerSecond = this.timeline.getOptions().pixelsPerSecond || 50;
		const deltaTime = deltaX / pixelsPerSecond;
		const newLength = Math.max(0.1, this.resizeInfo.originalLength + deltaTime);

		// Update visual preview
		const track = this.timeline.getVisualTracks()[this.resizeInfo.trackIndex];
		if (track) {
			const clip = track.getClip(this.resizeInfo.clipIndex);
			if (clip) {
				const newWidth = newLength * pixelsPerSecond;
				clip.setPreviewWidth(newWidth);
			}
		}
	}

	private completeResize(event: PIXI.FederatedPointerEvent): void {
		if (!this.resizeInfo) return;

		// Calculate final duration
		const deltaX = event.global.x - this.resizeInfo.startX;
		const pixelsPerSecond = this.timeline.getOptions().pixelsPerSecond || 50;
		const deltaTime = deltaX / pixelsPerSecond;
		const newLength = Math.max(0.1, this.resizeInfo.originalLength + deltaTime);

		// Clear visual preview first
		const track = this.timeline.getVisualTracks()[this.resizeInfo.trackIndex];
		if (track) {
			const clip = track.getClip(this.resizeInfo.clipIndex);
			if (clip) {
				clip.setResizing(false);
				clip.setPreviewWidth(null);
			}
		}

		// Execute resize command if length changed significantly
		if (Math.abs(newLength - this.resizeInfo.originalLength) > 0.01) {
			const command = new ResizeClipCommand(
				this.resizeInfo.trackIndex,
				this.resizeInfo.clipIndex,
				newLength
			);
			this.timeline.getEdit().executeEditCommand(command);
		}
	}

	private updateCursorForPosition(event: PIXI.FederatedPointerEvent): void {
		const target = event.target as PIXI.Container;
		
		if (target.label) {
			const clipInfo = this.parseClipLabel(target.label);
			if (clipInfo && this.isOnClipRightEdge(clipInfo, event)) {
				this.timeline.getPixiApp().canvas.style.cursor = 'ew-resize';
				return;
			}
		}
		
		// Default cursor
		this.timeline.getPixiApp().canvas.style.cursor = 'default';
	}

	private getDropZone(y: number): { type: 'above' | 'between' | 'below'; position: number } | null {
		const layout = this.timeline.getLayout();
		const trackHeight = layout.trackHeight;
		const tracks = this.timeline.getVisualTracks();
		
		// Adjust y to be relative to tracks area (accounting for ruler)
		const relativeY = y;
		
		// Check if above first track
		if (relativeY < -TimelineInteraction.DROP_ZONE_THRESHOLD) {
			return { type: 'above', position: 0 };
		}
		
		// Check if we're inside any track bounds (not near boundaries)
		for (let i = 0; i < tracks.length; i++) {
			const trackTop = i * trackHeight;
			const trackBottom = (i + 1) * trackHeight;
			
			// If we're well inside a track (not near its boundaries), we're not in a drop zone
			if (relativeY > trackTop + TimelineInteraction.DROP_ZONE_THRESHOLD &&
			    relativeY < trackBottom - TimelineInteraction.DROP_ZONE_THRESHOLD) {
				return null; // Inside a track, not in a drop zone
			}
		}
		
		// Check between tracks (within threshold of track boundaries)
		for (let i = 0; i < tracks.length; i++) {
			const trackBottom = (i + 1) * trackHeight;
			const distanceFromBoundary = Math.abs(relativeY - trackBottom);
			
			if (distanceFromBoundary < TimelineInteraction.DROP_ZONE_THRESHOLD) {
				return { type: 'between', position: i + 1 };
			}
		}
		
		// Check if below last track
		const lastTrackBottom = tracks.length * trackHeight;
		if (relativeY > lastTrackBottom + TimelineInteraction.DROP_ZONE_THRESHOLD) {
			return { type: 'below', position: tracks.length };
		}
		
		return null;
	}

	private showDropZoneIndicator(position: number): void {
		// Remove existing indicator if any
		this.hideDropZoneIndicator();
		
		// Create new indicator
		this.dropZoneIndicator = new PIXI.Graphics();
		
		const layout = this.timeline.getLayout();
		const width = this.timeline.getExtendedTimelineWidth();
		// Position at the border between tracks (position 0 = top of first track)
		const y = position * layout.trackHeight;
		
		// Draw a highlighted line with some thickness
		this.dropZoneIndicator.setStrokeStyle({ width: 4, color: 0x00ff00, alpha: 0.8 });
		this.dropZoneIndicator.moveTo(0, y);
		this.dropZoneIndicator.lineTo(width, y);
		this.dropZoneIndicator.stroke();
		
		// Add a subtle glow effect
		this.dropZoneIndicator.setStrokeStyle({ width: 8, color: 0x00ff00, alpha: 0.3 });
		this.dropZoneIndicator.moveTo(0, y);
		this.dropZoneIndicator.lineTo(width, y);
		this.dropZoneIndicator.stroke();
		
		// Add to viewport (not overlay) so it scrolls with content
		this.timeline.getContainer().addChild(this.dropZoneIndicator);
	}

	private hideDropZoneIndicator(): void {
		if (this.dropZoneIndicator) {
			// Clear the graphics first
			this.dropZoneIndicator.clear();
			
			// Ensure it's actually removed from parent
			if (this.dropZoneIndicator.parent) {
				this.dropZoneIndicator.parent.removeChild(this.dropZoneIndicator);
			}
			
			// Destroy the graphics object
			this.dropZoneIndicator.destroy();
			this.dropZoneIndicator = null;
		}
		this.currentDropZone = null;
	}
}