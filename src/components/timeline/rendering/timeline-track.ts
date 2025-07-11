import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { ITimelineTrack, ITimelineClip } from "../types/timeline.interfaces";

/**
 * Represents a track in the timeline that can contain multiple clips
 */
export class TimelineTrack extends Entity implements ITimelineTrack {
	private clips: Map<string, ITimelineClip> = new Map();
	private graphics: PIXI.Graphics;
	private clipsContainer: PIXI.Container;
	
	private static readonly VISUAL = {
		rulerHeight: 30,
		trackGap: 2,
		backgroundWidth: 5000,
		borderColor: 0x404040,
		borderWidth: 1,
		backgroundAlpha: 0.5,
		evenTrackColor: 0x2a2a2a,
		oddTrackColor: 0x252525
	} as const;

	constructor(
		private trackId: string,
		private index: number,
		private height: number = 60
	) {
		super();
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
		this.updateLayout();
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
		const { rulerHeight, trackGap } = TimelineTrack.VISUAL;
		this.getContainer().y = this.index * (this.height + trackGap) + rulerHeight;
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
		const { backgroundWidth, borderColor, borderWidth, backgroundAlpha, evenTrackColor, oddTrackColor } = TimelineTrack.VISUAL;
		
		this.graphics.clear();
		
		const backgroundColor = this.index % 2 === 0 ? evenTrackColor : oddTrackColor;
		this.graphics
			.rect(0, 0, backgroundWidth, this.height)
			.fill({ color: backgroundColor, alpha: backgroundAlpha });

		this.graphics
			.moveTo(0, this.height)
			.lineTo(backgroundWidth, this.height)
			.stroke({ width: borderWidth, color: borderColor });
	}
}
