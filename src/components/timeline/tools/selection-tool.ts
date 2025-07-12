import * as PIXI from "pixi.js";

import { TimelinePointerEvent } from "../types/timeline.types";

import { TimelineTool } from "./tool";

/**
 * Selection tool for selecting and manipulating timeline clips
 */
export class SelectionTool extends TimelineTool {
	public readonly name = "selection";
	public readonly cursor = "default";

	private dragState = {
		isDragging: false,
		startX: 0,
		startY: 0
	};

	public onActivate(): void {}

	public onDeactivate(): void {
		this.dragState.isDragging = false;
	}

	public override onPointerDown(event: TimelinePointerEvent): void {
		this.dragState = {
			isDragging: true,
			startX: event.global.x,
			startY: event.global.y
		};

		const clip = this.context.clipRegistry.findClipByContainer(event.target as PIXI.Container);

		if (clip) {
			this.emitClipClick(clip, event);
		} else if (!this.hasModifierKey(event)) {
			this.context.edit.events.emit("timeline:background:clicked", {});
		}
	}

	public override onPointerMove(_event: TimelinePointerEvent): void {
		// Future: Implement drag selection
	}

	public override onPointerUp(): void {
		this.dragState.isDragging = false;
	}

	public override onKeyDown(event: KeyboardEvent): void {
		if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			// Future: Delete selected clips
		}
	}

	private emitClipClick(clip: any, event: TimelinePointerEvent): void {
		// Get the player object for this clip
		const player = this.context.edit.getPlayerClip(clip.trackIndex, clip.clipIndex);
		if (player) {
			this.context.edit.events.emit("timeline:clip:clicked", {
				player,
				trackIndex: clip.trackIndex,
				clipIndex: clip.clipIndex
			});
		}
		event.stopPropagation();
	}

	private hasModifierKey = (event: TimelinePointerEvent): boolean => event.shiftKey || event.ctrlKey || event.metaKey;
}
