import { BaseTool } from "./base-tool";
import { TimelineV2 } from "../timeline-v2";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import * as PIXI from "pixi.js";

interface DragInfo {
	trackIndex: number;
	clipIndex: number;
	startTime: number;
	offsetX: number;
	offsetY: number;
}

export class DragTool extends BaseTool {
	public readonly name = "drag";

	private isDragging = false;
	private dragStartInfo: DragInfo | null = null;

	constructor(timeline: TimelineV2) {
		super(timeline);
	}

	protected setupEventListeners(): void {
		const pixiApp = this.getPixiApp();
		
		// Ensure the stage is interactive
		pixiApp.stage.interactive = true;
		
		// Listen for PIXI events with AbortController for cleanup
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
				this.startDrag(clipInfo, event);
			}
		}
	}

	private handlePointerMove(event: PIXI.FederatedPointerEvent): void {
		if (this.isDragging) {
			this.updateDragPreview(event);
		}
	}

	private handlePointerUp(event: PIXI.FederatedPointerEvent): void {
		if (this.isDragging) {
			this.completeDrag(event);
		}
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
		
		this.dragStartInfo = {
			trackIndex: clipInfo.trackIndex,
			clipIndex: clipInfo.clipIndex,
			startTime: clipData.start || 0,
			offsetX: localPos.x - clipStartX,
			offsetY: localPos.y - clipStartY
		};

		this.isDragging = true;
		console.log('Drag started:', this.dragStartInfo);
		
		// Emit drag started event for visual feedback
		this.timeline.getEdit().events.emit('drag:started', this.dragStartInfo);
	}

	private updateDragPreview(event: PIXI.FederatedPointerEvent): void {
		if (!this.dragStartInfo) return;

		// Calculate current drag position
		const localPos = this.timeline.getContainer().toLocal(event.global);
		const layout = this.timeline.getLayout();
		const dragTime = Math.max(0, layout.getTimeAtX(localPos.x - this.dragStartInfo.offsetX));
		const dragTrack = Math.max(0, Math.floor((localPos.y - this.dragStartInfo.offsetY) / layout.trackHeight));

		// Emit drag moved event for visual feedback
		this.timeline.getEdit().events.emit('drag:moved', {
		    ...this.dragStartInfo,
		    currentTime: dragTime,
		    currentTrack: dragTrack
		});
	}

	private completeDrag(event: PIXI.FederatedPointerEvent): void {
		if (!this.dragStartInfo) return;

		// Store drag info before ending drag (since endDrag() will clear it)
		const dragInfo = { ...this.dragStartInfo };

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
			console.log('Executing move command:', {
				from: { track: dragInfo.trackIndex, clip: dragInfo.clipIndex },
				to: { track: dropPosition.track, time: dropPosition.time }
			});

			// Use existing MoveClipCommand - it handles all the complexity
			const command = new MoveClipCommand(
				dragInfo.trackIndex,    // from track
				dragInfo.clipIndex,     // from clip index  
				dropPosition.track,               // to track
				dropPosition.time                 // new start time
			);
			
			this.timeline.getEdit().executeEditCommand(command);
		}
	}

	private endDrag(): void {
		this.isDragging = false;
		this.dragStartInfo = null;
		
		// Emit drag ended event for visual feedback cleanup
		this.timeline.getEdit().events.emit('drag:ended', {});
	}
}