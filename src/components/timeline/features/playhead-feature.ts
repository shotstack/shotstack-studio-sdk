import { EventEmitter } from "@core/events/event-emitter";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../../core/theme";
import { TIMELINE_CONSTANTS, TimelineFeatureEvents, PlayheadFeatureOptions } from "./types";

export class PlayheadFeature extends Entity {
	public events: EventEmitter;
	private playheadContainer: PIXI.Container;
	private playheadLine: PIXI.Graphics;
	private playheadHandle: PIXI.Graphics;

	private pixelsPerSecond: number;
	private timelineHeight: number;
	private currentTime = 0;
	private isDragging = false;
	private theme?: TimelineTheme;

	constructor(options: PlayheadFeatureOptions) {
		super();
		this.events = new EventEmitter();
		this.pixelsPerSecond = options.pixelsPerSecond;
		this.timelineHeight = options.timelineHeight;
		this.theme = options.theme;

		this.playheadContainer = new PIXI.Container();
		this.playheadLine = new PIXI.Graphics();
		this.playheadHandle = new PIXI.Graphics();
	}

	async load(): Promise<void> {
		this.setupPlayhead();
		this.draw();
	}

	private setupPlayhead(): void {
		this.playheadContainer.label = "playhead";
		this.playheadContainer.addChild(this.playheadLine);
		this.playheadContainer.addChild(this.playheadHandle);

		// Make playhead interactive
		this.playheadContainer.eventMode = "static";
		this.playheadContainer.cursor = "pointer";

		this.playheadContainer.on("pointerdown", this.onPlayheadPointerDown.bind(this));
		this.playheadContainer.on("pointermove", this.onPlayheadPointerMove.bind(this));
		this.playheadContainer.on("pointerup", this.onPlayheadPointerUp.bind(this));
		this.playheadContainer.on("pointerupoutside", this.onPlayheadPointerUp.bind(this));

		this.getContainer().addChild(this.playheadContainer);
	}

	private drawPlayhead(): void {
		const x = this.currentTime * this.pixelsPerSecond;
		const playheadColor = this.theme?.colors.interaction.playhead || 0xff4444;

		// Draw playhead line
		this.playheadLine.clear();
		this.playheadLine.rect(x, 0, TIMELINE_CONSTANTS.PLAYHEAD.LINE_WIDTH, this.timelineHeight);
		this.playheadLine.fill(playheadColor);

		// Draw playhead handle
		this.playheadHandle.clear();
		this.playheadHandle.rect(
			x - TIMELINE_CONSTANTS.PLAYHEAD.HANDLE_OFFSET_X, 
			TIMELINE_CONSTANTS.PLAYHEAD.HANDLE_OFFSET_Y, 
			TIMELINE_CONSTANTS.PLAYHEAD.HANDLE_WIDTH, 
			TIMELINE_CONSTANTS.PLAYHEAD.HANDLE_HEIGHT
		);
		this.playheadHandle.fill(playheadColor);
	}

	private onPlayheadPointerDown(event: PIXI.FederatedPointerEvent): void {
		this.isDragging = true;
		this.playheadContainer.cursor = "grabbing";
		this.updateTimeFromPointer(event);
	}

	private onPlayheadPointerMove(event: PIXI.FederatedPointerEvent): void {
		if (this.isDragging) {
			this.updateTimeFromPointer(event);
		}
	}

	private onPlayheadPointerUp(): void {
		this.isDragging = false;
		this.playheadContainer.cursor = "pointer";
	}

	private updateTimeFromPointer(event: PIXI.FederatedPointerEvent): void {
		// Convert global to local coordinates within the playhead container's parent
		const localPos = this.playheadContainer.parent.toLocal(event.global);
		const newTime = Math.max(0, localPos.x / this.pixelsPerSecond);
		this.setTime(newTime);
		// Emit seek event so Edit can update its playback time
		this.events.emit("playhead:seeked" as keyof TimelineFeatureEvents, { time: newTime });
	}

	public setTime(time: number): void {
		this.currentTime = time;
		this.draw();
		this.events.emit("playhead:timeChanged" as keyof TimelineFeatureEvents, { time });
	}

	public getTime(): number {
		return this.currentTime;
	}

	public updatePlayhead(pixelsPerSecond: number, timelineHeight: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.timelineHeight = timelineHeight;
		this.draw();
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// Playhead updates are event-driven
	}

	public draw(): void {
		this.drawPlayhead();
	}

	public dispose(): void {
		this.playheadContainer.removeAllListeners();
		this.playheadContainer.removeChildren();
		this.events.clear("*");
	}
}