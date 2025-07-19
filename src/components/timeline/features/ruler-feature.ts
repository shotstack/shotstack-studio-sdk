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
		// Calculate ruler width - ensure it covers at least the viewport width when zoomed out
		const calculatedWidth = this.timelineDuration * this.pixelsPerSecond;
		// Get viewport width from parent container (timeline width)
		const viewportWidth = this.getContainer().parent?.width || 800;
		const rulerWidth = Math.max(calculatedWidth, viewportWidth);
		
		const rulerColor = this.theme?.colors.structure.ruler || 0x404040;
		const borderColor = this.theme?.colors.structure.border || 0x606060;
		
		this.rulerBackground.rect(0, 0, rulerWidth, this.rulerHeight);
		this.rulerBackground.fill(rulerColor);
		this.rulerBackground.rect(0, this.rulerHeight - 1, rulerWidth, 1);
		this.rulerBackground.fill(borderColor);
	}

	private drawTimeMarkers(): void {
		this.timeMarkers.clear();
		
		const majorMarkerColor = this.theme?.colors.ui.icon || 0x888888;
		const minorMarkerColor = this.theme?.colors.ui.iconMuted || 0x666666;
		
		// Calculate the actual duration to render (might be longer than timeline duration when zoomed out)
		const viewportWidth = this.getContainer().parent?.width || 800;
		const visibleDuration = Math.max(this.timelineDuration, viewportWidth / this.pixelsPerSecond);

		// Major markers every second
		for (let second = 0; second <= visibleDuration; second += 1) {
			const x = second * this.pixelsPerSecond;
			const height = second % 5 === 0 
				? this.rulerHeight * TIMELINE_CONSTANTS.RULER.MAJOR_MARKER_HEIGHT_RATIO 
				: this.rulerHeight * TIMELINE_CONSTANTS.RULER.MINOR_MARKER_HEIGHT_RATIO;

			this.timeMarkers.rect(x, this.rulerHeight - height, 1, height);
			this.timeMarkers.fill(majorMarkerColor);
		}

		// Minor markers every 0.1 seconds if zoomed in enough
		if (this.pixelsPerSecond > TIMELINE_CONSTANTS.RULER.MINOR_MARKER_ZOOM_THRESHOLD) {
			for (let tenth = 0; tenth <= visibleDuration * 10; tenth += 1) {
				if (tenth % 10 !== 0) {
					// Skip major markers
					const x = (tenth / 10) * this.pixelsPerSecond;
					const height = this.rulerHeight * TIMELINE_CONSTANTS.RULER.MINOR_MARKER_TENTH_HEIGHT_RATIO;

					this.timeMarkers.rect(x, this.rulerHeight - height, 1, height);
					this.timeMarkers.fill(minorMarkerColor);
				}
			}
		}
	}

	private drawTimeLabels(): void {
		this.timeLabels.removeChildren();

		// Calculate the actual duration to render (might be longer than timeline duration when zoomed out)
		const viewportWidth = this.getContainer().parent?.width || 800;
		const visibleDuration = Math.max(this.timelineDuration, viewportWidth / this.pixelsPerSecond);

		// Labels every 5 seconds or every second if zoomed in
		const labelInterval = this.pixelsPerSecond > TIMELINE_CONSTANTS.RULER.LABEL_ZOOM_THRESHOLD 
			? TIMELINE_CONSTANTS.RULER.LABEL_INTERVAL_ZOOMED 
			: TIMELINE_CONSTANTS.RULER.LABEL_INTERVAL_DEFAULT;

		for (let second = 0; second <= visibleDuration; second += labelInterval) {
			const x = second * this.pixelsPerSecond;
			const timeText = this.formatTime(second);

			const textColor = this.theme?.colors.ui.textMuted || 0xcccccc;
			const label = new PIXI.Text({
				text: timeText,
				style: {
					fontSize: TIMELINE_CONSTANTS.RULER.LABEL_FONT_SIZE,
					fill: textColor,
					fontFamily: "Arial"
				}
			});

			label.x = x + TIMELINE_CONSTANTS.RULER.LABEL_PADDING_X;
			label.y = TIMELINE_CONSTANTS.RULER.LABEL_PADDING_Y;
			this.timeLabels.addChild(label);
		}
	}

	private formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
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
}