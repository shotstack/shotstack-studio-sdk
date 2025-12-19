/**
 * VideoThumbnailRenderer - Renders video frame thumbnails in timeline clips
 *
 * Implements ClipRenderer interface to display video frame strips
 * similar to professional NLE software (Premiere, DaVinci, etc.)
 */

import type { ResolvedClip } from "@schemas/clip";
import type { VideoAsset } from "@schemas/video-asset";
import type { ClipRenderer } from "../timeline.types";
import type { ThumbnailGenerator } from "../services/thumbnail-generator";

interface ThumbnailState {
	loading: boolean;
	thumbnails: string[];
	thumbnailWidth: number;
}

export class VideoThumbnailRenderer implements ClipRenderer {
	private readonly generator: ThumbnailGenerator;
	private readonly onRendered: () => void;

	// Track state per clip element to avoid redundant requests
	private clipStates = new WeakMap<HTMLElement, ThumbnailState>();
	private clipRequestKeys = new WeakMap<HTMLElement, string>();

	constructor(
		generator: ThumbnailGenerator,
		onRendered: () => void = () => {}
	) {
		this.generator = generator;
		this.onRendered = onRendered;
	}

	render(clip: ResolvedClip, element: HTMLElement): void {
		const asset = clip.asset as VideoAsset;
		if (!asset || asset.type !== "video" || !asset.src) {
			return;
		}

		// Create request key to detect if we need to regenerate
		const requestKey = `${asset.src}|${asset.trim ?? 0}`;
		const previousKey = this.clipRequestKeys.get(element);

		// Skip if already rendered with same parameters
		if (previousKey === requestKey) {
			const state = this.clipStates.get(element);
			if (state && !state.loading && state.thumbnails.length > 0) {
				return;
			}
		}

		this.clipRequestKeys.set(element, requestKey);

		// Show loading state
		const state = this.clipStates.get(element) ?? { loading: false, thumbnails: [], thumbnailWidth: 0 };
		if (!state.loading && state.thumbnails.length === 0) {
			this.setLoadingState(element, true);
		}

		// Start async thumbnail generation
		this.generateAndApply(element, asset);
	}

	private async generateAndApply(
		element: HTMLElement,
		asset: VideoAsset
	): Promise<void> {
		const state: ThumbnailState = { loading: true, thumbnails: [], thumbnailWidth: 0 };
		this.clipStates.set(element, state);

		try {
			const result = await this.generator.generateThumbnail(
				asset.src,
				asset.trim ?? 0
			);

			// Check if element is still in DOM (might have been disposed)
			if (!element.isConnected) return;

			if (result) {
				state.thumbnails = [result.dataUrl];
				state.thumbnailWidth = result.thumbnailWidth;
				this.applyThumbnail(element, result.dataUrl, result.thumbnailWidth);
			}
		} catch {
			// Failed to generate thumbnails - fall back to solid color
			this.setLoadingState(element, false);
		} finally {
			state.loading = false;
			this.clipStates.set(element, state);
			this.onRendered();
		}
	}

	private applyThumbnail(element: HTMLElement, dataUrl: string, thumbnailWidth: number): void {
		element.classList.add("ss-clip--thumbnails");
		this.setLoadingState(element, false);

		// Single thumbnail with CSS repeat-x tiles across clip width
		element.style.backgroundImage = `url("${dataUrl}")`;
		element.style.backgroundSize = `${thumbnailWidth}px 100%`;
		element.style.backgroundRepeat = "repeat-x";
		element.style.backgroundPosition = "left center";
	}

	private setLoadingState(element: HTMLElement, loading: boolean): void {
		element.classList.toggle("ss-clip--loading-thumbnails", loading);
	}

	dispose(element: HTMLElement): void {
		// Clean up state
		this.clipStates.delete(element);
		this.clipRequestKeys.delete(element);

		// Remove thumbnail styles
		element.classList.remove("ss-clip--thumbnails", "ss-clip--loading-thumbnails");
		element.style.backgroundImage = "";
		element.style.backgroundPosition = "";
		element.style.backgroundSize = "";
		element.style.backgroundRepeat = "";
	}
}
