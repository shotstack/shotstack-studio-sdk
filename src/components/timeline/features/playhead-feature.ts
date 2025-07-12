import { Theme } from "@core/theme/theme-context";
import * as PIXI from "pixi.js";

import { TimelinePointerEvent, StateChanges } from "../types";
import { ITimelineRenderer } from "../types/timeline.interfaces";

import { TimelineFeature } from "./feature";

/**
 * Handles playhead visualization and interaction for timeline seeking
 * Manages both ruler click-to-seek and playhead handle dragging
 */
export class PlayheadFeature extends TimelineFeature {
	public readonly name = "playhead";

	// Visual components
	private playheadLine: PIXI.Graphics | null = null;
	private playheadHandle: PIXI.Graphics | null = null;
	private playheadContainer: PIXI.Container | null = null;

	// Drag state
	private drag = { active: false, startX: 0, startTime: 0 };

	// Visual configuration
	private readonly visual = {
		color: 0xff0000,
		lineWidth: 2,
		handle: {
			scale: 0.8,
			outline: { color: 0xffffff, alpha: 0.5 }
		},
		rulerHeight: 30
	};

	// Computed properties for state access
	private get viewport() {
		return this.getState().viewport;
	}
	private get playback() {
		return this.getState().playback;
	}
	private get currentTime() {
		return this.playback.currentTime;
	}
	private get pixelsPerSecond() {
		return this.viewport.zoom;
	}
	private get scrollX() {
		return this.viewport.scrollX;
	}
	private get viewportWidth() {
		return this.viewport.width;
	}
	private get timelineHeight() {
		return this.viewport.height || 150;
	}

	public onEnable(): void {
		this.createPlayheadVisuals();
	}

	public onDisable(): void {
		this.destroyPlayheadVisuals();
	}

	public handlePointerDown(event: TimelinePointerEvent): boolean {
		if (this.isOnPlayheadHandle(event)) {
			this.startDragging(event);
			return true;
		}

		if (event.global.y < Theme.dimensions.ruler.height) {
			const time = this.xToTime(event.global.x);
			const duration = this.context.edit.getTotalDuration();
			this.seekToTime(Math.max(0, Math.min(time, duration)));
			return true;
		}

		return false;
	}

	public handlePointerMove(event: TimelinePointerEvent): boolean {
		return this.drag.active ? (this.updateDragging(event), true) : false;
	}

	public handlePointerUp(event: TimelinePointerEvent): boolean {
		if (this.drag.active) {
			this.updateDragging(event);
			this.endDragging();
			return true;
		}
		return false;
	}

	public override onStateChanged(changes: StateChanges): void {
		if (changes.viewport) {
			this.drawPlayheadVisuals();
		}

		if (changes.playback || changes.viewport) {
			this.updatePlayheadPosition();
		}
	}

	public renderOverlay(_: ITimelineRenderer): void {}

	private createPlayheadVisuals(): void {
		this.playheadContainer = new PIXI.Container();
		this.playheadContainer.label = "playhead-container";

		this.playheadLine = new PIXI.Graphics();
		this.playheadLine.label = "playhead-line";

		this.playheadHandle = new PIXI.Graphics();
		this.playheadHandle.label = "playhead-handle";
		this.playheadHandle.eventMode = "static";
		this.playheadHandle.cursor = "ew-resize";

		this.playheadContainer.addChild(this.playheadLine, this.playheadHandle);
		this.context.timeline.getRenderer().getLayer("playhead").addChild(this.playheadContainer);

		this.drawPlayheadVisuals();
		this.updatePlayheadPosition();
	}

	private destroyPlayheadVisuals(): void {
		this.playheadContainer?.parent?.removeChild(this.playheadContainer);
		this.playheadContainer?.destroy({ children: true });
		this.playheadContainer = null;
		this.playheadLine = null;
		this.playheadHandle = null;
	}

	private updatePlayheadPosition(): void {
		if (!this.playheadContainer) return;

		const x = this.timeToX(this.currentTime);
		this.playheadContainer.x = x;
		this.playheadContainer.visible = x >= -10 && x <= this.viewportWidth + 10;
	}

	private isOnPlayheadHandle(event: TimelinePointerEvent): boolean {
		if (!this.playheadHandle || !this.playheadContainer) return false;

		const localX = event.global.x - this.playheadContainer.x;
		const localY = event.global.y;
		const { handleWidth, handleHeight } = Theme.dimensions.playhead;

		return Math.abs(localX) <= handleWidth / 2 && localY >= -handleHeight * 1.7 && localY <= handleHeight * 0.7;
	}

	private startDragging(event: TimelinePointerEvent): void {
		this.drag = { active: true, startX: event.global.x, startTime: this.currentTime };
		if (this.playheadHandle) this.playheadHandle.cursor = "grabbing";
	}

	private updateDragging(event: TimelinePointerEvent): void {
		if (!this.drag.active) return;

		const deltaX = event.global.x - this.drag.startX;
		const newTime = this.drag.startTime + deltaX / this.pixelsPerSecond;
		const duration = this.context.edit.getTotalDuration();
		this.seekToTime(Math.max(0, Math.min(newTime, duration)));
	}

	private endDragging(): void {
		this.drag.active = false;
		if (this.playheadHandle) this.playheadHandle.cursor = "ew-resize";
	}

	private timeToX = (time: number): number => time * this.pixelsPerSecond - this.scrollX;
	private xToTime = (x: number): number => Math.max(0, (x + this.scrollX) / this.pixelsPerSecond);
	private seekToTime = (time: number): void => this.context.edit.seek(time * 1000);

	private drawPlayheadVisuals(): void {
		if (!this.playheadLine || !this.playheadHandle) return;

		const { playhead: color, playheadOutline: outlineColor } = Theme.colors.ui;
		const { lineWidth, handleWidth, handleHeight } = Theme.dimensions.playhead;
		const { playheadOutline: outlineAlpha } = Theme.opacity;

		// Draw line
		this.playheadLine.clear().moveTo(0, 0).lineTo(0, this.timelineHeight).stroke({ width: lineWidth, color });

		// Draw handle (diamond)
		const points = [0, handleHeight / 2, -handleWidth / 2, -handleHeight / 2, 0, -handleHeight * 1.5, handleWidth / 2, -handleHeight / 2];
		this.playheadHandle
			.clear()
			.poly(points)
			.fill({ color })
			.stroke({ color: outlineColor, alpha: outlineAlpha, width: Math.max(2, handleWidth / 12) });

		// Set hit area
		const pad = Theme.dimensions.playhead.hitAreaPadding;
		this.playheadHandle.hitArea = new PIXI.Rectangle(-handleWidth / 2 - pad, -handleHeight * 1.7, handleWidth + pad * 2, handleHeight * 2.4);
	}
}
