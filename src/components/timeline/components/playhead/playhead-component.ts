export interface PlayheadOptions {
	onSeek: (timeMs: number) => void;
	getScrollX?: () => number;
}

/** Playhead indicator with drag support */
export class PlayheadComponent {
	public readonly element: HTMLElement;
	private readonly options: PlayheadOptions;
	private currentTimeMs = 0;
	private pixelsPerSecond = 50;
	private isDragging = false;
	private containerRect: DOMRect | null = null;
	private currentScrollX = 0;
	private needsUpdate = true;

	constructor(options: PlayheadOptions) {
		this.element = document.createElement("div");
		this.element.className = "ss-playhead";
		this.options = options;
		this.buildElement();
	}

	private buildElement(): void {
		const line = document.createElement("div");
		line.className = "ss-playhead-line";
		this.element.appendChild(line);

		const handle = document.createElement("div");
		handle.className = "ss-playhead-handle";
		this.element.appendChild(handle);

		// Make playhead draggable
		this.setupDrag(handle);
	}

	private setupDrag(handle: HTMLElement): void {
		const onPointerDown = (e: PointerEvent) => {
			this.isDragging = true;
			handle.setPointerCapture(e.pointerId);
			e.preventDefault();

			// Cache container rect for drag calculation
			const container = this.element.parentElement;
			if (container) {
				this.containerRect = container.getBoundingClientRect();
			}
		};

		const onPointerMove = (e: PointerEvent) => {
			if (!this.isDragging || !this.containerRect) return;

			// Get current scroll from callback or stored value
			const scrollX = this.options.getScrollX?.() ?? this.currentScrollX;
			const x = e.clientX - this.containerRect.left + scrollX;
			const time = Math.max(0, x / this.pixelsPerSecond);

			// Update position immediately for smooth feedback
			this.setPosition(time * 1000);

			// Emit seek event
			this.options.onSeek(time * 1000);
		};

		const onPointerUp = (e: PointerEvent) => {
			if (this.isDragging) {
				this.isDragging = false;
				handle.releasePointerCapture(e.pointerId);
				this.containerRect = null;
			}
		};

		handle.addEventListener("pointerdown", onPointerDown);
		handle.addEventListener("pointermove", onPointerMove);
		handle.addEventListener("pointerup", onPointerUp);
		handle.addEventListener("pointercancel", onPointerUp);
	}

	public draw(): void {
		if (!this.needsUpdate) return;
		this.needsUpdate = false;

		const timeSec = this.currentTimeMs / 1000;
		const x = timeSec * this.pixelsPerSecond;

		this.element.style.setProperty("--playhead-time", String(timeSec));
		this.element.style.left = `${x}px`;
	}

	public dispose(): void {
		this.element.remove();
	}

	public setPixelsPerSecond(pps: number): void {
		this.pixelsPerSecond = pps;
		this.needsUpdate = true;
	}

	public setTime(timeMs: number): void {
		if (this.isDragging) return; // Don't update during drag

		this.currentTimeMs = timeMs;
		this.needsUpdate = true;
	}

	private setPosition(timeMs: number): void {
		this.currentTimeMs = timeMs;
		this.needsUpdate = true;
		// Immediate draw for responsive drag feedback
		this.draw();
	}

	public getTime(): number {
		return this.currentTimeMs;
	}

	public setScrollX(scrollX: number): void {
		this.currentScrollX = scrollX;
	}
}
