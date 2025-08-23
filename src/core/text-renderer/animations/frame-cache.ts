import type { AnimationFrame, CanvasConfig } from "../types";
import type { AnimationType } from "../config";

interface CacheEntry {
	key: string;
	frames: AnimationFrame[];
	timestamp: number;
	size: number;
}

export class FrameCache {
	private cache: Map<string, CacheEntry> = new Map();
	private maxCacheSize: number = 100 * 1024 * 1024;
	private currentSize: number = 0;
	private hits: number = 0;
	private misses: number = 0;

	generateKey(text: string, animationType: AnimationType, config: CanvasConfig): string {
		const configKey = JSON.stringify({
			width: config.width,
			height: config.height,
			fontSize: config.fontSize,
			fontFamily: config.fontFamily,
			fontWeight: config.fontWeight,
			color: config.color,
			duration: config.duration,
			fps: config.fps,
			direction: config.direction,
			animationStyle: config.animationStyle
		});

		return `${animationType}-${text}-${configKey}`;
	}

	get(key: string): AnimationFrame[] | null {
		const entry = this.cache.get(key);

		if (entry) {
			this.hits++;

			entry.timestamp = Date.now();
			return entry.frames;
		}

		this.misses++;
		return null;
	}

	set(key: string, frames: AnimationFrame[]): void {
		const size = this.calculateSize(frames);

		if (this.currentSize + size > this.maxCacheSize) {
			this.evictLRU(size);
		}

		const entry: CacheEntry = {
			key,
			frames,
			timestamp: Date.now(),
			size
		};

		const oldEntry = this.cache.get(key);
		if (oldEntry) {
			this.currentSize -= oldEntry.size;
		}

		this.cache.set(key, entry);
		this.currentSize += size;
	}

	private calculateSize(frames: AnimationFrame[]): number {
		let size = 0;

		frames.forEach(frame => {
			if (frame.imageData instanceof ImageData) {
				size += frame.imageData.width * frame.imageData.height * 4;
			} else if (frame.imageData instanceof Uint8Array) {
				size += frame.imageData.byteLength;
			}
		});

		return size;
	}

	private evictLRU(requiredSize: number): void {
		const entries = Array.from(this.cache.values());
		entries.sort((a, b) => a.timestamp - b.timestamp);

		let freedSize = 0;

		for (const entry of entries) {
			if (freedSize >= requiredSize) break;

			this.cache.delete(entry.key);
			this.currentSize -= entry.size;
			freedSize += entry.size;

			console.log(`🗑️ Evicted cache entry: ${entry.key.substring(0, 50)}...`);
		}
	}

	clear(): void {
		this.cache.clear();
		this.currentSize = 0;
		this.hits = 0;
		this.misses = 0;
	}

	getStats(): { size: number; maxSize: number; hitRate: number } {
		const total = this.hits + this.misses;
		const hitRate = total > 0 ? this.hits / total : 0;

		return {
			size: this.currentSize,
			maxSize: this.maxCacheSize,
			hitRate: hitRate * 100
		};
	}

	setMaxSize(bytes: number): void {
		this.maxCacheSize = bytes;

		if (this.currentSize > this.maxCacheSize) {
			this.evictLRU(this.currentSize - this.maxCacheSize);
		}
	}
}
