import * as pixi from "pixi.js";

import { AssetLoadTracker, type AssetLoadInfoStatus } from "../events/asset-load-tracker";

export class AssetLoader {
	private static readonly VIDEO_EXTENSIONS = [".mp4", ".m4v", ".webm", ".ogg", ".ogv"];
	private static readonly VIDEO_MIME: Record<string, string> = {
		".mp4": "video/mp4",
		".m4v": "video/mp4",
		".webm": "video/webm",
		".ogg": "video/ogg",
		".ogv": "video/ogg"
	};
	public readonly loadTracker = new AssetLoadTracker();

	public async load<TResolvedAsset>(identifier: string, loadOptions: pixi.UnresolvedAsset): Promise<TResolvedAsset | null> {
		this.updateAssetLoadMetadata(identifier, "pending", 0);

		try {
			const url = this.extractUrl(loadOptions);

			if (url && (await this.isPlayableVideo(url))) {
				const texture = await this.loadVideoTexture(identifier, url, loadOptions);
				this.updateAssetLoadMetadata(identifier, "success", 1);
				return texture as TResolvedAsset;
			}

			const resolvedAsset = await pixi.Assets.load<TResolvedAsset>(loadOptions, progress => {
				this.updateAssetLoadMetadata(identifier, "loading", progress);
			});
			this.updateAssetLoadMetadata(identifier, "success", 1);
			return resolvedAsset;
		} catch {
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

	private async loadVideoTexture(identifier: string, url: string, loadOptions: pixi.UnresolvedAsset): Promise<pixi.Texture> {
		const data = typeof loadOptions === "object" ? (loadOptions.data ?? {}) : {};

		return new Promise((resolve, reject) => {
			const video = document.createElement("video");

			video.crossOrigin = "anonymous";
			video.playsInline = true;
			video.preload = "metadata";

			const timeoutId = setTimeout(() => reject(new Error("Video loading timeout")), 10000);
			const cleanup = () => clearTimeout(timeoutId);

			const onLoadedMetadata = () => {
				cleanup();
				if (video.readyState >= 1) {
					try {
						const source = new pixi.VideoSource({
							resource: video,
							...data
						});
						resolve(new pixi.Texture({ source }));
					} catch (error) {
						reject(error);
					}
				}
			};

			video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
			video.addEventListener(
				"error",
				() => {
					cleanup();
					reject(new Error("Video loading failed"));
				},
				{ once: true }
			);

			this.updateAssetLoadMetadata(identifier, "loading", 0.5);
			video.src = url;
		});
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
