import { ResizeClipCommand } from "@core/commands/resize-clip-command";
import * as PIXI from "pixi.js";

import { TimelineInterface, ResizeInfo, ClipInfo, InteractionThresholds, InteractionHandler } from "./types";

export class ResizeHandler implements InteractionHandler {
	private timeline: TimelineInterface;
	private thresholds: InteractionThresholds;
	private resizeInfo: ResizeInfo | null = null;

	constructor(timeline: TimelineInterface, thresholds: InteractionThresholds) {
		this.timeline = timeline;
		this.thresholds = thresholds;
	}

	public activate(): void {
		// Handler activation if needed
	}

	public deactivate(): void {
		this.endResize();
	}

	public isOnClipRightEdge(clipInfo: ClipInfo, event: PIXI.FederatedPointerEvent): boolean {
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
		const threshold = this.getResizeThreshold();

		return distance <= threshold;
	}

	public startResize(clipInfo: ClipInfo, event: PIXI.FederatedPointerEvent): boolean {
		const clipData = this.timeline.getClipData(clipInfo.trackIndex, clipInfo.clipIndex);
		if (!clipData) return false;

		this.resizeInfo = {
			trackIndex: clipInfo.trackIndex,
			clipIndex: clipInfo.clipIndex,
			originalLength: clipData.length || 0,
			startX: event.global.x
		};

		// Set cursor
		this.timeline.getPixiApp().canvas.style.cursor = "ew-resize";

		// Set visual feedback on the clip
		const track = this.timeline.getVisualTracks()[clipInfo.trackIndex];
		if (track) {
			const clip = track.getClip(clipInfo.clipIndex);
			if (clip) {
				clip.setResizing(true);
			}
		}

		this.timeline.getEdit().events.emit("resize:started", this.resizeInfo);
		return true;
	}

	public updateResize(event: PIXI.FederatedPointerEvent): void {
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

				this.timeline.getEdit().events.emit("resize:updated", { width: newWidth });
			}
		}
	}

	public completeResize(event: PIXI.FederatedPointerEvent): void {
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
			const command = new ResizeClipCommand(this.resizeInfo.trackIndex, this.resizeInfo.clipIndex, newLength);
			this.timeline.getEdit().executeEditCommand(command);

			this.timeline.getEdit().events.emit("resize:ended", { newLength });
		}

		this.endResize();
	}

	public getCursorForPosition(clipInfo: ClipInfo | null, event: PIXI.FederatedPointerEvent): string {
		if (clipInfo && this.isOnClipRightEdge(clipInfo, event)) {
			return "ew-resize";
		}
		return "";
	}

	private getResizeThreshold(): number {
		const { trackHeight } = this.timeline.getLayout();
		// More generous scaling for smaller tracks
		return Math.max(this.thresholds.resize.min, Math.min(this.thresholds.resize.max, trackHeight * this.thresholds.resize.ratio));
	}

	private endResize(): void {
		this.resizeInfo = null;
		this.timeline.getPixiApp().canvas.style.cursor = "default";
	}

	public getResizeInfo(): ResizeInfo | null {
		return this.resizeInfo;
	}

	public dispose(): void {
		this.endResize();
	}
}
