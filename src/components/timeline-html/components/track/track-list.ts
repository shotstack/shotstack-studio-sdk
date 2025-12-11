import { TimelineEntity } from "../../core/timeline-entity";
import type { TrackState, ClipState, ClipRenderer } from "../../html-timeline.types";
import { getTrackHeight } from "../../html-timeline.types";
import { TrackComponent } from "./track-component";

export interface TrackListOptions {
	showBadges: boolean;
	onClipSelect: (trackIndex: number, clipIndex: number, addToSelection: boolean) => void;
	getClipRenderer: (type: string) => ClipRenderer | undefined;
}

/** Container for all track components with virtualization support */
export class TrackListComponent extends TimelineEntity {
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
		super("div", "ss-timeline-tracks");
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

	public async load(): Promise<void> {
		await this.loadChildren();
	}

	public update(_deltaTime: number, _elapsed: number): void {
		this.updateChildren(_deltaTime, _elapsed);
	}

	public draw(): void {
		if (!this.needsUpdate) {
			// Still need to draw track components even when data hasn't changed
			for (const trackComponent of this.trackComponents) {
				trackComponent.draw();
			}
			this.drawChildren();
			return;
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
				getClipRenderer: this.options.getClipRenderer
			});
			this.trackComponents.push(trackComponent);
			this.contentElement.appendChild(trackComponent.element);
		}

		while (this.trackComponents.length > tracks.length) {
			const trackComponent = this.trackComponents.pop();
			trackComponent?.dispose();
		}

		// Update each track and draw (tracks are not in children array)
		tracks.forEach((track, index) => {
			this.trackComponents[index].updateTrack(track, pixelsPerSecond);
			this.trackComponents[index].draw();
		});

		this.drawChildren();
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
		for (let i = 0; i < this.trackComponents.length; i++) {
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
		for (let i = 0; i < this.trackComponents.length; i++) {
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
		for (let i = 0; i < trackIndex && i < this.trackComponents.length; i++) {
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
