import { EventEmitter } from "@core/events/event-emitter";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TIMELINE_CONSTANTS, TimelineFeatureEvents, PlayheadFeatureOptions } from "./types";

export class PlayheadFeature extends Entity {
	public events = new EventEmitter();
	private graphics: PIXI.Graphics;
	private currentTime = 0;
	private isDragging = false;

	constructor(private options: PlayheadFeatureOptions) {
		super();
		this.graphics = new PIXI.Graphics();
	}

	async load(): Promise<void> {
		this.setupPlayhead();
		this.draw();
	}

	private setupPlayhead(): void {
		this.graphics.label = "playhead";
		this.graphics.eventMode = "static";
		this.graphics.cursor = "pointer";

		// Single set of event listeners
		this.graphics
			.on("pointerdown", this.onPointerDown.bind(this))
			.on("pointermove", this.onPointerMove.bind(this))
			.on("pointerup", this.onPointerUp.bind(this))
			.on("pointerupoutside", this.onPointerUp.bind(this));

		this.getContainer().addChild(this.graphics);
	}

	/** @internal */
	private drawPlayhead(): void {
		const x = this.currentTime * this.options.pixelsPerSecond;
		const playheadColor = this.options.theme?.colors.interaction.playhead ?? 0xff4444;
		const lineWidth = TIMELINE_CONSTANTS.PLAYHEAD.LINE_WIDTH;
		const centerX = x + lineWidth / 2;

		this.graphics.clear();
		this.graphics.fill(playheadColor);

		// Draw line
		this.graphics.rect(x, 0, lineWidth, this.options.timelineHeight);

		// Draw triangle (centered on line)
		const triangleSize = 8;
		const triangleHeight = 10;
		this.graphics.moveTo(centerX, triangleHeight);
		this.graphics.lineTo(centerX - triangleSize, 0);
		this.graphics.lineTo(centerX + triangleSize, 0);
		this.graphics.closePath();

		this.graphics.fill();
	}

	/** @internal */
	private onPointerDown(event: PIXI.FederatedPointerEvent): void {
		this.isDragging = true;
		this.graphics.cursor = "grabbing";
		this.updateTimeFromPointer(event);
	}

	/** @internal */
	private onPointerMove(event: PIXI.FederatedPointerEvent): void {
		if (this.isDragging) {
			this.updateTimeFromPointer(event);
		}
	}

	/** @internal */
	private onPointerUp(): void {
		this.isDragging = false;
		this.graphics.cursor = "pointer";
	}

	/** @internal */
	private updateTimeFromPointer(event: PIXI.FederatedPointerEvent): void {
		const localPos = this.graphics.parent.toLocal(event.global);
		const newTime = Math.max(0, localPos.x / this.options.pixelsPerSecond);
		this.setTime(newTime);
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

	/** @internal */
	public updatePlayhead(pixelsPerSecond: number, timelineHeight: number): void {
		this.options.pixelsPerSecond = pixelsPerSecond;
		this.options.timelineHeight = timelineHeight;
		this.draw();
	}

	public update(): void {} // Event-driven, no frame updates needed

	/** @internal */
	public draw(): void {
		this.drawPlayhead();
	}

	public dispose(): void {
		this.graphics.removeAllListeners();
		this.events.clear("*");
	}
}
