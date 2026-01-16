import type { TrackState, ClipState, ClipRenderer } from "../../timeline.types";
import { getTrackHeight } from "../../timeline.types";

import { TrackComponent } from "./track-component";

export interface TrackListOptions {
	showBadges: boolean;
	onClipSelect: (trackIndex: number, clipIndex: number, addToSelection: boolean) => void;
	getClipRenderer: (type: string) => ClipRenderer | undefined;
	/** Get error state for a clip (if asset failed to load) */
	getClipError?: (trackIndex: number, clipIndex: number) => { error: string; assetType: string } | null;
	/** Check if content clip has an attached luma */
	hasAttachedLuma?: (trackIndex: number, clipIndex: number) => boolean;
	/** Find attached luma for a content clip via timing match */
	findAttachedLuma?: (trackIndex: number, clipIndex: number) => { trackIndex: number; clipIndex: number } | null;
	/** Callback when mask badge is clicked on a content clip */
	onMaskClick?: (contentTrackIndex: number, contentClipIndex: number) => void;
	/** Check if attached luma is currently visible for editing */
	isLumaVisibleForEditing?: (contentTrackIndex: number, contentClipIndex: number) => boolean;
	/** Find the content clip that a luma is attached to via timing match */
	findContentForLuma?: (lumaTrack: number, lumaClip: number) => { trackIndex: number; clipIndex: number } | null;
}

/** Container for all track components with virtualization support */
export class TrackListComponent {
	public readonly element: HTMLElement;
	public readonly contentElement: HTMLElement;
	private readonly trackComponents: TrackComponent[] = [];
	private readonly options: TrackListOptions;

	// Current state for draw
	private currentTracks: TrackState[] = [];
	private currentTimelineWidth = 0;
	private currentPixelsPerSecond = 50;
	private needsUpdate = true;

	// Scroll sync callback
	private onScroll?: (scrollX: number, scrollY: number) => void;

	constructor(options: TrackListOptions) {
		this.element = document.createElement("div");
		this.element.className = "ss-timeline-tracks";
		this.options = options;
		this.contentElement = this.buildElement();
	}

	private buildElement(): HTMLElement {
		this.element.tabIndex = 0; // Make focusable for keyboard events

		const content = document.createElement("div");
		content.className = "ss-tracks-content";
		this.element.appendChild(content);

		// Set up scroll event
		this.element.addEventListener("scroll", () => {
			this.onScroll?.(this.element.scrollLeft, this.element.scrollTop);
		});

		return content;
	}

	public draw(): void {
		if (!this.needsUpdate) {
			return; // Nothing changed, skip entirely
		}
		this.needsUpdate = false;

		const tracks = this.currentTracks;
		const pixelsPerSecond = this.currentPixelsPerSecond;

		// Set content width for scrolling
		this.contentElement.style.width = `${this.currentTimelineWidth}px`;

		// Add/remove track components as needed
		while (this.trackComponents.length < tracks.length) {
			const trackIndex = this.trackComponents.length;
			const trackComponent = new TrackComponent(trackIndex, {
				showBadges: this.options.showBadges,
				onClipSelect: this.options.onClipSelect,
				getClipRenderer: this.options.getClipRenderer,
				getClipError: this.options.getClipError,
				hasAttachedLuma: this.options.hasAttachedLuma,
				findAttachedLuma: this.options.findAttachedLuma,
				onMaskClick: this.options.onMaskClick,
				isLumaVisibleForEditing: this.options.isLumaVisibleForEditing,
				findContentForLuma: this.options.findContentForLuma
			});
			this.trackComponents.push(trackComponent);
			this.contentElement.appendChild(trackComponent.element);
		}

		while (this.trackComponents.length > tracks.length) {
			const trackComponent = this.trackComponents.pop();
			trackComponent?.dispose();
		}

		// Update each track and draw
		tracks.forEach((track, index) => {
			this.trackComponents[index].updateTrack(track, pixelsPerSecond);
			this.trackComponents[index].draw();
		});
	}

	public dispose(): void {
		for (const track of this.trackComponents) {
			track.dispose();
		}
		this.trackComponents.length = 0;
		this.element.remove();
	}

	public setScrollHandler(handler: (scrollX: number, scrollY: number) => void): void {
		this.onScroll = handler;
	}

	/** Update track list state and mark for re-render */
	public updateTracks(tracks: TrackState[], timelineWidth: number, pixelsPerSecond: number): void {
		this.currentTracks = tracks;
		this.currentTimelineWidth = timelineWidth;
		this.currentPixelsPerSecond = pixelsPerSecond;
		this.needsUpdate = true;
	}

	public getTrackComponent(trackIndex: number): TrackComponent | undefined {
		return this.trackComponents[trackIndex];
	}

	public findClipAtPosition(x: number, y: number, _trackHeight: number, pixelsPerSecond: number): ClipState | null {
		const scrollY = this.element.scrollTop;
		const relativeY = y + scrollY;

		// Find track at y position using variable heights
		let currentY = 0;
		let trackIndex = -1;
		for (let i = 0; i < this.trackComponents.length; i += 1) {
			const track = this.trackComponents[i].getCurrentTrack();
			const height = getTrackHeight(track?.primaryAssetType ?? "default");

			if (relativeY >= currentY && relativeY < currentY + height) {
				trackIndex = i;
				break;
			}
			currentY += height;
		}

		if (trackIndex < 0 || trackIndex >= this.trackComponents.length) {
			return null;
		}

		const scrollX = this.element.scrollLeft;
		const relativeX = x + scrollX;

		return this.trackComponents[trackIndex].getClipAtPosition(relativeX, pixelsPerSecond);
	}

	/** Get the track index at a given y position */
	public getTrackIndexAtY(y: number): number {
		const scrollY = this.element.scrollTop;
		const relativeY = y + scrollY;

		let currentY = 0;
		for (let i = 0; i < this.trackComponents.length; i += 1) {
			const track = this.trackComponents[i].getCurrentTrack();
			const height = getTrackHeight(track?.primaryAssetType ?? "default");

			if (relativeY >= currentY && relativeY < currentY + height) {
				return i;
			}
			currentY += height;
		}
		return -1;
	}

	/** Get the Y position of a track by index */
	public getTrackYPosition(trackIndex: number): number {
		let y = 0;
		for (let i = 0; i < trackIndex && i < this.trackComponents.length; i += 1) {
			const track = this.trackComponents[i].getCurrentTrack();
			y += getTrackHeight(track?.primaryAssetType ?? "default");
		}
		return y;
	}

	public getScrollPosition(): { scrollX: number; scrollY: number } {
		return {
			scrollX: this.element.scrollLeft,
			scrollY: this.element.scrollTop
		};
	}

	public setScrollPosition(scrollX: number, scrollY: number): void {
		this.element.scrollLeft = scrollX;
		this.element.scrollTop = scrollY;
	}
}
