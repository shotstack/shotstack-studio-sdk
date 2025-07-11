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
			if (await this.shouldUseSafariVideoLoader(loadOptions)) {
				return await this.loadVideoForSafari<TResolvedAsset>(identifier, loadOptions);
			}

			const resolvedAsset = await pixi.Assets.load<TResolvedAsset>(loadOptions, progress => {
				this.updateAssetLoadMetadata(identifier, "loading", progress);
			});
			this.updateAssetLoadMetadata(identifier, "success", 1);
			return resolvedAsset;
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
