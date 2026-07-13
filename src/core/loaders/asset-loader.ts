import * as pixi from "pixi.js";

import { AssetLoadTracker, type AssetLoadInfoStatus } from "../events/asset-load-tracker";

import { GifImageSource } from "./gif-image-source";
import { appendCorsQuery, isGifUrl } from "./gif-url";

export interface GifThumbnail {
	readonly isGif: boolean;
	readonly dataUrl: string | null;
	readonly width: number;
	readonly height: number;
}

export class AssetLoader {
	private static readonly GIF_DETECTION_TIMEOUT_MS = 5_000;
	private static readonly VIDEO_EXTENSIONS = [".mp4", ".m4v", ".webm", ".ogg", ".ogv"];
	private static readonly VIDEO_MIME: Record<string, string> = {
		".mp4": "video/mp4",
		".m4v": "video/mp4",
		".webm": "video/webm",
		".ogg": "video/ogg",
		".ogv": "video/ogg"
	};
	public readonly loadTracker = new AssetLoadTracker();

	/** Reference counts for loaded assets - prevents premature unloading during transforms */
	private refCounts = new Map<string, number>();
	private gifDetections = new Map<string, Promise<boolean>>();
	private gifSources = new Map<string, Promise<GifImageSource>>();

	/**
	 * Increment reference count for an asset.
	 * Called when a player starts loading an asset.
	 */
	public incrementRef(src: string): void {
		this.refCounts.set(src, (this.refCounts.get(src) ?? 0) + 1);
	}

	/**
	 * Decrement reference count for an asset.
	 * @returns true if asset can be safely unloaded (count reached zero)
	 */
	public decrementRef(src: string): boolean {
		const count = this.refCounts.get(src);
		if (!count) return false;
		if (count === 1) {
			this.refCounts.delete(src);
			return true; // Safe to unload
		}
		this.refCounts.set(src, count - 1);
		return false; // Still in use
	}

	/** Release a cached asset once its final Player reference is disposed. */
	public release(identifier: string): void {
		if (!this.decrementRef(identifier)) return;

		const gifSource = this.gifSources.get(identifier);
		if (gifSource) {
			this.gifSources.delete(identifier);
			gifSource.then(source => source.destroy()).catch(() => undefined);
		}
		this.gifDetections.delete(identifier);

		if (pixi.Assets.cache.has(identifier)) {
			pixi.Assets.unload(identifier);
		}
	}

	constructor() {
		pixi.Assets.setPreferences({ crossOrigin: "anonymous" });
	}

	/**
	 * Release an asset that was loaded successfully but rejected by the caller
	 * (e.g. returned a non-image texture). Decrements the ref count and removes
	 * the stale entry from the PixiJS Assets cache to prevent GL corruption.
	 */
	public async rejectAsset(identifier: string): Promise<void> {
		console.warn(`[AssetLoader.rejectAsset] Rejected invalid asset "${identifier}".`);
		await this.cleanupFailedLoad(identifier);
	}

	public async load<TResolvedAsset>(identifier: string, loadOptions: pixi.UnresolvedAsset): Promise<TResolvedAsset | null> {
		this.updateAssetLoadMetadata(identifier, "pending", 0);
		this.incrementRef(identifier);

		try {
			const useSafari = await this.shouldUseSafariVideoLoader(loadOptions);

			const resolvedAsset = useSafari
				? await this.loadVideoForSafari<TResolvedAsset>(identifier, loadOptions)
				: await pixi.Assets.load<TResolvedAsset>(loadOptions, progress => {
						this.updateAssetLoadMetadata(identifier, "loading", progress);
					});

			if (resolvedAsset == null) {
				console.warn(`[AssetLoader.load] Empty asset returned for "${identifier}"`);
				this.updateAssetLoadMetadata(identifier, "failed", 1);
				await this.cleanupFailedLoad(identifier);
				return null;
			}

			this.updateAssetLoadMetadata(identifier, "success", 1);
			return resolvedAsset;
		} catch (error) {
			console.warn(`[AssetLoader.load] Failed to load "${identifier}":`, error);
			this.updateAssetLoadMetadata(identifier, "failed", 1);
			await this.cleanupFailedLoad(identifier);
			return null;
		}
	}

	/** Detect GIFs without relying on Pixi's suffix-only parser selection. */
	public isGif(identifier: string, requestUrl: string = appendCorsQuery(identifier)): Promise<boolean> {
		const cached = this.gifDetections.get(identifier);
		if (cached) return cached;

		const detection = isGifUrl(identifier) ? Promise.resolve(true) : this.hasGifMagic(requestUrl);

		this.gifDetections.set(identifier, detection);
		detection.catch(() => {
			if (this.gifDetections.get(identifier) === detection) this.gifDetections.delete(identifier);
		});
		return detection;
	}

	private async hasGifMagic(requestUrl: string): Promise<boolean> {
		let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
		try {
			const response = await fetch(requestUrl, {
				headers: { Range: "bytes=0-5" },
				signal: AbortSignal.timeout(AssetLoader.GIF_DETECTION_TIMEOUT_MS)
			});
			if (!response.ok) {
				await response.body?.cancel().catch(() => undefined);
				throw new Error(`Unable to inspect image source (${response.status}).`);
			}
			if (!response.body) throw new Error("Image response body is not available as a readable stream.");
			reader = response.body.getReader();
			const signature = new Uint8Array(6);
			let offset = 0;
			while (offset < signature.length) {
				const { done, value } = await reader.read();
				if (done || !value) break;
				const length = Math.min(value.byteLength, signature.length - offset);
				signature.set(value.subarray(0, length), offset);
				offset += length;
			}

			if (offset !== signature.length) throw new Error("Image response ended before its signature could be inspected.");
			const value = String.fromCharCode(...signature);
			return value === "GIF87a" || value === "GIF89a";
		} finally {
			if (reader) {
				await reader.cancel().catch(() => undefined);
				reader.releaseLock();
			}
		}
	}

	/** Load and share an eagerly decoded GIF source across clips using the same URL. */
	public async loadGif(identifier: string, requestUrl: string = appendCorsQuery(identifier)): Promise<GifImageSource | null> {
		this.updateAssetLoadMetadata(identifier, "pending", 0);
		this.incrementRef(identifier);

		let sourcePromise = this.gifSources.get(identifier);
		if (!sourcePromise) {
			sourcePromise = GifImageSource.fetch(requestUrl);
			this.gifSources.set(identifier, sourcePromise);
		}

		try {
			this.updateAssetLoadMetadata(identifier, "loading", 0.5);
			const source = await sourcePromise;
			this.updateAssetLoadMetadata(identifier, "success", 1);
			return source;
		} catch (error) {
			console.warn(`[AssetLoader.loadGif] Failed to load "${identifier}":`, error);
			this.updateAssetLoadMetadata(identifier, "failed", 1);
			this.release(identifier);
			return null;
		}
	}

	/** Return the decoded first GIF frame for a non-animating timeline thumbnail. */
	public async getGifThumbnail(identifier: string): Promise<GifThumbnail> {
		const isGif = await this.isGif(identifier);
		if (!isGif) return { isGif: false, dataUrl: null, width: 0, height: 0 };

		const source = await this.loadGif(identifier);
		if (!source) return { isGif: true, dataUrl: null, width: 0, height: 0 };
		try {
			return {
				isGif: true,
				dataUrl: source.getFirstFrameDataUrl(),
				width: source.width,
				height: source.height
			};
		} finally {
			// The timeline only retains the generated PNG; the Player owns the decoded source.
			this.release(identifier);
		}
	}

	/**
	 * Load a video with a unique HTMLVideoElement (not cached).
	 * Each call creates an independent video element, allowing multiple VideoPlayers
	 * to control playback independently even when using the same video URL.
	 */
	public async loadVideoUnique(identifier: string, loadOptions: pixi.UnresolvedAsset): Promise<pixi.Texture<pixi.VideoSource> | null> {
		this.updateAssetLoadMetadata(identifier, "pending", 0);
		// Note: Don't increment ref count - each unique video manages its own lifecycle

		try {
			const url = this.extractUrl(loadOptions);
			if (!url) {
				throw new Error("No URL provided for video loading");
			}

			const data = typeof loadOptions === "object" ? (loadOptions.data ?? {}) : {};

			const texture = await new Promise<pixi.Texture<pixi.VideoSource>>((resolve, reject) => {
				const video = document.createElement("video");
				video.crossOrigin = "anonymous";
				video.playsInline = true;
				video.muted = data.muted ?? false;
				video.preload = "auto"; // Preload for smooth seeking

				video.addEventListener(
					"loadedmetadata",
					() => {
						try {
							const source = new pixi.VideoSource({
								resource: video,
								autoPlay: data.autoPlay ?? false,
								...data
							});
							resolve(new pixi.Texture({ source }));
						} catch (error) {
							reject(error);
						}
					},
					{ once: true }
				);

				video.addEventListener("error", () => reject(new Error("Video loading failed")), { once: true });

				this.updateAssetLoadMetadata(identifier, "loading", 0.5);
				video.src = url;
			});

			this.updateAssetLoadMetadata(identifier, "success", 1);
			return texture;
		} catch (_error) {
			this.updateAssetLoadMetadata(identifier, "failed", 1);
			return null;
		}
	}

	public getProgress(): number {
		const identifiers = Object.keys(this.loadTracker.registry);
		if (identifiers.length === 0) return 0;

		const totalProgress = identifiers.reduce((acc, identifier) => acc + this.loadTracker.registry[identifier].progress, 0);
		return totalProgress / identifiers.length;
	}

	private async cleanupFailedLoad(identifier: string): Promise<void> {
		const cached = pixi.Assets.cache.has(identifier);
		this.release(identifier);
		if (!cached) {
			try {
				await pixi.Assets.unload(identifier);
			} catch {
				// Ignore unload errors for assets that never reached the cache.
			}
		}
	}

	private extractUrl(opts: pixi.UnresolvedAsset): string | undefined {
		if (typeof opts === "string") return opts;
		const src = Array.isArray(opts.src) ? opts.src[0] : opts.src;
		return typeof src === "string" ? src : src?.src;
	}

	private hasVideoExtension(url: string): boolean {
		const urlPath = new URL(url, window.location.origin).pathname.toLowerCase();
		return AssetLoader.VIDEO_EXTENSIONS.some(ext => urlPath.endsWith(ext));
	}

	private async getContentType(url: string): Promise<string | null> {
		try {
			const response = await fetch(url, { method: "HEAD" });
			return response.headers.get("content-type");
		} catch {
			return null;
		}
	}

	private canPlayVideo(url: string): boolean {
		const urlPath = new URL(url, window.location.origin).pathname.toLowerCase();
		const ext = urlPath.slice(urlPath.lastIndexOf("."));
		const mime = AssetLoader.VIDEO_MIME[ext];
		return mime ? document.createElement("video").canPlayType(mime) !== "" : false;
	}

	private async isPlayableVideo(url: string): Promise<boolean> {
		if (this.hasVideoExtension(url)) return this.canPlayVideo(url);

		const contentType = await this.getContentType(url);
		return contentType?.startsWith("video/") ? document.createElement("video").canPlayType(contentType) !== "" : false;
	}

	private async shouldUseSafariVideoLoader(loadOptions: pixi.UnresolvedAsset): Promise<boolean> {
		const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
		const url = this.extractUrl(loadOptions);
		return isSafariBrowser && url !== undefined && (await this.isPlayableVideo(url));
	}

	private async loadVideoForSafari<TResolvedAsset>(identifier: string, loadOptions: pixi.UnresolvedAsset): Promise<TResolvedAsset> {
		const url = this.extractUrl(loadOptions)!;
		const data = typeof loadOptions === "object" ? (loadOptions.data ?? {}) : {};

		const texture = await new Promise<pixi.Texture>((resolve, reject) => {
			const video = document.createElement("video");

			// Essential Safari video attributes
			video.crossOrigin = "anonymous";
			video.playsInline = true;
			video.muted = true;
			video.preload = "metadata";

			video.addEventListener(
				"loadedmetadata",
				() => {
					try {
						const source = new pixi.VideoSource({
							resource: video,
							autoPlay: data.autoPlay ?? false,
							...data
						});
						resolve(new pixi.Texture({ source }));
					} catch (error) {
						reject(error);
					}
				},
				{ once: true }
			);

			video.addEventListener("error", () => reject(new Error("Video loading failed")), { once: true });

			this.updateAssetLoadMetadata(identifier, "loading", 0.5);
			video.src = url;
		});

		this.updateAssetLoadMetadata(identifier, "success", 1);
		return texture as TResolvedAsset;
	}

	private updateAssetLoadMetadata(identifier: string, status: AssetLoadInfoStatus, progress: number): void {
		if (!this.loadTracker.registry[identifier]) {
			this.loadTracker.registry[identifier] = { progress, status };
		} else {
			this.loadTracker.registry[identifier].progress = progress;
			this.loadTracker.registry[identifier].status = status;
		}

		const assetLoadStatusRegistry = { ...this.loadTracker.registry };
		this.loadTracker.emit("onAssetLoadInfoUpdated", { registry: assetLoadStatusRegistry });
	}
}
