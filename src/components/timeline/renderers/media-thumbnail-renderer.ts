/**
 * MediaThumbnailRenderer - Renders thumbnails for video and image clips
 *
 * Implements ClipRenderer interface to display visual previews in timeline clips
 * similar to professional NLE software (Premiere, DaVinci, etc.)
 *
 * - Video: Extracts frame at trim point via ThumbnailGenerator
 * - Image: Loads image directly and uses original URL
 */

import type { ResolvedClip, ImageAsset, VideoAsset } from "@schemas";

import type { ThumbnailGenerator } from "../services/thumbnail-generator";
import type { ClipRenderer } from "../timeline.types";

interface ThumbnailState {
	loading: boolean;
	thumbnails: string[];
	thumbnailWidth: number;
	failed: boolean;
}

// Track height used for calculating thumbnail dimensions
const THUMBNAIL_HEIGHT = 72;

export class MediaThumbnailRenderer implements ClipRenderer {
	private readonly generator: ThumbnailGenerator;
	private readonly onRendered: () => void;

	// Track state per clip element to avoid redundant requests
	private clipStates = new WeakMap<HTMLElement, ThumbnailState>();
	private clipRequestKeys = new WeakMap<HTMLElement, string>();

	constructor(generator: ThumbnailGenerator, onRendered: () => void = () => {}) {
		this.generator = generator;
		this.onRendered = onRendered;
	}

	render(clip: ResolvedClip, element: HTMLElement): void {
		const { asset } = clip;
		if (!asset || !("src" in asset) || !asset.src) {
			return;
		}

		if (asset.type === "video") {
			this.renderVideoThumbnail(element, asset as VideoAsset);
		} else if (asset.type === "image") {
			this.renderImageThumbnail(element, asset as ImageAsset);
		}
	}

	private renderVideoThumbnail(element: HTMLElement, asset: VideoAsset): void {
		// Create request key to detect if we need to regenerate
		const requestKey = `video|${asset.src}|${asset.trim ?? 0}`;
		if (this.shouldSkipRender(element, requestKey)) return;

		this.clipRequestKeys.set(element, requestKey);
		this.showLoadingIfNeeded(element);
		this.generateAndApplyVideo(element, asset);
	}

	private renderImageThumbnail(element: HTMLElement, asset: ImageAsset): void {
		// Create request key to detect if we need to regenerate
		const requestKey = `image|${asset.src}`;
		if (this.shouldSkipRender(element, requestKey)) return;

		this.clipRequestKeys.set(element, requestKey);
		this.showLoadingIfNeeded(element);
		this.generateAndApplyImage(element, asset);
	}

	private shouldSkipRender(element: HTMLElement, requestKey: string): boolean {
		const previousKey = this.clipRequestKeys.get(element);
		if (previousKey === requestKey) {
			const state = this.clipStates.get(element);
			// Skip if already loaded OR failed (prevents infinite retry loop)
			if (state && !state.loading && (state.thumbnails.length > 0 || state.failed)) {
				return true;
			}
		}
		return false;
	}

	private showLoadingIfNeeded(element: HTMLElement): void {
		const state = this.clipStates.get(element) ?? { loading: false, thumbnails: [], thumbnailWidth: 0, failed: false };
		if (!state.loading && state.thumbnails.length === 0 && !state.failed) {
			this.setLoadingState(element, true);
		}
	}

	private async generateAndApplyVideo(element: HTMLElement, asset: VideoAsset): Promise<void> {
		const state: ThumbnailState = { loading: true, thumbnails: [], thumbnailWidth: 0, failed: false };
		this.clipStates.set(element, state);

		try {
			const result = await this.generator.generateThumbnail(asset.src, asset.trim ?? 0);

			// Check if element is still in DOM (might have been disposed)
			if (!element.isConnected) return;

			if (result) {
				state.thumbnails = [result.dataUrl];
				state.thumbnailWidth = result.thumbnailWidth;
				this.applyThumbnail(element, result.dataUrl, result.thumbnailWidth);
			} else {
				state.failed = true;
			}
		} catch {
			// Failed to generate thumbnails - fall back to solid color
			state.failed = true;
			this.setLoadingState(element, false);
		} finally {
			state.loading = false;
			this.clipStates.set(element, state);
			this.onRendered();
		}
	}

	private async generateAndApplyImage(element: HTMLElement, asset: ImageAsset): Promise<void> {
		const state: ThumbnailState = { loading: true, thumbnails: [], thumbnailWidth: 0, failed: false };
		this.clipStates.set(element, state);

		try {
			const result = await this.loadImageThumbnail(asset.src);

			// Check if element is still in DOM (might have been disposed)
			if (!element.isConnected) return;

			if (result) {
				state.thumbnails = [result.url];
				state.thumbnailWidth = result.thumbnailWidth;
				this.applyThumbnail(element, result.url, result.thumbnailWidth);
			} else {
				state.failed = true;
			}
		} catch {
			// Failed to load image - fall back to solid color
			state.failed = true;
			this.setLoadingState(element, false);
		} finally {
			state.loading = false;
			this.clipStates.set(element, state);
			this.onRendered();
		}
	}

	private loadImageThumbnail(src: string): Promise<{ url: string; thumbnailWidth: number } | null> {
		return new Promise(resolve => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => {
				const aspectRatio = img.naturalWidth / img.naturalHeight;
				const thumbnailWidth = Math.round(THUMBNAIL_HEIGHT * aspectRatio);
				resolve({ url: src, thumbnailWidth });
			};
			img.onerror = () => resolve(null);
			img.src = src;
		});
	}

	private applyThumbnail(el: HTMLElement, url: string, thumbnailWidth: number): void {
		el.classList.add("ss-clip--thumbnails");
		this.setLoadingState(el, false);

		// Single thumbnail with CSS repeat-x tiles across clip width
		// eslint-disable-next-line no-param-reassign -- Intentional DOM styling
		el.style.backgroundImage = `url("${url}")`;
		// eslint-disable-next-line no-param-reassign -- Intentional DOM styling
		el.style.backgroundSize = `${thumbnailWidth}px 100%`;
		// eslint-disable-next-line no-param-reassign -- Intentional DOM styling
		el.style.backgroundRepeat = "repeat-x";
		// eslint-disable-next-line no-param-reassign -- Intentional DOM styling
		el.style.backgroundPosition = "left center";
	}

	private setLoadingState(element: HTMLElement, loading: boolean): void {
		element.classList.toggle("ss-clip--loading-thumbnails", loading);
	}

	dispose(el: HTMLElement): void {
		// Clean up state
		this.clipStates.delete(el);
		this.clipRequestKeys.delete(el);

		// Remove thumbnail styles
		el.classList.remove("ss-clip--thumbnails", "ss-clip--loading-thumbnails");
		// eslint-disable-next-line no-param-reassign -- Intentional DOM cleanup
		el.style.backgroundImage = "";
		// eslint-disable-next-line no-param-reassign -- Intentional DOM cleanup
		el.style.backgroundPosition = "";
		// eslint-disable-next-line no-param-reassign -- Intentional DOM cleanup
		el.style.backgroundSize = "";
		// eslint-disable-next-line no-param-reassign -- Intentional DOM cleanup
		el.style.backgroundRepeat = "";
	}
}
