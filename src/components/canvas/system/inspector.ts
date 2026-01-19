import type { Edit } from "@core/edit-session";

type MemoryInfo = {
	totalHeapSize?: number;
	usedHeapSize?: number;
	heapSizeLimit?: number;
};

interface MemorySnapshot {
	timestamp: number;
	jsHeapUsed: number;
}

/**
 * Inspector displays performance stats as an HTML overlay.
 * Shows FPS, memory, playback health, and clip statistics.
 */
export class Inspector {
	private container: HTMLDivElement | null = null;
	private animationFrameId: number | null = null;
	private lastFrameTime = 0;
	private edit: Edit;

	// Cached DOM elements for efficient updates (avoid innerHTML every frame)
	private fpsEl: HTMLElement | null = null;
	private playbackEl: HTMLElement | null = null;
	private frameStatsEl: HTMLElement | null = null;
	private frameSparklineEl: HTMLElement | null = null;
	private jankEl: HTMLElement | null = null;
	private heapEl: HTMLElement | null = null;
	private heapSparklineEl: HTMLElement | null = null;
	private clipsEl: HTMLElement | null = null;

	// History tracking
	private historySamples: MemorySnapshot[] = [];
	private readonly maxSamples = 20;
	private lastSampleTime = 0;
	private readonly sampleInterval = 500;

	// Frame timing tracking
	private frameTimes: number[] = [];
	private readonly frameTimeWindow = 60;
	private readonly jankThreshold = 33;

	constructor(edit: Edit) {
		this.edit = edit;
	}

	/**
	 * Mount the inspector to a parent element.
	 * @param parent - The parent element to append the inspector to
	 */
	mount(parent: HTMLElement): void {
		this.container = document.createElement("div");
		this.container.style.cssText = `
			position: fixed;
			top: 10px;
			left: 10px;
			background: rgba(30, 30, 30, 0.9);
			color: #fff;
			font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
			font-size: 11px;
			line-height: 1.4;
			padding: 12px;
			border-radius: 6px;
			z-index: 1000;
			pointer-events: none;
			min-width: 320px;
			backdrop-filter: blur(4px);
			border: 1px solid rgba(255, 255, 255, 0.1);
		`;

		// Build structure once (innerHTML only at mount, not every frame)
		this.container.innerHTML = `
			<div style="color: #4ade80; font-weight: 600;">FPS: <span data-fps></span></div>
			<div style="opacity: 0.7;"><span data-playback></span></div>
			<div style="opacity: 0.7;"><span data-frame-stats></span> <span style="letter-spacing: -1px;" data-frame-sparkline></span> Jank: <span data-jank></span></div>
			<div style="height: 8px;"></div>
			<div style="color: #f472b6; font-weight: 600;">MEMORY</div>
			<div style="opacity: 0.7;">JS Heap: <span data-heap></span> <span style="letter-spacing: -1px;" data-heap-sparkline></span></div>
			<div style="height: 8px;"></div>
			<div style="color: #a78bfa; font-weight: 600;">SYSTEM</div>
			<div style="opacity: 0.7;"><span data-clips></span></div>
		`;

		// Cache element references for efficient per-frame updates
		this.fpsEl = this.container.querySelector("[data-fps]");
		this.playbackEl = this.container.querySelector("[data-playback]");
		this.frameStatsEl = this.container.querySelector("[data-frame-stats]");
		this.frameSparklineEl = this.container.querySelector("[data-frame-sparkline]");
		this.jankEl = this.container.querySelector("[data-jank]");
		this.heapEl = this.container.querySelector("[data-heap]");
		this.heapSparklineEl = this.container.querySelector("[data-heap-sparkline]");
		this.clipsEl = this.container.querySelector("[data-clips]");

		parent.appendChild(this.container);

		// Start the update loop
		this.startUpdateLoop();
	}

	private startUpdateLoop(): void {
		const loop = (timestamp: number) => {
			const deltaMS = timestamp - this.lastFrameTime;
			this.lastFrameTime = timestamp;

			this.update(deltaMS);
			this.animationFrameId = requestAnimationFrame(loop);
		};
		this.animationFrameId = requestAnimationFrame(loop);
	}

	private update(deltaMS: number): void {
		if (!this.container) return;

		// Track frame timing
		this.trackFrameTime(deltaMS);

		// Sample memory at interval
		const now = performance.now();
		if (now - this.lastSampleTime > this.sampleInterval) {
			const memoryInfo = this.getMemoryInfo();
			this.addHistorySample({
				timestamp: now,
				jsHeapUsed: memoryInfo.usedHeapSize ?? 0
			});
			this.lastSampleTime = now;
		}

		this.render();
	}

	private trackFrameTime(deltaMS: number): void {
		this.frameTimes.push(deltaMS);
		if (this.frameTimes.length > this.frameTimeWindow) {
			this.frameTimes.shift();
		}
	}

	private getFrameStats(): { avgFrameTime: number; maxFrameTime: number; jankCount: number } {
		if (this.frameTimes.length === 0) {
			return { avgFrameTime: 0, maxFrameTime: 0, jankCount: 0 };
		}
		const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
		const max = Math.max(...this.frameTimes);
		const jankCount = this.frameTimes.filter(t => t > this.jankThreshold).length;
		return { avgFrameTime: avg, maxFrameTime: max, jankCount };
	}

	private getFrameTimeSparkline(): string {
		if (this.frameTimes.length === 0) return "";
		const chars = "▁▂▃▄▅▆▇█";
		const maxScale = 50;
		return this.frameTimes
			.slice(-20)
			.map(t => chars[Math.min(7, Math.floor((t / maxScale) * 7))])
			.join("");
	}

	private addHistorySample(snapshot: MemorySnapshot): void {
		this.historySamples.push(snapshot);
		if (this.historySamples.length > this.maxSamples) {
			this.historySamples.shift();
		}
	}

	private getJsHeapSparkline(): string {
		if (this.historySamples.length === 0) return "";
		const chars = "▁▂▃▄▅▆▇█";
		const values = this.historySamples.map(s => s.jsHeapUsed);
		const max = Math.max(...values);
		const min = Math.min(...values);
		const range = max - min || 1;
		return values.map(v => chars[Math.min(7, Math.floor(((v - min) / range) * 7))]).join("");
	}

	private render(): void {
		if (!this.container) return;

		const memoryInfo = this.getMemoryInfo();
		const jsSparkline = this.getJsHeapSparkline();
		const jsHeapMB = memoryInfo.usedHeapSize ? this.bytesToMegabytes(memoryInfo.usedHeapSize) : 0;
		const jsLimitMB = memoryInfo.heapSizeLimit ? this.bytesToMegabytes(memoryInfo.heapSizeLimit) : 0;

		const frameStats = this.getFrameStats();
		const frameSparkline = this.getFrameTimeSparkline();

		// Calculate FPS from frame times
		const fps = frameStats.avgFrameTime > 0 ? Math.round(1000 / frameStats.avgFrameTime) : 0;

		// Get playback data from Edit
		const { playbackTime, isPlaying } = this.edit;
		const duration = this.edit.totalDuration;

		// Count clips
		const tracks = this.edit.getTracks();
		const clipCount = tracks.reduce((sum, track) => sum + track.length, 0);
		const trackCount = tracks.length;

		// Update cached elements with textContent (no DOM tree recreation)
		if (this.fpsEl) this.fpsEl.textContent = String(fps);
		if (this.playbackEl)
			this.playbackEl.textContent = `${isPlaying ? "▶" : "⏸"} ${(playbackTime / 1000).toFixed(1)}s / ${(duration / 1000).toFixed(1)}s`;
		if (this.frameStatsEl) this.frameStatsEl.textContent = `Frame: ${frameStats.avgFrameTime.toFixed(0)}/${frameStats.maxFrameTime.toFixed(0)}ms`;
		if (this.frameSparklineEl) this.frameSparklineEl.textContent = frameSparkline;
		if (this.jankEl) this.jankEl.textContent = String(frameStats.jankCount);
		if (this.heapEl) this.heapEl.textContent = `${jsHeapMB}MB / ${jsLimitMB}MB`;
		if (this.heapSparklineEl) this.heapSparklineEl.textContent = jsSparkline;
		if (this.clipsEl) this.clipsEl.textContent = `Clips: ${clipCount}  Tracks: ${trackCount}`;
	}

	private getMemoryInfo(): MemoryInfo {
		const memoryInfo: MemoryInfo = {};
		if (!("memory" in performance)) {
			return memoryInfo;
		}
		memoryInfo.totalHeapSize = (performance.memory as any).totalJSHeapSize;
		memoryInfo.usedHeapSize = (performance.memory as any).usedJSHeapSize;
		memoryInfo.heapSizeLimit = (performance.memory as any).jsHeapSizeLimit;
		return memoryInfo;
	}

	private bytesToMegabytes(bytes: number): number {
		return Math.round(bytes / 1024 / 1024);
	}

	dispose(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
		this.container?.remove();
		this.container = null;
	}
}
