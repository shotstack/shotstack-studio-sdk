import { TimelineV2 } from "./timeline-v2";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import { ResizeClipCommand } from "@core/commands/resize-clip-command";
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
	
	// Distance threshold for drag detection (3px)
	private static readonly DRAG_THRESHOLD = 3;
	// Distance threshold for resize edge detection (15px)
	private static readonly RESIZE_EDGE_THRESHOLD = 15;

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
		const dragTrack = Math.max(0, Math.floor((localPos.y - this.dragInfo.offsetY) / layout.trackHeight));

		// Emit drag moved event for visual feedback
		this.timeline.getEdit().events.emit('drag:moved', {
		    ...this.dragInfo,
		    currentTime: dragTime,
		    currentTrack: dragTrack
		});
	}

	private completeDrag(event: PIXI.FederatedPointerEvent): void {
		if (!this.dragInfo) return;

		// Store drag info before ending drag
		const dragInfo = { ...this.dragInfo };

		// End drag BEFORE executing command to ensure visual cleanup happens first
		this.endDrag();

		// Calculate drop position using the same logic as drag preview (with offset)
		const localPos = this.timeline.getContainer().toLocal(event.global);
		const layout = this.timeline.getLayout();
		const dropTime = Math.max(0, layout.getTimeAtX(localPos.x - dragInfo.offsetX));
		const dropTrack = Math.max(0, Math.floor((localPos.y - dragInfo.offsetY) / layout.trackHeight));
		
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

	private endDrag(): void {
		this.dragInfo = null;
		
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
}