/**
 * ThumbnailGenerator - Extracts video frames for timeline thumbnail strips
 *
 * Creates thumbnail strips by extracting frames at regular intervals from videos.
 * Designed for timeline UI, not export quality - uses smaller dimensions for performance.
 */

interface CachedThumbnail {
	dataUrl: string;
	thumbnailWidth: number;
}

export class ThumbnailGenerator {
	private cache = new Map<string, CachedThumbnail>();
	private pendingRequests = new Map<string, Promise<CachedThumbnail | null>>();
	private videoPool = new Map<string, HTMLVideoElement>();
	private extractionCanvas: HTMLCanvasElement | null = null;
	private extractionContext: CanvasRenderingContext2D | null = null;

	private readonly thumbnailHeight = 72; // Match video track height
	private readonly maxCacheSize = 50;

	constructor() {
		this.initCanvas();
	}

	private initCanvas(): void {
		this.extractionCanvas = document.createElement("canvas");
		this.extractionCanvas.height = this.thumbnailHeight;
		this.extractionContext = this.extractionCanvas.getContext("2d", {
			willReadFrequently: false,
			alpha: false
		});
	}

	/** Generate a single thumbnail at the trim point */
	async generateThumbnail(videoSrc: string, trim: number): Promise<CachedThumbnail | null> {
		const cacheKey = `${videoSrc}|${trim}`;

		const cached = this.cache.get(cacheKey);
		if (cached) return cached;

		const pending = this.pendingRequests.get(cacheKey);
		if (pending) return pending;

		const promise = this.extractThumbnail(videoSrc, trim, cacheKey);
		this.pendingRequests.set(cacheKey, promise);

		try {
			return await promise;
		} finally {
			this.pendingRequests.delete(cacheKey);
		}
	}

	private async extractThumbnail(videoSrc: string, trim: number, cacheKey: string): Promise<CachedThumbnail | null> {
		try {
			const video = await this.getOrLoadVideo(videoSrc);
			if (!video) return null;

			const aspectRatio = video.videoWidth / video.videoHeight;
			const thumbnailWidth = Math.round(this.thumbnailHeight * aspectRatio);

			if (this.extractionCanvas) {
				this.extractionCanvas.width = thumbnailWidth;
				this.extractionCanvas.height = this.thumbnailHeight;
			}

			const dataUrl = await this.extractFrame(video, trim, thumbnailWidth);
			if (!dataUrl) return null;

			const result: CachedThumbnail = { dataUrl, thumbnailWidth };

			this.enforceMaxCacheSize();
			this.cache.set(cacheKey, result);

			return result;
		} catch {
			return null;
		}
	}

	private async extractFrame(video: HTMLVideoElement, time: number, width: number): Promise<string | null> {
		if (!this.extractionContext || !this.extractionCanvas) return null;

		try {
			await this.seekToTime(video, time);

			this.extractionContext.drawImage(video, 0, 0, width, this.thumbnailHeight);

			// Use JPEG for smaller data URLs
			return this.extractionCanvas.toDataURL("image/jpeg", 0.7);
		} catch {
			return null;
		}
	}

	private seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
		return new Promise((resolve, reject) => {
			// Clamp to video duration
			const clampedTime = Math.max(0, Math.min(time, video.duration || 0));

			if (Math.abs(video.currentTime - clampedTime) < 0.05) {
				resolve();
				return;
			}

			let timeout: ReturnType<typeof setTimeout>;

			const onSeeked = (): void => {
				clearTimeout(timeout);
				video.removeEventListener("seeked", onSeeked);
				// Small delay for frame to render
				setTimeout(resolve, 10);
			};

			timeout = setTimeout(() => {
				video.removeEventListener("seeked", onSeeked);
				reject(new Error("Seek timeout"));
			}, 5000);

			video.addEventListener("seeked", onSeeked);
			// eslint-disable-next-line no-param-reassign -- Intentional video element seek
			video.currentTime = clampedTime;
		});
	}

	private async getOrLoadVideo(src: string): Promise<HTMLVideoElement | null> {
		// Return cached video element
		const cached = this.videoPool.get(src);
		if (cached && cached.readyState >= 2) {
			return cached;
		}

		// Load new video
		return new Promise(resolve => {
			const video = document.createElement("video");
			video.crossOrigin = "anonymous";
			video.preload = "auto";
			video.muted = true;
			video.playsInline = true;

			let timeout: ReturnType<typeof setTimeout>;
			let cleanedUp = false;
			let cleanup: () => void;

			const onLoaded = (): void => {
				if (cleanedUp) return;
				cleanedUp = true;
				cleanup();
				this.videoPool.set(src, video);
				resolve(video);
			};

			const onError = (): void => {
				if (cleanedUp) return;
				cleanedUp = true;
				cleanup();
				resolve(null);
			};

			// Define cleanup after handlers are declared to avoid use-before-define
			cleanup = (): void => {
				clearTimeout(timeout);
				video.removeEventListener("loadeddata", onLoaded);
				video.removeEventListener("error", onError);
			};

			// Timeout fallback for streaming videos that may not fire loadeddata quickly
			timeout = setTimeout(() => {
				if (cleanedUp) return;
				cleanedUp = true;
				cleanup();
				if (video.readyState >= 2) {
					this.videoPool.set(src, video);
					resolve(video);
				} else {
					resolve(null);
				}
			}, 10000);

			video.addEventListener("loadeddata", onLoaded);
			video.addEventListener("error", onError);
			video.src = src;
			video.load();
		});
	}

	private enforceMaxCacheSize(): void {
		if (this.cache.size >= this.maxCacheSize) {
			// Remove oldest entries (first 10)
			const keys = Array.from(this.cache.keys());
			for (let i = 0; i < 10 && i < keys.length; i += 1) {
				this.cache.delete(keys[i]);
			}
		}
	}

	/** Clear cache for a specific video source */
	clearCacheForSource(videoSrc: string): void {
		for (const key of this.cache.keys()) {
			if (key.startsWith(videoSrc)) {
				this.cache.delete(key);
			}
		}
	}

	/** Clear all caches and release video elements */
	dispose(): void {
		this.cache.clear();
		this.pendingRequests.clear();

		for (const video of this.videoPool.values()) {
			video.src = "";
			video.load();
		}
		this.videoPool.clear();

		this.extractionCanvas = null;
		this.extractionContext = null;
	}
}
