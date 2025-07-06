import { Edit } from "@core/edit";
import { Entity } from "@shared/entity";
import { TIMELINE_CONFIG } from "@timeline/timeline-config";
import * as pixi from "pixi.js";

export class TimelineRuler extends Entity {
	private static readonly HEIGHT = TIMELINE_CONFIG.dimensions.rulerHeight;

	private edit: Edit;
	private width: number;
	private scrollPosition: number;
	private pixelsPerSecond: number;

	private background: pixi.Graphics | null;

	constructor(edit: Edit, width: number) {
		super();
		this.edit = edit;
		this.width = width;
		this.scrollPosition = 0;
		this.pixelsPerSecond = TIMELINE_CONFIG.dimensions.defaultPixelsPerSecond;

		this.background = null;
	}

	public override async load(): Promise<void> {
		this.background = new pixi.Graphics();
		this.getContainer().addChild(this.background);

		this.draw();
	}

	public override update(_: number, __: number): void {
		// Ruler is relatively static, only redraws when needed
	}

	public override draw(): void {
		if (!this.background) return;

		this.background.clear();

		// Properly dispose of existing text labels to prevent memory leaks
		while (this.background.children.length > 0) {
			const child = this.background.children[0];
			this.background.removeChild(child);
			if (child instanceof pixi.Text) {
				child.destroy({ children: true });
			}
		}

		// Draw ruler background
		this.background.fillStyle = { color: TIMELINE_CONFIG.colors.ruler };
		this.background.rect(0, 0, this.width, TimelineRuler.HEIGHT);
		this.background.fill();

		// Draw time markers
		this.background.strokeStyle = { color: TIMELINE_CONFIG.colors.rulerTicks, width: 1 };

		const secondsInView = this.width / this.pixelsPerSecond;

		// Determine appropriate interval based on zoom level
		let interval = 1; // 1 second
		if (this.pixelsPerSecond < 30) interval = 5;
		if (this.pixelsPerSecond < 10) interval = 10;

		const startTime = Math.floor(this.scrollPosition / this.pixelsPerSecond);

		for (let time = startTime; time <= startTime + secondsInView + 1; time += interval) {
			if (time < 0) {
				// eslint-disable-next-line no-continue
				continue;
			}

			const x = time * this.pixelsPerSecond - this.scrollPosition;

			// Draw tick mark
			this.background.moveTo(x, 15);
			this.background.lineTo(x, TimelineRuler.HEIGHT);
			this.background.stroke();

			// Add timestamp text
			const timeText = new pixi.Text(this.formatTime(time), {
				fontSize: 9,
				fill: TIMELINE_CONFIG.colors.textPrimary
			});

			timeText.position.set(x - timeText.width / 2, 2);
			this.background.addChild(timeText);
		}
	}

	public override dispose(): void {
		// Remove event listeners first to prevent memory leaks
		this.getContainer().removeAllListeners();
		this.getContainer().eventMode = "none";

		// Dispose of PIXI objects with proper cleanup
		if (this.background) {
			// Dispose all text children first
			for (let i = this.background.children.length - 1; i >= 0; i -= 1) {
				const child = this.background.children[i];
				if (child instanceof pixi.Text) {
					child.destroy({ children: true });
				}
			}

			if (this.background.parent) {
				this.background.parent.removeChild(this.background);
			}
			this.background.destroy({ children: true });
			this.background = null;
		}
	}

	// Public methods for timeline control
	public updateScrollPosition(scrollPosition: number): void {
		this.scrollPosition = scrollPosition;
		this.draw();
	}

	public updatePixelsPerSecond(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.draw();
	}

	public updateWidth(width: number): void {
		this.width = width;
		this.draw();
	}

	public static getHeight(): number {
		return TimelineRuler.HEIGHT;
	}

	// Event handling
	public handleClick(event: pixi.FederatedPointerEvent): void {
		const clickX = event.getLocalPosition(this.getContainer()).x;

		// Calculate time based on click position
		const clickTime = ((clickX + this.scrollPosition) / this.pixelsPerSecond) * 1000;

		// Seek the edit to that time
		this.edit.seek(clickTime);
	}

	private formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	}
}
