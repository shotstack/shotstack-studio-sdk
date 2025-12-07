import { Entity } from "@core/shared/entity";
import * as pixi from "pixi.js";

export class TranscriptionIndicator extends Entity {
	private background: pixi.Graphics | null = null;
	private spinner: pixi.Graphics | null = null;
	private statusText: pixi.Text | null = null;
	private spinnerAngle = 0;

	private isVisible = false;
	private currentMessage = "";

	public override async load(): Promise<void> {
		this.background = new pixi.Graphics();
		this.getContainer().addChild(this.background);

		this.spinner = new pixi.Graphics();
		this.getContainer().addChild(this.spinner);

		this.statusText = new pixi.Text({
			text: "",
			style: {
				fontFamily: "system-ui, -apple-system, sans-serif",
				fontSize: 11,
				fill: "#ffffff"
			}
		});
		this.getContainer().addChild(this.statusText);

		this.hide();
	}

	public show(message: string): void {
		this.isVisible = true;
		this.currentMessage = message;
		this.getContainer().visible = true;
		this.redraw();
	}

	public hide(): void {
		this.isVisible = false;
		this.getContainer().visible = false;
	}

	public getIsVisible(): boolean {
		return this.isVisible;
	}

	public override update(deltaTime: number, _elapsed: number): void {
		if (!this.isVisible || !this.spinner) return;

		this.spinnerAngle += deltaTime * 0.15;
		this.spinner.rotation = this.spinnerAngle;
	}

	public override draw(): void {}

	private redraw(): void {
		if (!this.background || !this.spinner || !this.statusText) return;

		this.statusText.text = this.currentMessage;

		const textWidth = this.statusText.width;
		const spinnerSize = 12;
		const padding = 8;
		const gap = 6;
		const totalWidth = spinnerSize + gap + textWidth + padding * 2;
		const height = 24;

		this.background.clear();
		this.background.fillStyle = { color: "#000000", alpha: 0.7 };
		this.background.roundRect(0, 0, totalWidth, height, height / 2);
		this.background.fill();

		this.spinner.clear();
		this.spinner.strokeStyle = { color: "#ffffff", width: 2 };
		this.spinner.arc(0, 0, spinnerSize / 2 - 1, 0, Math.PI * 1.5);
		this.spinner.stroke();
		this.spinner.position.set(padding + spinnerSize / 2, height / 2);

		this.statusText.position.set(padding + spinnerSize + gap, (height - this.statusText.height) / 2);
	}

	public setPosition(x: number, y: number): void {
		this.getContainer().position.set(x, y);
	}

	public getWidth(): number {
		if (!this.statusText) return 0;
		const spinnerSize = 12;
		const padding = 8;
		const gap = 6;
		return spinnerSize + gap + this.statusText.width + padding * 2;
	}

	public override dispose(): void {
		this.background?.destroy();
		this.background = null;

		this.spinner?.destroy();
		this.spinner = null;

		this.statusText?.destroy();
		this.statusText = null;
	}
}
