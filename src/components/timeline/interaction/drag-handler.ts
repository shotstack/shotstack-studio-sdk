import { CreateTrackAndMoveClipCommand } from "@core/commands/create-track-and-move-clip-command";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import * as PIXI from "pixi.js";

import { CollisionDetector } from "./collision-detector";
import { SnapManager } from "./snap-manager";
import { 
	TimelineInterface, 
	DragInfo, 
	Point, 
	ClipInfo,
	DropZone,
	InteractionThresholds,
	InteractionHandler 
} from "./types";
import { VisualFeedbackManager } from "./visual-feedback-manager";

export class DragHandler implements InteractionHandler {
	private timeline: TimelineInterface;
	private thresholds: InteractionThresholds;
	private snapManager: SnapManager;
	private collisionDetector: CollisionDetector;
	private visualFeedback: VisualFeedbackManager;
	
	private dragInfo: DragInfo | null = null;
	private currentDropZone: DropZone | null = null;
	
	constructor(
		timeline: TimelineInterface,
		thresholds: InteractionThresholds,
		snapManager: SnapManager,
		collisionDetector: CollisionDetector,
		visualFeedback: VisualFeedbackManager
	) {
		this.timeline = timeline;
		this.thresholds = thresholds;
		this.snapManager = snapManager;
		this.collisionDetector = collisionDetector;
		this.visualFeedback = visualFeedback;
	}
	
	public activate(): void {
		// Handler activation if needed
	}
	
	public deactivate(): void {
		this.endDrag();
	}
	
	public canStartDrag(startPos: Point, currentPos: Point): boolean {
		const distance = Math.sqrt(
			(currentPos.x - startPos.x)**2 + 
			(currentPos.y - startPos.y)**2
		);
		
		const {trackHeight} = this.timeline.getLayout();
		const threshold = trackHeight < 20 ? 2 : this.thresholds.drag.base;
		
		return distance > threshold;
	}
	
	public startDrag(clipInfo: ClipInfo, event: PIXI.FederatedPointerEvent): boolean {
		const clipData = this.timeline.getClipData(clipInfo.trackIndex, clipInfo.clipIndex);
		if (!clipData) {
			console.warn(`Clip data not found for track ${clipInfo.trackIndex}, clip ${clipInfo.clipIndex}`);
			return false;
		}
		
		// Calculate offset from clip start to mouse position
		const localPos = this.timeline.getContainer().toLocal(event.global);
		const layout = this.timeline.getLayout();
		const clipStartX = layout.getXAtTime(clipData.start || 0);
		// Use relative position within tracks area, not absolute position
		const clipStartY = clipInfo.trackIndex * layout.trackHeight;
		
		this.dragInfo = {
			trackIndex: clipInfo.trackIndex,
			clipIndex: clipInfo.clipIndex,
			startTime: clipData.start || 0,
			offsetX: localPos.x - clipStartX,
			offsetY: localPos.y - clipStartY
		};
		
		// Set cursor
		this.timeline.getPixiApp().canvas.style.cursor = "grabbing";
		
		// Emit drag started event
		this.timeline.getEdit().events.emit("drag:started", this.dragInfo);
		
		return true;
	}
	
	public updateDrag(event: PIXI.FederatedPointerEvent): void {
		if (!this.dragInfo) return;
		
		const position = this.calculateDragPosition(event);
		const dropZone = this.detectDropZone(position.y);
		
		if (dropZone) {
			this.handleDropZonePreview(dropZone, position);
		} else {
			this.handleNormalDragPreview(position);
		}
		
		this.emitDragUpdate(position, dropZone);
	}
	
	public completeDrag(event: PIXI.FederatedPointerEvent): void {
		if (!this.dragInfo) return;
		
		const dragInfo = { ...this.dragInfo };
		const position = this.calculateDragPosition(event);
		const dropZone = this.detectDropZone(position.y);
		
		// End drag to ensure visual cleanup happens first
		this.endDrag();
		
		if (dropZone) {
			this.executeDropZoneMove(dropZone, dragInfo, position);
		} else {
			this.executeNormalMove(dragInfo, position);
		}
	}
	
	private calculateDragPosition(event: PIXI.FederatedPointerEvent): { x: number; y: number; time: number; track: number; ghostY: number } {
		if (!this.dragInfo) throw new Error("No drag info available");
		
		const localPos = this.timeline.getContainer().toLocal(event.global);
		const layout = this.timeline.getLayout();
		
		const rawTime = Math.max(0, layout.getTimeAtX(localPos.x - this.dragInfo.offsetX));
		const dragY = localPos.y - this.dragInfo.offsetY;
		
		// Calculate which track the clip center is over
		const clipCenterY = dragY + (layout.trackHeight / 2);
		const dragTrack = Math.max(0, Math.floor(clipCenterY / layout.trackHeight));
		
		// Ensure within bounds
		const maxTrackIndex = this.timeline.getVisualTracks().length - 1;
		const boundedTrack = Math.max(0, Math.min(maxTrackIndex, dragTrack));
		
		return {
			x: localPos.x,
			y: localPos.y + layout.viewportY, // For drop zone detection
			time: rawTime,
			track: boundedTrack,
			ghostY: dragY // Free Y position for ghost
		};
	}
	
	private detectDropZone(y: number): DropZone | null {
		const layout = this.timeline.getLayout();
		const tracks = this.timeline.getVisualTracks();
		const threshold = layout.trackHeight * this.thresholds.dropZone.ratio;
		
		// Check each potential insertion point
		for (let i = 0; i <= tracks.length; i += 1) {
			const boundaryY = layout.tracksY + (i * layout.trackHeight);
			if (Math.abs(y - boundaryY) < threshold) {
				let type: "above" | "below" | "between";
				if (i === 0) {
					type = "above";
				} else if (i === tracks.length) {
					type = "below";
				} else {
					type = "between";
				}
				return {
					type,
					position: i
				};
			}
		}
		
		return null;
	}
	
	private handleDropZonePreview(dropZone: DropZone, _position: { time: number }): void {
		if (!this.currentDropZone || 
			this.currentDropZone.type !== dropZone.type || 
			this.currentDropZone.position !== dropZone.position) {
			this.currentDropZone = dropZone;
			this.visualFeedback.showDropZone(dropZone);
		}
		this.timeline.hideDragGhost();
		this.visualFeedback.hideSnapGuidelines();
		this.visualFeedback.hideTargetTrack();
	}
	
	private handleNormalDragPreview(position: { time: number; track: number; ghostY?: number }): void {
		if (!this.dragInfo) return;
		
		// Hide drop zone if showing
		if (this.currentDropZone) {
			this.visualFeedback.hideDropZone();
			this.currentDropZone = null;
		}
		
		// Get clip duration for calculations
		const clipConfig = this.timeline.getClipData(this.dragInfo.trackIndex, this.dragInfo.clipIndex);
		if (!clipConfig) return;
		const clipDuration = clipConfig.length || 0;
		
		// Calculate final position with snapping and collision prevention
		const excludeIndex = position.track === this.dragInfo.trackIndex ? this.dragInfo.clipIndex : undefined;
		const finalTime = this.calculateFinalPosition(position.time, position.track, clipDuration, excludeIndex);
		
		// Update snap guidelines
		const alignments = this.snapManager.findAlignedElements(finalTime, clipDuration, position.track, excludeIndex);
		if (alignments.length > 0) {
			this.visualFeedback.showSnapGuidelines(alignments);
		} else {
			this.visualFeedback.hideSnapGuidelines();
		}
		
		// Show visual indicator for target track
		this.visualFeedback.showTargetTrack(position.track);
		
		// Show drag preview with free Y position
		this.timeline.showDragGhost(position.track, finalTime, position.ghostY);
	}
	
	private calculateFinalPosition(time: number, track: number, clipDuration: number, excludeIndex?: number): number {
		// First apply snapping
		const snapResult = this.snapManager.calculateSnapPosition(time, track, clipDuration, excludeIndex);
		
		// Then ensure no overlaps
		const validPosition = this.collisionDetector.getValidDropPosition(
			snapResult.time, 
			clipDuration, 
			track, 
			excludeIndex
		);
		
		return validPosition.validTime;
	}
	
	private emitDragUpdate(position: { time: number; track: number }, dropZone: DropZone | null): void {
		if (!this.dragInfo) return;
		
		const clipConfig = this.timeline.getClipData(this.dragInfo.trackIndex, this.dragInfo.clipIndex);
		if (!clipConfig) return;
		const clipDuration = clipConfig.length || 0;
		
		const finalTime = dropZone 
			? position.time
			: this.calculateFinalPosition(
				position.time, 
				position.track, 
				clipDuration,
				position.track === this.dragInfo.trackIndex ? this.dragInfo.clipIndex : undefined
			);
		
		this.timeline.getEdit().events.emit("drag:moved", {
			...this.dragInfo,
			currentTime: finalTime,
			currentTrack: dropZone ? -1 : position.track
		});
	}
	
	private executeDropZoneMove(dropZone: DropZone, dragInfo: DragInfo, position: { time: number }): void {
		const command = new CreateTrackAndMoveClipCommand(
			dropZone.position,
			dragInfo.trackIndex,
			dragInfo.clipIndex,
			position.time
		);
		this.timeline.getEdit().executeEditCommand(command);
	}
	
	private executeNormalMove(dragInfo: DragInfo, position: { time: number; track: number }): void {
		const clipConfig = this.timeline.getClipData(dragInfo.trackIndex, dragInfo.clipIndex);
		if (!clipConfig) return;
		
		const clipDuration = clipConfig.length || 0;
		const excludeIndex = position.track === dragInfo.trackIndex ? dragInfo.clipIndex : undefined;
		const finalTime = this.calculateFinalPosition(position.time, position.track, clipDuration, excludeIndex);
		
		// Only execute if position changed
		const hasChanged = position.track !== dragInfo.trackIndex || 
			Math.abs(finalTime - dragInfo.startTime) > 0.01;
		
		if (hasChanged) {
			const command = new MoveClipCommand(
				dragInfo.trackIndex,
				dragInfo.clipIndex,
				position.track,
				finalTime
			);
			this.timeline.getEdit().executeEditCommand(command);
		}
	}
	
	private endDrag(): void {
		this.dragInfo = null;
		this.currentDropZone = null;
		
		this.visualFeedback.hideAll();
		this.timeline.getPixiApp().canvas.style.cursor = "default";
		this.timeline.getEdit().events.emit("drag:ended", {});
	}
	
	public getDragInfo(): DragInfo | null {
		return this.dragInfo;
	}
	
	public dispose(): void {
		this.endDrag();
	}
}