import { TimelineV2 } from "./timeline-v2";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import * as PIXI from "pixi.js";

interface DragInfo {
	trackIndex: number;
	clipIndex: number;
	startTime: number;
	offsetX: number;
	offsetY: number;
}

enum InteractionState {
	IDLE = "idle",
	SELECTING = "selecting", 
	DRAGGING = "dragging"
}

export class TimelineInteraction {
	private timeline: TimelineV2;
	private state: InteractionState = InteractionState.IDLE;
	private abortController?: AbortController;
	
	// Drag detection
	private startPointerPos: { x: number; y: number } | null = null;
	private currentClipInfo: { trackIndex: number; clipIndex: number } | null = null;
	private dragInfo: DragInfo | null = null;
	
	// Distance threshold for drag detection (3px)
	private static readonly DRAG_THRESHOLD = 3;

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
		}
	}

	private handlePointerUp(event: PIXI.FederatedPointerEvent): void {
		if (this.state === InteractionState.SELECTING && this.currentClipInfo) {
			// Complete selection using proper command system
			this.timeline.getEdit().selectClip(this.currentClipInfo.trackIndex, this.currentClipInfo.clipIndex);
		} else if (this.state === InteractionState.DRAGGING) {
			this.completeDrag(event);
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
}