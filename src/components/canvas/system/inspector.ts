import { Entity } from "@core/shared/entity";
import * as pixi from "pixi.js";

type MemoryInfo = {
	totalHeapSize?: number;
	usedHeapSize?: number;
	heapSizeLimit?: number;
};

export interface AssetMemoryInfo {
	id: string;
	type: "video" | "image" | "text" | "rich-text" | "luma" | "audio" | "html" | "shape" | "caption" | "unknown";
	label: string;
	width: number;
	height: number;
	estimatedMB: number;
}

export interface TextureStats {
	videos: { count: number; totalMB: number; avgDimensions: string };
	images: { count: number; totalMB: number; avgDimensions: string };
	text: { count: number; totalMB: number };
	richText: { count: number; totalMB: number };
	luma: { count: number; totalMB: number };
	animated: { count: number; frames: number; totalMB: number };
	totalTextures: number;
	totalMB: number;
}

export interface SystemStats {
	clipCount: number;
	trackCount: number;
	commandCount: number;
	spriteCount: number;
	containerCount: number;
}

interface MemorySnapshot {
	timestamp: number;
	jsHeapUsed: number;
	gpuEstimate: number;
}

export interface PlaybackHealth {
	activePlayerCount: number;
	totalPlayerCount: number;
	videoMaxDrift: number;
	audioMaxDrift: number;
	syncCorrections: number;
}

export class Inspector extends Entity {
	private static readonly Width = 340;
	private static readonly Height = 380;

	// Playback state
	public fps: number;
	public playbackTime: number;
	public playbackDuration: number;
	public isPlaying: boolean;

	// Comprehensive stats (set by Canvas)
	public textureStats: TextureStats | null = null;
	public assetDetails: AssetMemoryInfo[] = [];
	public systemStats: SystemStats | null = null;
	public playbackHealth: PlaybackHealth | null = null;

	// Legacy stats (for backward compatibility)
	public clipCounts: Record<string, number> = {};
	public totalClips: number = 0;
	public richTextCacheStats: { clips: number; totalFrames: number } = { clips: 0, totalFrames: 0 };
	public textPlayerCount: number = 0;
	public lumaMaskCount: number = 0;
	public commandHistorySize: number = 0;
	public trackCount: number = 0;

	private background: pixi.Graphics | null;
	private text: pixi.Text | null;

	// History tracking (inline implementation)
	private historySamples: MemorySnapshot[] = [];
	private readonly maxSamples = 20; // 10 seconds at 2 samples/sec
	private lastSampleTime: number = 0;
	private readonly sampleInterval = 500; // ms

	// Frame timing tracking
	private frameTimes: number[] = [];
	private readonly frameTimeWindow = 60; // Track last 60 frames (1 second at 60fps)
	private readonly jankThreshold = 33; // >33ms = below 30fps = jank

	constructor() {
		super();

		this.background = null;
		this.text = null;

		this.fps = 0;
		this.playbackTime = 0;
		this.playbackDuration = 0;
		this.isPlaying = false;
	}

	public override async load(): Promise<void> {
		const background = new pixi.Graphics();
		background.fillStyle = { color: "#424242", alpha: 0.85 };
		background.rect(0, 0, Inspector.Width, Inspector.Height);
		background.fill();

		this.getContainer().addChild(background);
		this.background = background;

		const text = new pixi.Text();
		text.text = "";
		text.style = {
			fontFamily: "monospace",
			fontSize: 10,
			fill: "#ffffff",
			wordWrap: true,
			wordWrapWidth: Inspector.Width - 10,
			lineHeight: 12
		};
		text.x = 5;
		text.y = 5;

		this.getContainer().addChild(text);
		this.text = text;
	}

	public override update(_: number, deltaMS: number): void {
		if (!this.text) {
			return;
		}

		// Track frame timing
		this.trackFrameTime(deltaMS);

		// Sample history at interval
		const now = performance.now();
		if (now - this.lastSampleTime > this.sampleInterval) {
			const memoryInfo = this.getMemoryInfo();
			const gpuEstimate = this.textureStats?.totalMB ?? this.estimateGpuMemory();

			this.addHistorySample({
				timestamp: now,
				jsHeapUsed: memoryInfo.usedHeapSize ?? 0,
				gpuEstimate
			});
			this.lastSampleTime = now;
		}

		this.renderStats();
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
		// Normalize against 33ms (jank threshold) for better visualization
		const maxScale = 50; // Cap at 50ms for sparkline visualization
		return this.frameTimes
			.slice(-20) // Show last 20 frames
			.map(t => chars[Math.min(7, Math.floor((t / maxScale) * 7))])
			.join("");
	}

	private addHistorySample(snapshot: MemorySnapshot): void {
		this.historySamples.push(snapshot);
		if (this.historySamples.length > this.maxSamples) {
			this.historySamples.shift();
		}
	}

	private getSparkline(metric: "jsHeapUsed" | "gpuEstimate"): string {
		if (this.historySamples.length === 0) return "";

		const chars = "▁▂▃▄▅▆▇█";
		const values = this.historySamples.map(s => s[metric]);
		const max = Math.max(...values);
		const min = Math.min(...values);
		const range = max - min || 1;

		return values.map(v => chars[Math.min(7, Math.floor(((v - min) / range) * 7))]).join("");
	}

	private renderStats(): void {
		if (!this.text) return;

		const memoryInfo = this.getMemoryInfo();
		const jsSparkline = this.getSparkline("jsHeapUsed");
		const gpuSparkline = this.getSparkline("gpuEstimate");

		const jsHeapMB = memoryInfo.usedHeapSize ? this.bytesToMegabytes(memoryInfo.usedHeapSize) : 0;
		const jsLimitMB = memoryInfo.heapSizeLimit ? this.bytesToMegabytes(memoryInfo.heapSizeLimit) : 0;
		const gpuEstMB = this.textureStats?.totalMB ?? this.estimateGpuMemory();
		const totalEstMB = jsHeapMB + gpuEstMB;

		// Frame timing stats
		const frameStats = this.getFrameStats();
		const frameSparkline = this.getFrameTimeSparkline();

		const stats: string[] = [
			// Header row with FPS and playback time
			`FPS: ${this.fps}  ${this.isPlaying ? "▶" : "⏸"}  ${(this.playbackTime / 1000).toFixed(1)}s / ${(this.playbackDuration / 1000).toFixed(1)}s`,
			// Frame timing row
			`Frame: ${frameStats.avgFrameTime.toFixed(0)}ms avg  ${frameStats.maxFrameTime.toFixed(0)}ms max  ${frameSparkline}  Jank: ${frameStats.jankCount}`,
			``
		];

		// Playback Health section
		if (this.playbackHealth) {
			stats.push(`── PLAYBACK HEALTH ──`);
			stats.push(`  Active: ${this.playbackHealth.activePlayerCount}/${this.playbackHealth.totalPlayerCount} players`);

			const videoStatus = this.getSyncStatusIcon(this.playbackHealth.videoMaxDrift);
			const audioStatus = this.getSyncStatusIcon(this.playbackHealth.audioMaxDrift);

			stats.push(`  Video sync: ${videoStatus} (drift: ${Math.round(this.playbackHealth.videoMaxDrift)}ms)`);
			stats.push(`  Audio sync: ${audioStatus} (drift: ${Math.round(this.playbackHealth.audioMaxDrift)}ms)`);
			stats.push(`  Sync corrections: ${this.playbackHealth.syncCorrections} this session`);
			stats.push(``);
		}

		stats.push(`── MEMORY SUMMARY ──`);
		stats.push(`  JS Heap: ${jsHeapMB}MB / ${jsLimitMB}MB  ${jsSparkline}`);
		stats.push(`  GPU Est: ~${gpuEstMB.toFixed(1)}MB  ${gpuSparkline}`);
		stats.push(`  Total Est: ~${totalEstMB.toFixed(1)}MB`);
		stats.push(``);

		// GPU Textures section
		if (this.textureStats) {
			stats.push(`── GPU TEXTURES (est) ──`);
			stats.push(`  Videos:  ${this.textureStats.videos.count} clip${this.textureStats.videos.count !== 1 ? "s" : ""}  ${this.textureStats.videos.avgDimensions}  ~${this.textureStats.videos.totalMB.toFixed(1)}MB`);
			stats.push(`  Images:  ${this.textureStats.images.count} clip${this.textureStats.images.count !== 1 ? "s" : ""}  ${this.textureStats.images.avgDimensions}  ~${this.textureStats.images.totalMB.toFixed(1)}MB`);
			stats.push(`  Text:    ${this.textureStats.text.count} clip${this.textureStats.text.count !== 1 ? "s" : ""} (static)  ~${this.textureStats.text.totalMB.toFixed(1)}MB`);
			stats.push(`  RichTxt: ${this.textureStats.richText.count} clip${this.textureStats.richText.count !== 1 ? "s" : ""}  ~${this.textureStats.richText.totalMB.toFixed(1)}MB`);
			stats.push(`  Luma:    ${this.textureStats.luma.count} mask${this.textureStats.luma.count !== 1 ? "s" : ""}  ~${this.textureStats.luma.totalMB.toFixed(1)}MB`);
			stats.push(`  Animated: ${this.textureStats.animated.count} clip${this.textureStats.animated.count !== 1 ? "s" : ""}  ${this.textureStats.animated.frames} frames  ~${this.textureStats.animated.totalMB.toFixed(1)}MB`);
			stats.push(`  ─────────────────────────────`);
			stats.push(`  Subtotal: ${this.textureStats.totalTextures} textures  ~${this.textureStats.totalMB.toFixed(1)}MB`);
			stats.push(``);
		} else {
			// Fallback to legacy stats
			stats.push(`── GPU TEXTURES ──`);
			stats.push(`  Text clips: ${this.textPlayerCount} (static)`);
			stats.push(`  Animated text: ${this.richTextCacheStats.clips} clips`);
			stats.push(`  Cached frames: ${this.richTextCacheStats.totalFrames} (~${this.estimateLegacyTextureMemory()}MB)`);
			stats.push(`  Luma masks: ${this.lumaMaskCount}`);
			stats.push(``);
		}

		// Asset Details section (show top 6)
		if (this.assetDetails.length > 0) {
			stats.push(`── ASSET DETAILS ──`);
			const displayAssets = this.assetDetails.slice(0, 6);
			for (const asset of displayAssets) {
				const typeIcon = this.getAssetTypeIcon(asset.type);
				const dims = asset.width > 0 && asset.height > 0 ? `${asset.width}×${asset.height}` : "";
				const label = asset.label.length > 18 ? `${asset.label.substring(0, 15)}...` : asset.label;
				stats.push(`  ${typeIcon} ${label.padEnd(18)} ${dims.padEnd(10)} ~${asset.estimatedMB.toFixed(1)}MB`);
			}
			if (this.assetDetails.length > 6) {
				stats.push(`  ... +${this.assetDetails.length - 6} more`);
			}
			stats.push(``);
		}

		// System section
		if (this.systemStats) {
			stats.push(`── SYSTEM ──`);
			stats.push(`  Clips: ${this.systemStats.clipCount}  Tracks: ${this.systemStats.trackCount}  Commands: ${this.systemStats.commandCount}`);
			stats.push(`  Sprites: ${this.systemStats.spriteCount}  Containers: ${this.systemStats.containerCount}`);
		} else {
			// Fallback to legacy
			stats.push(`── SYSTEM ──`);
			stats.push(`  Clips: ${this.totalClips}  Tracks: ${this.trackCount}  Commands: ${this.commandHistorySize}`);
			stats.push(`  ${this.formatClipCounts()}`);
		}

		this.text.text = stats.join("\n");

		// Resize background to fit content
		if (this.background) {
			this.background.clear();
			this.background.fillStyle = { color: "#424242", alpha: 0.85 };
			this.background.rect(0, 0, Inspector.Width, this.text.height + 10);
			this.background.fill();
		}
	}

	private getSyncStatusIcon(driftMs: number): string {
		if (driftMs < 50) return "✓ OK";
		if (driftMs < 100) return "⚠ DRIFT";
		return "🔴 DESYNC";
	}

	private getAssetTypeIcon(type: string): string {
		switch (type) {
			case "video":
				return "[V]";
			case "image":
				return "[I]";
			case "text":
				return "[T]";
			case "rich-text":
				return "[R]";
			case "luma":
				return "[L]";
			case "audio":
				return "[A]";
			case "html":
				return "[H]";
			case "shape":
				return "[S]";
			case "caption":
				return "[C]";
			default:
				return "[?]";
		}
	}

	public override draw(): void {}

	public override dispose(): void {
		this.background?.destroy();
		this.background = null;

		this.text?.destroy();
		this.text = null;
	}

	private formatClipCounts(): string {
		const types = ["video", "image", "text", "audio", "luma", "html", "title"];
		const counts = types.filter(t => (this.clipCounts[t] || 0) > 0).map(t => `${t}: ${this.clipCounts[t]}`);
		return counts.length > 0 ? counts.join("  ") : "none";
	}

	private estimateLegacyTextureMemory(): number {
		// Assume 1080x1080 @ 4 bytes/pixel = ~4.5MB per frame
		const bytesPerFrame = 1080 * 1080 * 4;
		return Math.round((this.richTextCacheStats.totalFrames * bytesPerFrame) / 1024 / 1024);
	}

	private estimateGpuMemory(): number {
		// Legacy estimation when textureStats not available
		const textMemory = this.estimateLegacyTextureMemory();
		const lumaMaskMemory = this.lumaMaskCount * 1; // ~1MB per luma mask
		const textPlayerMemory = this.textPlayerCount * 0.5; // ~0.5MB per static text
		return textMemory + lumaMaskMemory + textPlayerMemory;
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
}
