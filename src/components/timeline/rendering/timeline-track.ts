import { Entity } from "@core/shared/entity";
import { Theme } from "@core/theme/theme-context";
import * as PIXI from "pixi.js";

import { ITimelineTrack, ITimelineClip } from "../types/timeline.interfaces";

/**
 * Represents a track in the timeline that can contain multiple clips
 */
export class TimelineTrack extends Entity implements ITimelineTrack {
	private clips: Map<string, ITimelineClip> = new Map();
	private graphics!: PIXI.Graphics;
	private clipsContainer!: PIXI.Container;
	private height: number;

	constructor(
		private trackId: string,
		private index: number
	) {
		super();
		this.height = Theme.dimensions.track.height;
		this.setupContainers();
	}

	public async load(): Promise<void> {
		this.updateLayout();
	}

	private forEachClip(callback: (clip: ITimelineClip) => void): void {
		this.clips.forEach(callback);
	}

	public update(deltaTime: number, elapsed: number): void {
		this.forEachClip(clip => clip.update(deltaTime, elapsed));
	}

	public draw(): void {
		this.drawBackground();
		this.forEachClip(clip => clip.draw());
	}

	public dispose(): void {
		this.forEachClip(clip => clip.dispose());
		this.clips.clear();

		this.graphics.destroy();
		this.clipsContainer.destroy({ children: true });
	}

	// Simple getters
	public getTrackId = () => this.trackId;
	public getIndex = () => this.index;
	public getHeight = () => this.height;
	public getClips = () => Array.from(this.clips.values());

	public addClip(clip: ITimelineClip): void {
		const clipId = clip.getClipId();
		if (this.clips.has(clipId)) {
			console.warn(`Clip "${clipId}" already exists in track "${this.trackId}"`);
			return;
		}

		this.clips.set(clipId, clip);
		this.clipsContainer.addChild(clip.getContainer());

		// Sort children by start time to ensure proper layering
		this.sortClipsByStartTime();
		this.updateLayout();
	}

	private sortClipsByStartTime(): void {
		// Get all clips and sort them by start time
		const sortedClips = Array.from(this.clips.values()).sort((a, b) => a.getStartTime() - b.getStartTime());

		// Reorder children in the container
		sortedClips.forEach((clip, index) => {
			this.clipsContainer.setChildIndex(clip.getContainer(), index);
		});
	}

	public removeClip(clipId: string, dispose = true): void {
		const clip = this.clips.get(clipId);
		if (!clip) return;

		this.clipsContainer.removeChild(clip.getContainer());
		if (dispose) clip.dispose();
		this.clips.delete(clipId);
		this.updateLayout();
	}

	public detachClip(clipId: string): void {
		this.removeClip(clipId, false);
	}

	public updateLayout(): void {
		const yPosition = this.index * (this.height + Theme.dimensions.track.gap) + Theme.dimensions.ruler.height;
		this.getContainer().y = yPosition;
		this.forEachClip(clip => {
			const clipContainer = clip.getContainer();
			clipContainer.y = 0;
		});
	}

	public setIndex(index: number): void {
		this.index = index;
		this.updateLayout();
	}

	public setHeight(height: number): void {
		this.height = height;
		this.updateLayout();
		this.drawBackground();
	}

	private setupContainers(): void {
		this.graphics = new PIXI.Graphics();
		this.clipsContainer = new PIXI.Container();

		const container = this.getContainer();
		container.addChild(this.graphics, this.clipsContainer);

		container.eventMode = "static";
		container.interactiveChildren = true;
		this.clipsContainer.eventMode = "static";
		this.clipsContainer.interactiveChildren = true;
	}

	private drawBackground(): void {
		this.graphics.clear();

		const backgroundColor = this.index % 2 === 0 ? Theme.colors.background.tracks.even : Theme.colors.background.tracks.odd;

		// Use a large fixed width for track backgrounds
		const trackBackgroundWidth = 10000;
		
		this.graphics
			.rect(0, 0, trackBackgroundWidth, this.height)
			.fill({ color: backgroundColor, alpha: Theme.opacity.trackBackground });

		this.graphics
			.moveTo(0, this.height)
			.lineTo(trackBackgroundWidth, this.height)
			.stroke({ width: Theme.borders.track, color: Theme.colors.borders.primary });
	}
}
