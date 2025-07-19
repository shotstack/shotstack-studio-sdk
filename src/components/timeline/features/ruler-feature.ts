import { EventEmitter } from "@core/events/event-emitter";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../../core/theme";

import { TIMELINE_CONSTANTS, TimelineFeatureEvents, RulerFeatureOptions } from "./types";

export class RulerFeature extends Entity {
	public events: EventEmitter;
	private rulerContainer: PIXI.Container;
	private rulerBackground: PIXI.Graphics;
	private timeMarkers: PIXI.Graphics;
	private timeLabels: PIXI.Container;

	private pixelsPerSecond: number;
	private timelineDuration: number;
	private rulerHeight: number;
	private theme?: TimelineTheme;

	constructor(options: RulerFeatureOptions) {
		super();
		this.events = new EventEmitter();
		this.pixelsPerSecond = options.pixelsPerSecond;
		this.timelineDuration = options.timelineDuration;
		this.rulerHeight = options.rulerHeight ?? TIMELINE_CONSTANTS.RULER.DEFAULT_HEIGHT;
		this.theme = options.theme;

		this.rulerContainer = new PIXI.Container();
		this.rulerBackground = new PIXI.Graphics();
		this.timeMarkers = new PIXI.Graphics();
		this.timeLabels = new PIXI.Container();
	}

	async load(): Promise<void> {
		this.setupRuler();
		this.draw();
	}

	private setupRuler(): void {
		this.rulerContainer.label = "ruler";
		this.rulerContainer.addChild(this.rulerBackground);
		this.rulerContainer.addChild(this.timeMarkers);
		this.rulerContainer.addChild(this.timeLabels);

		// Make ruler interactive for click-to-seek
		this.rulerContainer.eventMode = "static";
		this.rulerContainer.cursor = "pointer";

		this.rulerContainer.on("pointerdown", this.onRulerPointerDown.bind(this));

		this.getContainer().addChild(this.rulerContainer);
	}

	private drawRulerBackground(): void {
		this.rulerBackground.clear();
		const rulerWidth = this.calculateRulerWidth();
		
		const rulerColor = this.theme?.colors.structure.ruler || 0x404040;
		const borderColor = this.theme?.colors.structure.border || 0x606060;
		
		this.rulerBackground.rect(0, 0, rulerWidth, this.rulerHeight);
		this.rulerBackground.fill(rulerColor);
		this.rulerBackground.rect(0, this.rulerHeight - 1, rulerWidth, 1);
		this.rulerBackground.fill(borderColor);
	}

	private drawTimeMarkers(): void {
		this.timeMarkers.clear();
		
		const interval = this.getTimeInterval();
		const visibleDuration = this.getVisibleDuration();
		const dotColor = this.theme?.colors.ui.iconMuted || 0x666666;
		const dotY = this.rulerHeight * 0.5;
		
		// Determine number of dots between labels based on interval
		let dotsPerInterval = 4; // Default for most intervals
		if (interval === 10) dotsPerInterval = 9;
		else if (interval === 30 || interval === 60) dotsPerInterval = 5;
		
		const dotSpacing = interval / (dotsPerInterval + 1);

		// Draw dots between time labels
		for (let time = 0; time <= visibleDuration; time += interval) {
			// Draw dots after this time marker
			for (let i = 1; i <= dotsPerInterval; i++) {
				const dotTime = time + (i * dotSpacing);
				if (dotTime <= visibleDuration) {
					const x = dotTime * this.pixelsPerSecond;
					this.timeMarkers.circle(x, dotY, 1.5);
					this.timeMarkers.fill(dotColor);
				}
			}
		}
	}

	private drawTimeLabels(): void {
		this.timeLabels.removeChildren();

		const interval = this.getTimeInterval();
		const visibleDuration = this.getVisibleDuration();
		const textColor = this.theme?.colors.ui.text || 0xffffff;

		// Create label style
		const labelStyle = {
			fontSize: TIMELINE_CONSTANTS.RULER.LABEL_FONT_SIZE,
			fill: textColor,
			fontFamily: "Arial"
		};

		// Draw time labels at intervals
		for (let seconds = 0; seconds <= visibleDuration; seconds += interval) {
			const label = new PIXI.Text({
				text: this.formatTime(seconds),
				style: labelStyle
			});

			// Position label
			const x = seconds * this.pixelsPerSecond;
			if (seconds === 0) {
				label.anchor.set(0, 0.5);
				label.x = x + TIMELINE_CONSTANTS.RULER.LABEL_PADDING_X;
			} else {
				label.anchor.set(0.5, 0.5);
				label.x = x;
			}
			label.y = this.rulerHeight * 0.5;

			this.timeLabels.addChild(label);
		}
	}


	private onRulerPointerDown(event: PIXI.FederatedPointerEvent): void {
		// Convert global to local coordinates within the ruler
		const localPos = this.rulerContainer.toLocal(event.global);
		const time = Math.max(0, localPos.x / this.pixelsPerSecond);
		this.events.emit("ruler:seeked" as keyof TimelineFeatureEvents, { time });
	}

	public updateRuler(pixelsPerSecond: number, timelineDuration: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.timelineDuration = timelineDuration;
		this.draw();
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// Ruler is static unless parameters change
	}

	public draw(): void {
		this.drawRulerBackground();
		this.drawTimeMarkers();
		this.drawTimeLabels();
	}

	public dispose(): void {
		this.timeLabels.removeChildren();
		this.rulerContainer.removeChildren();
		this.events.clear("*");
	}

	private getViewportWidth(): number {
		return this.getContainer().parent?.width || 800;
	}

	private calculateRulerWidth(): number {
		const calculatedWidth = this.timelineDuration * this.pixelsPerSecond;
		return Math.max(calculatedWidth, this.getViewportWidth());
	}

	private getVisibleDuration(): number {
		return Math.max(this.timelineDuration, this.getViewportWidth() / this.pixelsPerSecond);
	}

	private getTimeInterval(): number {
		// Choose appropriate time interval based on zoom level
		const intervals = [1, 5, 10, 30, 60, 120, 300, 600];
		const minPixelSpacing = 80;
		
		for (const interval of intervals) {
			const pixelSpacing = interval * this.pixelsPerSecond;
			if (pixelSpacing >= minPixelSpacing) {
				return interval;
			}
		}
		
		// If extremely zoomed out, use larger intervals
		return Math.ceil(this.getVisibleDuration() / 10);
	}

	private formatTime(seconds: number): string {
		if (seconds === 0) return "0s";
		
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		
		if (seconds < 60) {
			return `${seconds}s`;
		} else if (remainingSeconds === 0) {
			return `${minutes}m`;
		} else {
			// Format as M:SS for times with seconds
			const formattedSeconds = remainingSeconds.toString().padStart(2, '0');
			return `${minutes}:${formattedSeconds}`;
		}
	}
}