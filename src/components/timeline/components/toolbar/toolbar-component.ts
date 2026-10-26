import type { PendingCaptures } from "@core/pending-captures";
import { type Seconds, sec } from "@core/timing/types";

// Short preparations, such as cache hits, are over before anyone could read the line.
const PREPARING_DELAY_MS = 500;

export interface ToolbarOptions {
	onPlay: () => void;
	onPause: () => void;
	onSkipBack: () => void;
	onSkipForward: () => void;
	onZoomChange: (pixelsPerSecond: number) => void;
}

/** Timeline toolbar with playback controls and zoom */
export class ToolbarComponent {
	public readonly element: HTMLElement;
	private readonly options: ToolbarOptions;
	private timeDisplayElement: HTMLElement | null = null;
	private playButton: HTMLButtonElement | null = null;
	private zoomSlider: HTMLInputElement | null = null;
	private statusElement: HTMLElement | null = null;
	private statusTimer: ReturnType<typeof setTimeout> | null = null;
	private statusText = "";
	private progressRing: HTMLElement | null = null;
	private isPlaying = false;
	private currentTime: Seconds = sec(0);
	private duration: Seconds = sec(0);

	constructor(options: ToolbarOptions, initialZoom: number = 50) {
		this.element = document.createElement("div");
		this.element.className = "ss-timeline-toolbar";
		this.options = options;
		this.buildElement(initialZoom);
	}

	public draw(): void {
		// Update play button state
		if (this.playButton) {
			this.playButton.innerHTML = this.isPlaying ? this.getPauseIcon() : this.getPlayIcon();
		}

		// Update time display
		if (this.timeDisplayElement) {
			this.timeDisplayElement.textContent = `${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}`;
		}
	}

	public dispose(): void {
		if (this.statusTimer) clearTimeout(this.statusTimer);
		this.statusTimer = null;
		this.element.remove();
	}

	private buildElement(initialZoom: number): void {
		const leftSection = document.createElement("div");
		leftSection.className = "ss-toolbar-section";
		this.statusElement = document.createElement("span");
		this.statusElement.className = "ss-toolbar-status";
		// Stays rendered and empty when idle: a live region announces text written into it, not one revealed by display.
		this.statusElement.setAttribute("role", "status");
		leftSection.appendChild(this.statusElement);
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
		// The button's icon is rewritten on every draw, so the ring sits beside the button, not inside it.
		const playWrap = document.createElement("span");
		playWrap.className = "ss-play-wrap";
		playWrap.appendChild(this.playButton);
		this.progressRing = document.createElement("span");
		this.progressRing.className = "ss-play-progress";
		this.progressRing.setAttribute("role", "progressbar");
		this.progressRing.setAttribute("aria-label", "Preparing smooth playback");
		this.progressRing.setAttribute("aria-valuemin", "0");
		this.progressRing.setAttribute("aria-valuemax", "100");
		this.progressRing.innerHTML =
			'<svg viewBox="0 0 52 52" aria-hidden="true"><circle class="ss-play-progress-track" cx="26" cy="26" r="24"/><circle class="ss-play-progress-fill" cx="26" cy="26" r="24" pathLength="100"/></svg>';
		playWrap.appendChild(this.progressRing);
		centerSection.appendChild(playWrap);

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

	// Called on every draw, so it only touches the DOM when the line changes.
	public setPendingCaptures({ pending, total, progress }: PendingCaptures): void {
		const status = this.statusElement;
		if (!status) return;
		const ring = this.progressRing;
		if (ring) {
			const value = String(pending > 0 ? Math.round(progress * 100) : 100);
			if (ring.getAttribute("aria-valuenow") !== value) {
				ring.style.setProperty("--ss-play-progress", value);
				ring.setAttribute("aria-valuenow", value);
			}
			ring.classList.toggle("ss-play-progress--shown", pending > 0 && !!status.textContent);
		}
		if (pending === 0) {
			if (this.statusTimer) clearTimeout(this.statusTimer);
			this.statusTimer = null;
			if (status.textContent) status.textContent = "";
			return;
		}
		this.statusText = `Preparing smooth playback · ${total - pending} of ${total} ready`;
		if (status.textContent) {
			if (status.textContent !== this.statusText) status.textContent = this.statusText;
			return;
		}
		if (this.statusTimer) return;
		this.statusTimer = setTimeout(() => {
			this.statusTimer = null;
			status.textContent = this.statusText;
			this.progressRing?.classList.add("ss-play-progress--shown");
		}, PREPARING_DELAY_MS);
	}

	public updatePlayState(isPlaying: boolean): void {
		this.isPlaying = isPlaying;
	}

	public updateTimeDisplay(currentTime: Seconds, duration: Seconds): void {
		this.currentTime = currentTime;
		this.duration = duration;
	}

	public setZoom(pixelsPerSecond: number): void {
		if (this.zoomSlider) {
			this.zoomSlider.value = String(Math.round(pixelsPerSecond));
		}
	}

	private formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${minutes.toString().padStart(2, "0")}:${secs.toFixed(1).padStart(4, "0")}`;
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
