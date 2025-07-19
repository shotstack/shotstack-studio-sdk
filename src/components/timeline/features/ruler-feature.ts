import { EventEmitter } from "@core/events/event-emitter";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../../core/theme";

import { TIMELINE_CONSTANTS, TimelineFeatureEvents, RulerFeatureOptions } from "./types";

interface IntervalConfig {
	seconds: number;
	minPixelSpacing: number;
	dotCount: number;
}

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

	// Configuration for different zoom levels
	private static readonly INTERVAL_CONFIGS: IntervalConfig[] = [
		{ seconds: 1, minPixelSpacing: 80, dotCount: 4 },
		{ seconds: 5, minPixelSpacing: 80, dotCount: 4 },
		{ seconds: 10, minPixelSpacing: 80, dotCount: 9 },
		{ seconds: 30, minPixelSpacing: 80, dotCount: 5 },
		{ seconds: 60, minPixelSpacing: 80, dotCount: 5 }
	];

	private static readonly DOT_STYLE = {
		radius: 1.5,
		yPosition: 0.5 // Percentage of ruler height
	};

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
		
		const config = this.getCurrentIntervalConfig();
		const visibleDuration = this.getVisibleDuration();
		const dotColor = this.theme?.colors.ui.iconMuted || 0x666666;
		const dotY = this.rulerHeight * RulerFeature.DOT_STYLE.yPosition;
		
		// Calculate dot spacing
		const dotSpacing = config.seconds / (config.dotCount + 1);

		// Draw dots between labels
		for (let labelIndex = 0; labelIndex * config.seconds <= visibleDuration; labelIndex++) {
			const labelTime = labelIndex * config.seconds;
			
			// Draw dots after this label (except for label at 0)
			for (let dotIndex = 1; dotIndex <= config.dotCount; dotIndex++) {
				const dotTime = labelTime + (dotIndex * dotSpacing);
				if (dotTime <= visibleDuration) {
					const x = dotTime * this.pixelsPerSecond;
					this.timeMarkers.circle(x, dotY, RulerFeature.DOT_STYLE.radius);
					this.timeMarkers.fill(dotColor);
				}
			}
		}
	}

	private drawTimeLabels(): void {
		this.timeLabels.removeChildren();

		const config = this.getCurrentIntervalConfig();
		const visibleDuration = this.getVisibleDuration();
		const textColor = this.theme?.colors.ui.text || 0xffffff;

		// Create label style once
		const labelStyle = {
			fontSize: TIMELINE_CONSTANTS.RULER.LABEL_FONT_SIZE,
			fill: textColor,
			fontFamily: "Arial"
		};

		for (let seconds = 0; seconds <= visibleDuration; seconds += config.seconds) {
			const label = new PIXI.Text({
				text: `${seconds}s`,
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
			label.y = this.rulerHeight * RulerFeature.DOT_STYLE.yPosition;

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

	private getCurrentIntervalConfig(): IntervalConfig {
		// Find the appropriate interval config based on current zoom level
		// Work backwards through configs to find the first one that provides adequate spacing
		for (let i = RulerFeature.INTERVAL_CONFIGS.length - 1; i >= 0; i--) {
			const config = RulerFeature.INTERVAL_CONFIGS[i];
			const pixelSpacing = config.seconds * this.pixelsPerSecond;
			
			if (pixelSpacing >= config.minPixelSpacing) {
				return config;
			}
		}
		
		// Default to the smallest interval if none match (shouldn't happen with proper configs)
		return RulerFeature.INTERVAL_CONFIGS[0];
	}
}