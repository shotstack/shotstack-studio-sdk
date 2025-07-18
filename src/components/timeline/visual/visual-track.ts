import { TrackSchema } from "@core/schemas/track";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";
import { z } from "zod";

import { TimelineTheme } from "../../../core/theme";

import { TRACK_CONSTANTS } from "../constants";
import { ClipConfig } from "../types/timeline";
import { VisualClip, VisualClipOptions } from "./visual-clip";

type TrackType = z.infer<typeof TrackSchema>;

export interface VisualTrackOptions {
	pixelsPerSecond: number;
	trackHeight: number;
	trackIndex: number;
	width: number;
	theme: TimelineTheme;
}

export class VisualTrack extends Entity {
	private clips: VisualClip[] = [];
	private options: VisualTrackOptions;
	private background: PIXI.Graphics;

	// Visual constants
	private readonly TRACK_PADDING = TRACK_CONSTANTS.PADDING;
	private readonly LABEL_PADDING = TRACK_CONSTANTS.LABEL_PADDING;

	constructor(options: VisualTrackOptions) {
		super();
		this.options = options;
		this.background = new PIXI.Graphics();

		this.setupContainer();
	}

	public async load(): Promise<void> {
		this.updateTrackAppearance();
	}

	private setupContainer(): void {
		const container = this.getContainer();

		// Set up container with label for later tool integration
		container.label = `track-${this.options.trackIndex}`;

		container.addChild(this.background);
		// Track labels removed - container.addChild(this.trackLabel);

		// Position track at correct vertical position
		container.y = this.options.trackIndex * this.options.trackHeight;
	}


	private updateTrackAppearance(): void {
		const {width} = this.options;
		const height = this.options.trackHeight;
		const {theme} = this.options;

		// Draw track background
		this.background.clear();

		// Alternating track colors using theme
		const bgColor = this.options.trackIndex % 2 === 0 ? 
			theme.colors.structure.surface : 
			theme.colors.structure.surfaceAlt;
		const trackOpacity = theme.opacity?.track || TRACK_CONSTANTS.DEFAULT_OPACITY;
		
		this.background.rect(0, 0, width, height);
		this.background.fill({ color: bgColor, alpha: trackOpacity });

		// Draw track border using theme
		this.background.rect(0, 0, width, height);
		this.background.stroke({ width: TRACK_CONSTANTS.BORDER_WIDTH, color: theme.colors.structure.border });

		// Draw track separator line at bottom using theme
		this.background.moveTo(0, height - 1);
		this.background.lineTo(width, height - 1);
		this.background.stroke({ width: TRACK_CONSTANTS.BORDER_WIDTH, color: theme.colors.structure.divider });
	}

	public rebuildFromTrackData(trackData: TrackType, pixelsPerSecond: number): void {
		// Update options with new pixels per second
		this.options = {
			...this.options,
			pixelsPerSecond
		};

		// Clear existing clips
		this.clearAllClips();

		// Create new clips from track data
		if (trackData.clips) {
			trackData.clips.forEach((clipConfig, clipIndex) => {
				const visualClipOptions: VisualClipOptions = {
					pixelsPerSecond: this.options.pixelsPerSecond,
					trackHeight: this.options.trackHeight,
					trackIndex: this.options.trackIndex,
					clipIndex,
					theme: this.options.theme
				};

				const visualClip = new VisualClip(clipConfig, visualClipOptions);
				this.addClip(visualClip);
			});
		}

		// Update track appearance
		this.updateTrackAppearance();
	}

	private async addClip(visualClip: VisualClip): Promise<void> {
		this.clips.push(visualClip);
		await visualClip.load();

		// Add clip to container
		const container = this.getContainer();
		container.addChild(visualClip.getContainer());
	}

	private clearAllClips(): void {
		// Remove all clips from container and dispose them
		const container = this.getContainer();

		for (const clip of this.clips) {
			container.removeChild(clip.getContainer());
			clip.dispose();
		}

		this.clips = [];
	}

	public removeClip(clipIndex: number): void {
		if (clipIndex >= 0 && clipIndex < this.clips.length) {
			const clip = this.clips[clipIndex];
			const container = this.getContainer();

			container.removeChild(clip.getContainer());
			clip.dispose();

			this.clips.splice(clipIndex, 1);
		}
	}

	public updateClip(clipIndex: number, newClipConfig: ClipConfig): void {
		if (clipIndex >= 0 && clipIndex < this.clips.length) {
			const clip = this.clips[clipIndex];
			clip.updateFromConfig(newClipConfig);
		}
	}

	public setPixelsPerSecond(pixelsPerSecond: number): void {
		// Create new options object instead of mutating
		this.options = {
			...this.options,
			pixelsPerSecond
		};

		// Update all clips with new pixels per second
		this.clips.forEach(clip => {
			clip.setPixelsPerSecond(pixelsPerSecond);
		});

		this.updateTrackAppearance();
	}

	public setWidth(width: number): void {
		// Create new options object instead of mutating
		this.options = {
			...this.options,
			width
		};
		this.updateTrackAppearance();
	}

	public setTrackIndex(trackIndex: number): void {
		// Create new options object instead of mutating
		this.options = {
			...this.options,
			trackIndex
		};

		// Update container position
		const container = this.getContainer();
		container.y = trackIndex * this.options.trackHeight;

		// Track labels removed
		// this.trackLabel.text = `Track ${trackIndex + 1}`;

		// Update all clips with new track index
		this.clips.forEach((clip, _clipIndex) => {
			clip.updateOptions({ trackIndex });
		});
	}

	// Selection methods
	public selectClip(clipIndex: number): void {
		// Clear all selections first
		this.clearAllSelections();

		// Select the specified clip
		if (clipIndex >= 0 && clipIndex < this.clips.length) {
			this.clips[clipIndex].setSelected(true);
		}
	}

	public clearAllSelections(): void {
		this.clips.forEach(clip => {
			clip.setSelected(false);
		});
	}

	public getSelectedClip(): VisualClip | null {
		return this.clips.find(clip => clip.getSelected()) || null;
	}

	public getSelectedClipIndex(): number {
		return this.clips.findIndex(clip => clip.getSelected());
	}

	// Getters
	public getClips(): VisualClip[] {
		return [...this.clips];
	}

	public getClip(clipIndex: number): VisualClip | null {
		return this.clips[clipIndex] || null;
	}

	public getClipCount(): number {
		return this.clips.length;
	}

	public getTrackIndex(): number {
		return this.options.trackIndex;
	}

	public getTrackHeight(): number {
		return this.options.trackHeight;
	}

	public getOptions(): VisualTrackOptions {
		// Return a defensive copy to prevent external mutations
		return { ...this.options };
	}

	// Hit testing
	public findClipAtPosition(x: number, y: number): { clip: VisualClip; clipIndex: number } | null {
		// Check if y is within track bounds
		if (y < 0 || y > this.options.trackHeight) {
			return null;
		}

		// Convert x to time
		const time = x / this.options.pixelsPerSecond;

		// Find clip at this time
		for (let i = 0; i < this.clips.length; i += 1) {
			const clip = this.clips[i];
			const clipConfig = clip.getClipConfig();
			const clipStart = clipConfig.start || 0;
			const clipEnd = clipStart + (clipConfig.length || 0);

			if (time >= clipStart && time <= clipEnd) {
				return { clip, clipIndex: i };
			}
		}

		return null;
	}

	// Required Entity methods
	public update(_deltaTime: number, _elapsed: number): void {
		// VisualTrack doesn't need frame-based updates
		// All updates are driven by state changes

		// Update all clips
		this.clips.forEach(clip => {
			clip.update(_deltaTime, _elapsed);
		});
	}

	public draw(): void {
		// Draw is called by the Entity system
		// Track appearance is updated when properties change
		// Only propagate draw to clips
		this.clips.forEach(clip => {
			clip.draw();
		});
	}

	public dispose(): void {
		// Clean up all clips
		this.clearAllClips();

		// Clean up graphics resources
		this.background.destroy();
	}
}
