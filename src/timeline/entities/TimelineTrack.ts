import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { ITimelineTrack, ITimelineClip } from "../interfaces";

/**
 * Represents a track in the timeline that can contain multiple clips
 */
export class TimelineTrack extends Entity implements ITimelineTrack {
	private trackId: string;
	private index: number;
	private height: number;
	private clips: Map<string, ITimelineClip> = new Map();
	private graphics: PIXI.Graphics;
	private clipsContainer: PIXI.Container;

	constructor(trackId: string, index: number, height: number = 60) {
		super();
		this.trackId = trackId;
		this.index = index;
		this.height = height;

		// Create graphics for track background
		this.graphics = new PIXI.Graphics();
		this.getContainer().addChild(this.graphics);

		// Create container for clips
		this.clipsContainer = new PIXI.Container();
		this.getContainer().addChild(this.clipsContainer);
	}

	public async load(): Promise<void> {
		// Initialize track
		this.updateLayout();
	}

	public update(deltaTime: number, elapsed: number): void {
		// Update all clips
		this.clips.forEach(clip => {
			clip.update(deltaTime, elapsed);
		});
	}

	public draw(): void {
		// Draw track background
		this.drawBackground();

		// Draw all clips
		this.clips.forEach(clip => {
			clip.draw();
		});
	}

	public dispose(): void {
		// Dispose all clips
		this.clips.forEach(clip => {
			clip.dispose();
		});
		this.clips.clear();

		// Clear graphics
		this.graphics.clear();
		this.graphics.destroy();

		// Clear containers
		this.clipsContainer.removeChildren();
		this.clipsContainer.destroy();
	}

	public getTrackId(): string {
		return this.trackId;
	}

	public getIndex(): number {
		return this.index;
	}

	public getHeight(): number {
		return this.height;
	}

	public getClips(): ITimelineClip[] {
		return Array.from(this.clips.values());
	}

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

	public removeClip(clipId: string): void {
		const clip = this.clips.get(clipId);
		if (clip) {
			this.clipsContainer.removeChild(clip.getContainer());
			clip.dispose();
			this.clips.delete(clipId);
			this.updateLayout();
		}
	}

	public updateLayout(): void {
		// Position track at correct vertical position
		this.getContainer().y = this.index * this.height;

		// Sort clips by start time
		const sortedClips = Array.from(this.clips.values()).sort((a, b) => a.getStartTime() - b.getStartTime());

		// Position clips within track
		sortedClips.forEach(clip => {
			// Clips will position themselves based on their start time
			// This is just to ensure they're in the correct container
			clip.getContainer().y = 0;
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

	private drawBackground(): void {
		this.graphics.clear();

		// Draw track background with alternating colors
		const backgroundColor = this.index % 2 === 0 ? 0x2a2a2a : 0x252525;
		this.graphics.beginFill(backgroundColor, 0.5);
		this.graphics.drawRect(0, 0, 5000, this.height); // Wide enough for scrolling
		this.graphics.endFill();

		// Draw bottom border
		this.graphics.lineStyle(1, 0x404040);
		this.graphics.moveTo(0, this.height);
		this.graphics.lineTo(5000, this.height);
	}
}
