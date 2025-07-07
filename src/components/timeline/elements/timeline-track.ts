import { Edit } from "@core/edit";
import { Entity } from "@shared/entity";
import { TIMELINE_CONFIG } from "@timeline/timeline-config";
import type { TimelineTrackData } from "@timeline/timeline-types";
import * as pixi from "pixi.js";

import { TimelineClip } from "./timeline-clip";

export class TimelineTrack extends Entity {
	private edit: Edit;
	private trackData: TimelineTrackData;
	private width: number;
	private height: number;
	private scrollPosition: number;
	private pixelsPerSecond: number;
	private selectedClipId: string | null;
	private trackIndex: number;

	private background: pixi.Graphics | null;
	private clips: TimelineClip[];

	constructor(
		edit: Edit,
		trackData: TimelineTrackData,
		width: number,
		height: number,
		scrollPosition: number,
		pixelsPerSecond: number,
		selectedClipId: string | null,
		trackIndex: number
	) {
		super();
		this.edit = edit;
		this.trackData = trackData;
		this.width = width;
		this.height = height;
		this.scrollPosition = scrollPosition;
		this.pixelsPerSecond = pixelsPerSecond;
		this.selectedClipId = selectedClipId;
		this.trackIndex = trackIndex;

		this.background = null;
		this.clips = [];
	}

	public override async load(): Promise<void> {
		this.background = new pixi.Graphics();
		this.getContainer().addChild(this.background);

		this.draw();
		this.createClips();
	}

	public override update(deltaTime: number, elapsed: number): void {
		// Update clips
		for (const clip of this.clips) {
			clip.update(deltaTime, elapsed);
		}
	}

	public override draw(): void {
		if (!this.background) return;

		this.background.clear();

		// Create track background
		this.background.fillStyle = { color: TIMELINE_CONFIG.colors.track };
		this.background.rect(0, 0, this.width, this.height);
		this.background.fill();

		// Add track separator line
		this.background.strokeStyle = { color: TIMELINE_CONFIG.colors.separator, width: 1 };
		this.background.moveTo(0, this.height);
		this.background.lineTo(this.width, this.height);
		this.background.stroke();
	}

	public override dispose(): void {
		// Remove event listeners first to prevent memory leaks
		this.getContainer().removeAllListeners();
		this.getContainer().eventMode = "none";

		// Dispose clips properly
		this.clearClips();

		// Dispose of PIXI objects with proper cleanup
		if (this.background) {
			if (this.background.parent) {
				this.background.parent.removeChild(this.background);
			}
			this.background.destroy({ children: true });
			this.background = null;
		}
	}

	// Public methods for timeline control
	public updateScrollPosition(scrollPosition: number): void {
		this.scrollPosition = scrollPosition;
		this.updateClipPositions();
	}

	public updatePixelsPerSecond(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.updateClipPositions();
	}

	public updateSelectedClipId(selectedClipId: string | null): void {
		this.selectedClipId = selectedClipId;
		this.updateClipSelection();
	}

	private createClips(): void {
		// Clear existing clips
		this.clearClips();

		// Create clips for this track
		for (let clipIndex = 0; clipIndex < this.trackData.clips.length; clipIndex += 1) {
			const clipData = this.trackData.clips[clipIndex];
			const clip = new TimelineClip(
				clipData,
				this.height - 4, // Track height minus padding
				this.scrollPosition,
				this.pixelsPerSecond,
				this.selectedClipId,
				this.trackIndex,
				clipIndex
			);

			// Set up clip event handling
			clip.onClipClick = (trackIdx, clipIdx, event) => {
				this.handleClipClick(trackIdx, clipIdx, event);
			};

			this.clips.push(clip);
			this.getContainer().addChild(clip.getContainer());

			// Load the clip
			clip.load();
		}
	}

	private clearClips(): void {
		// Dispose clips in reverse order to avoid index issues
		for (let i = this.clips.length - 1; i >= 0; i -= 1) {
			const clip = this.clips[i];
			if (clip.getContainer().parent) {
				clip.getContainer().parent.removeChild(clip.getContainer());
			}
			clip.dispose();
		}
		this.clips.length = 0; // Clear array efficiently
	}

	private updateClipPositions(): void {
		for (const clip of this.clips) {
			clip.updateScrollPosition(this.scrollPosition);
			clip.updatePixelsPerSecond(this.pixelsPerSecond);
		}
	}

	private updateClipSelection(): void {
		for (const clip of this.clips) {
			clip.updateSelectedClipId(this.selectedClipId);
		}
	}

	private handleClipClick(trackIndex: number, clipIndex: number, event: pixi.FederatedPointerEvent): void {
		// Emit event to timeline for handling
		this.getContainer().emit("clip:click", { trackIndex, clipIndex, event });
	}
}
