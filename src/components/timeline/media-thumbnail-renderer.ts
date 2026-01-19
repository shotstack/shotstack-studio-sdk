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

import type { ThumbnailGenerator } from "./thumbnail-generator";
import type { ClipRenderer } from "./timeline.types";

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

	// Track state per clip identity (src|trim|start) - NOT by element reference
	// This prevents state aliasing when elements are recycled or clips move
	private clipStates = new Map<string, ThumbnailState>();

	private appliedToElement = new WeakMap<HTMLElement, string>();

	constructor(generator: ThumbnailGenerator, onRendered: () => void = () => {}) {
		this.generator = generator;
		this.onRendered = onRendered;
	}

	/**
	 * Generate stable clip key from content identity.
	 * Key is based on asset source, trim point, and clip start time.
	 */
	private getClipKey(clip: ResolvedClip): string {
		const asset = clip.asset as { src?: string; trim?: number; type?: string };
		return `${asset?.type ?? "unknown"}|${asset?.src ?? "none"}|${asset?.trim ?? 0}|${clip.start}`;
	}

	render(clip: ResolvedClip, element: HTMLElement): void {
		const { asset } = clip;
		const clipKey = this.getClipKey(clip);

		if (this.appliedToElement.get(element) === clipKey) {
			return;
		}

		this.clearThumbnailStyles(element);

		if (!asset || !("src" in asset) || !asset.src) {
			this.appliedToElement.set(element, clipKey);
			return;
		}

		if (asset.type === "video") {
			this.renderVideoThumbnail(element, asset as VideoAsset, clipKey);
		} else if (asset.type === "image") {
			this.renderImageThumbnail(element, asset as ImageAsset, clipKey);
		} else {
			this.appliedToElement.set(element, clipKey);
		}
	}

	private clearThumbnailStyles(el: HTMLElement): void {
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

	private renderVideoThumbnail(element: HTMLElement, asset: VideoAsset, clipKey: string): void {
		// Check if we already have cached state for this clip
		const cachedState = this.clipStates.get(clipKey);
		if (cachedState && !cachedState.loading && (cachedState.thumbnails.length > 0 || cachedState.failed)) {
			// Apply cached thumbnail to element (may be a new element for same clip)
			if (cachedState.thumbnails.length > 0) {
				this.applyThumbnail(element, cachedState.thumbnails[0], cachedState.thumbnailWidth);
			}
			this.appliedToElement.set(element, clipKey);
			return;
		}

		this.showLoadingIfNeeded(element, clipKey);
		this.generateAndApplyVideo(element, asset, clipKey);
	}

	private renderImageThumbnail(element: HTMLElement, asset: ImageAsset, clipKey: string): void {
		// Check if we already have cached state for this clip
		const cachedState = this.clipStates.get(clipKey);
		if (cachedState && !cachedState.loading && (cachedState.thumbnails.length > 0 || cachedState.failed)) {
			// Apply cached thumbnail to element (may be a new element for same clip)
			if (cachedState.thumbnails.length > 0) {
				this.applyThumbnail(element, cachedState.thumbnails[0], cachedState.thumbnailWidth);
			}
			this.appliedToElement.set(element, clipKey);
			return;
		}

		this.showLoadingIfNeeded(element, clipKey);
		this.generateAndApplyImage(element, asset, clipKey);
	}

	private showLoadingIfNeeded(element: HTMLElement, clipKey: string): void {
		const state = this.clipStates.get(clipKey) ?? { loading: false, thumbnails: [], thumbnailWidth: 0, failed: false };
		if (!state.loading && state.thumbnails.length === 0 && !state.failed) {
			this.setLoadingState(element, true);
		}
	}

	private async generateAndApplyVideo(element: HTMLElement, asset: VideoAsset, clipKey: string): Promise<void> {
		const state: ThumbnailState = { loading: true, thumbnails: [], thumbnailWidth: 0, failed: false };
		this.clipStates.set(clipKey, state);

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
			this.clipStates.set(clipKey, state);
			this.appliedToElement.set(element, clipKey);
			this.onRendered();
		}
	}

	private async generateAndApplyImage(element: HTMLElement, asset: ImageAsset, clipKey: string): Promise<void> {
		const state: ThumbnailState = { loading: true, thumbnails: [], thumbnailWidth: 0, failed: false };
		this.clipStates.set(clipKey, state);

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
			this.clipStates.set(clipKey, state);
			this.appliedToElement.set(element, clipKey);
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
		// Note: We keep clipStates cached - keyed by clip identity, not element.
		// This allows reuse when same clip gets a new element after move/transform.
		this.clearThumbnailStyles(el);
		this.appliedToElement.delete(el);
	}

	/** Clear all cached thumbnail state */
	clearCache(): void {
		this.clipStates.clear();
	}
}
