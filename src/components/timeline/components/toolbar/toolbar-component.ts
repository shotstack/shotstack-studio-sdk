import { TimelineEntity } from "../../core/timeline-entity";

export interface ToolbarOptions {
	onPlay: () => void;
	onPause: () => void;
	onSkipBack: () => void;
	onSkipForward: () => void;
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
		// Left section - empty for balance
		const leftSection = document.createElement("div");
		leftSection.className = "ss-toolbar-section";
		this.element.appendChild(leftSection);

		// Center section - playback controls + time display
		const centerSection = document.createElement("div");
		centerSection.className = "ss-toolbar-section ss-playback-controls";

		// Skip back button
		const skipBackBtn = this.createButton("skip-back", this.getSkipBackIcon(), () => {
			this.options.onSkipBack();
		});
		centerSection.appendChild(skipBackBtn);

		// Play/pause button (larger circular)
		this.playButton = this.createButton("play", this.getPlayIcon(), () => {
			if (this.isPlaying) {
				this.options.onPause();
			} else {
				this.options.onPlay();
			}
		});
		this.playButton.classList.add("ss-play-btn");
		centerSection.appendChild(this.playButton);

		// Skip forward button
		const skipForwardBtn = this.createButton("skip-forward", this.getSkipForwardIcon(), () => {
			this.options.onSkipForward();
		});
		centerSection.appendChild(skipForwardBtn);

		// Time display
		this.timeDisplayElement = document.createElement("span");
		this.timeDisplayElement.className = "ss-time-display";
		this.timeDisplayElement.textContent = "00:00.0 / 00:00.0";
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
		const totalSeconds = ms / 1000;
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
	}

	// Icon SVGs - pointer-events:none ensures clicks pass through to button
	private getPlayIcon(): string {
		return `<svg viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none"><path d="M8 5v14l11-7z"/></svg>`;
	}

	private getPauseIcon(): string {
		return `<svg viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
	}

	private getZoomInIcon(): string {
		return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>`;
	}

	private getZoomOutIcon(): string {
		return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11h6"/></svg>`;
	}

	private getSkipBackIcon(): string {
		return `<svg viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>`;
	}

	private getSkipForwardIcon(): string {
		return `<svg viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>`;
	}
}
