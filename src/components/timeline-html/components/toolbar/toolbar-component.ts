import { TimelineEntity } from "../../core/timeline-entity";

export interface ToolbarOptions {
	onPlay: () => void;
	onPause: () => void;
	onZoomChange: (pixelsPerSecond: number) => void;
}

/** Timeline toolbar with playback controls and zoom */
export class ToolbarComponent extends TimelineEntity {
	private readonly options: ToolbarOptions;
	private timeDisplayElement: HTMLElement | null = null;
	private playButton: HTMLButtonElement | null = null;
	private zoomSlider: HTMLInputElement | null = null;
	private isPlaying = false;
	private currentTimeMs = 0;
	private durationMs = 0;

	constructor(options: ToolbarOptions, initialZoom: number = 50) {
		super("div", "ss-timeline-toolbar");
		this.options = options;
		this.buildElement(initialZoom);
	}

	public async load(): Promise<void> {
		// No async initialization needed
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// State is updated via updatePlayState/updateTimeDisplay
	}

	public draw(): void {
		// Update play button state
		if (this.playButton) {
			this.playButton.innerHTML = this.isPlaying ? this.getPauseIcon() : this.getPlayIcon();
		}

		// Update time display
		if (this.timeDisplayElement) {
			this.timeDisplayElement.textContent = `${this.formatTime(this.currentTimeMs)} / ${this.formatTime(this.durationMs)}`;
		}
	}

	public dispose(): void {
		this.element.remove();
	}

	private buildElement(initialZoom: number): void {
		// Left section - playback controls
		const leftSection = document.createElement("div");
		leftSection.className = "ss-toolbar-section";

		this.playButton = this.createButton("play", this.getPlayIcon(), () => {
			if (this.isPlaying) {
				this.options.onPause();
			} else {
				this.options.onPlay();
			}
		});
		leftSection.appendChild(this.playButton);

		this.element.appendChild(leftSection);

		// Center section - time display
		const centerSection = document.createElement("div");
		centerSection.className = "ss-toolbar-section";

		this.timeDisplayElement = document.createElement("span");
		this.timeDisplayElement.className = "ss-time-display";
		this.timeDisplayElement.textContent = "00:00.000 / 00:00.000";
		centerSection.appendChild(this.timeDisplayElement);

		this.element.appendChild(centerSection);

		// Right section - zoom controls
		const rightSection = document.createElement("div");
		rightSection.className = "ss-toolbar-section";

		const zoomOutBtn = this.createButton("zoom-out", this.getZoomOutIcon(), () => {
			const current = parseInt(this.zoomSlider?.value || "50", 10);
			const newZoom = Math.max(10, current / 1.2);
			this.setZoom(newZoom);
			this.options.onZoomChange(newZoom);
		});
		rightSection.appendChild(zoomOutBtn);

		this.zoomSlider = document.createElement("input");
		this.zoomSlider.type = "range";
		this.zoomSlider.className = "ss-zoom-slider";
		this.zoomSlider.min = "10";
		this.zoomSlider.max = "200";
		this.zoomSlider.value = String(initialZoom);
		this.zoomSlider.addEventListener("input", () => {
			const value = parseInt(this.zoomSlider?.value || "50", 10);
			this.options.onZoomChange(value);
		});
		rightSection.appendChild(this.zoomSlider);

		const zoomInBtn = this.createButton("zoom-in", this.getZoomInIcon(), () => {
			const current = parseInt(this.zoomSlider?.value || "50", 10);
			const newZoom = Math.min(200, current * 1.2);
			this.setZoom(newZoom);
			this.options.onZoomChange(newZoom);
		});
		rightSection.appendChild(zoomInBtn);

		this.element.appendChild(rightSection);
	}

	private createButton(name: string, icon: string, onClick: () => void): HTMLButtonElement {
		const btn = document.createElement("button");
		btn.className = "ss-toolbar-btn";
		btn.dataset["action"] = name;
		btn.innerHTML = icon;
		btn.addEventListener("click", onClick);
		return btn;
	}

	public updatePlayState(isPlaying: boolean): void {
		this.isPlaying = isPlaying;
	}

	public updateTimeDisplay(currentTimeMs: number, durationMs: number): void {
		this.currentTimeMs = currentTimeMs;
		this.durationMs = durationMs;
	}

	public setZoom(pixelsPerSecond: number): void {
		if (this.zoomSlider) {
			this.zoomSlider.value = String(Math.round(pixelsPerSecond));
		}
	}

	private formatTime(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		const milliseconds = Math.floor(ms % 1000);
		return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
	}

	// Icon SVGs
	private getPlayIcon(): string {
		return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
	}

	private getPauseIcon(): string {
		return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
	}

	private getZoomInIcon(): string {
		return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>`;
	}

	private getZoomOutIcon(): string {
		return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11h6"/></svg>`;
	}
}
