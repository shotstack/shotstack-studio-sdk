import { TimelineEntity } from "../../core/timeline-entity";

interface RulerOptions {
	onSeek?: (timeMs: number) => void;
	onWheel?: (e: WheelEvent) => void;
}

/** Time ruler component for the timeline */
export class RulerComponent extends TimelineEntity {
	private readonly contentElement: HTMLElement;
	private readonly options: RulerOptions;
	private currentPixelsPerSecond = 50;
	private currentDuration = 60;
	private needsRender = true;
	private scrollX = 0;

	constructor(options: RulerOptions = {}) {
		super("div", "ss-timeline-ruler");
		this.options = options;
		this.contentElement = this.buildElement();
		this.setupClickHandler();
	}

	private setupClickHandler(): void {
		this.element.addEventListener("click", this.handleClick.bind(this));
		this.element.addEventListener(
			"wheel",
			e => {
				if (this.options.onWheel) {
					this.options.onWheel(e);
				}
			},
			{ passive: true }
		);
	}

	private handleClick(e: MouseEvent): void {
		if (!this.options.onSeek) return;

		const rect = this.element.getBoundingClientRect();
		const x = e.clientX - rect.left + this.scrollX;
		const time = Math.max(0, x / this.currentPixelsPerSecond);

		this.options.onSeek(time * 1000);
	}

	private buildElement(): HTMLElement {
		const content = document.createElement("div");
		content.className = "ss-ruler-content";
		this.element.appendChild(content);
		return content;
	}

	public async load(): Promise<void> {
		// No async initialization needed
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// State is updated via update(pps, duration)
	}

	public draw(): void {
		if (!this.needsRender) return;
		this.needsRender = false;

		const pps = this.currentPixelsPerSecond;
		const duration = this.currentDuration;

		// Calculate appropriate interval based on zoom level
		let interval = 1; // seconds
		if (pps < 20) interval = 10;
		else if (pps < 40) interval = 5;
		else if (pps < 80) interval = 2;
		else if (pps > 150) interval = 0.5;

		// Clear existing markers
		this.contentElement.innerHTML = "";

		// Generate markers
		for (let t = 0; t <= duration; t += interval) {
			const marker = document.createElement("div");
			marker.className = "ss-ruler-marker";
			marker.style.left = `${t * pps}px`;

			const line = document.createElement("div");
			line.className = "ss-ruler-marker-line";
			marker.appendChild(line);

			const label = document.createElement("div");
			label.className = "ss-ruler-marker-label";
			label.textContent = this.formatTime(t);
			marker.appendChild(label);

			this.contentElement.appendChild(marker);

			// Add minor markers between major ones
			if (interval >= 1) {
				const minorInterval = interval / 4;
				for (let mt = t + minorInterval; mt < t + interval && mt <= duration; mt += minorInterval) {
					const minorMarker = document.createElement("div");
					minorMarker.className = "ss-ruler-marker minor";
					minorMarker.style.left = `${mt * pps}px`;

					const minorLine = document.createElement("div");
					minorLine.className = "ss-ruler-marker-line";
					minorMarker.appendChild(minorLine);

					this.contentElement.appendChild(minorMarker);
				}
			}
		}
	}

	/** Update ruler parameters and mark for re-render */
	public updateRuler(pixelsPerSecond: number, duration: number): void {
		if (pixelsPerSecond === this.currentPixelsPerSecond && duration === this.currentDuration) {
			return;
		}

		this.currentPixelsPerSecond = pixelsPerSecond;
		this.currentDuration = duration;
		this.needsRender = true;
	}

	private formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		if (mins > 0) {
			return `${mins}:${secs.toString().padStart(2, "0")}`;
		}
		return `${secs}s`;
	}

	public syncScroll(scrollX: number): void {
		this.contentElement.style.transform = `translateX(${-scrollX}px)`;
	}

	public dispose(): void {
		this.element.remove();
	}
}
