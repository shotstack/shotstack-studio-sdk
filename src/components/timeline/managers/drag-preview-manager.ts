import * as PIXI from "pixi.js";

import { TimelineLayout } from "../timeline-layout";
import { ResolvedClipConfig } from "../types/timeline";
import { VisualTrack } from "../visual/visual-track";

export interface DraggedClipInfo {
	trackIndex: number;
	clipIndex: number;
	clipConfig: ResolvedClipConfig;
}

export class DragPreviewManager {
	private dragPreviewContainer: PIXI.Container | null = null;
	private dragPreviewGraphics: PIXI.Graphics | null = null;
	private draggedClipInfo: DraggedClipInfo | null = null;

	constructor(
		private container: PIXI.Container,
		private layout: TimelineLayout,
		private getPixelsPerSecond: () => number,
		private getTrackHeight: () => number,
		private getVisualTracks: () => VisualTrack[]
	) {}

	public showDragPreview(trackIndex: number, clipIndex: number, clipData: ResolvedClipConfig): void {
		if (!clipData) return;

		this.draggedClipInfo = { trackIndex, clipIndex, clipConfig: clipData };

		// Create drag preview
		this.dragPreviewContainer = new PIXI.Container();
		this.dragPreviewGraphics = new PIXI.Graphics();
		this.dragPreviewContainer.addChild(this.dragPreviewGraphics);
		this.container.addChild(this.dragPreviewContainer);

		// Set original clip to dragging state
		const visualTracks = this.getVisualTracks();
		visualTracks[trackIndex]?.getClip(clipIndex)?.setDragging(true);

		// Draw initial preview
		this.drawDragPreview(trackIndex, clipData.start);
	}

	/** @internal */
	public drawDragPreview(trackIndex: number, time: number): void {
		if (!this.dragPreviewContainer || !this.dragPreviewGraphics || !this.draggedClipInfo) return;

		const { clipConfig } = this.draggedClipInfo;
		const x = this.layout.getXAtTime(time);
		const y = trackIndex * this.layout.trackHeight;
		const width = clipConfig.length * this.getPixelsPerSecond();

		// Clear and redraw
		this.dragPreviewGraphics.clear();
		this.dragPreviewGraphics.roundRect(0, 0, width, this.getTrackHeight(), 4);
		this.dragPreviewGraphics.fill({ color: 0x8e8e93, alpha: 0.6 });
		this.dragPreviewGraphics.stroke({ width: 2, color: 0x00ff00 });

		// Position
		this.dragPreviewContainer.position.set(x, y);
	}

	/** @internal */
	private drawDragPreviewAtPosition(time: number, freeY: number, targetTrack: number): void {
		if (!this.dragPreviewContainer || !this.dragPreviewGraphics || !this.draggedClipInfo) return;

		const { clipConfig } = this.draggedClipInfo;
		const x = this.layout.getXAtTime(time);
		const width = clipConfig.length * this.getPixelsPerSecond();
		const height = this.getTrackHeight();

		// Clear and redraw
		this.dragPreviewGraphics.clear();

		// Draw the ghost preview with free positioning
		this.dragPreviewGraphics.roundRect(0, 0, width, height, 4);
		this.dragPreviewGraphics.fill({ color: 0x8e8e93, alpha: 0.6 });

		// Different border color to indicate target track
		const targetY = targetTrack * this.layout.trackHeight;
		const isAligned = Math.abs(freeY - targetY) < 5; // Within 5 pixels of target
		const borderColor = isAligned ? 0x00ff00 : 0xffaa00; // Green if aligned, orange if not

		this.dragPreviewGraphics.stroke({ width: 2, color: borderColor });

		// Position at free Y
		this.dragPreviewContainer.position.set(x, freeY);
	}

	public hideDragPreview(): void {
		if (this.dragPreviewContainer) {
			this.dragPreviewContainer.destroy({ children: true });
			this.dragPreviewContainer = null;
			this.dragPreviewGraphics = null;
		}

		// Reset original clip appearance
		if (this.draggedClipInfo) {
			const visualTracks = this.getVisualTracks();
			visualTracks[this.draggedClipInfo.trackIndex]?.getClip(this.draggedClipInfo.clipIndex)?.setDragging(false);
			this.draggedClipInfo = null;
		}
	}

	public hideDragGhost(): void {
		if (this.dragPreviewContainer) {
			this.dragPreviewContainer.visible = false;
		}
	}

	public showDragGhost(trackIndex: number, time: number, freeY?: number): void {
		if (!this.dragPreviewContainer || !this.draggedClipInfo) return;
		this.dragPreviewContainer.visible = true;

		if (freeY !== undefined) {
			// Use free Y position for ghost
			this.drawDragPreviewAtPosition(time, freeY, trackIndex);
		} else {
			// Use track-aligned position
			this.drawDragPreview(trackIndex, time);
		}
	}

	public getDraggedClipInfo(): DraggedClipInfo | null {
		return this.draggedClipInfo;
	}

	public hasActivePreview(): boolean {
		return this.dragPreviewContainer !== null;
	}

	public dispose(): void {
		this.hideDragPreview();
	}
}
