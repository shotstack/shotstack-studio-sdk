import { Edit } from "@core/edit";

import { TimelineTheme } from "../../../core/theme";
import {
	RulerFeature,
	PlayheadFeature,
	ScrollManager,
	RulerFeatureOptions,
	PlayheadFeatureOptions,
	ScrollManagerOptions,
	TimelineReference
} from "../features";
import { TimelineLayout } from "../timeline-layout";
import { TimelineToolbar } from "../timeline-toolbar";

import { TimelineEventHandler } from "./timeline-event-handler";
import { TimelineRenderer } from "./timeline-renderer";
import { ViewportManager } from "./viewport-manager";

export interface TimelineFeatures {
	toolbar: TimelineToolbar;
	ruler: RulerFeature;
	playhead: PlayheadFeature;
	scroll: ScrollManager;
}

export class TimelineFeatureManager {
	private toolbar!: TimelineToolbar;
	private ruler!: RulerFeature;
	private playhead!: PlayheadFeature;
	private scroll!: ScrollManager;

	constructor(
		private edit: Edit,
		private layout: TimelineLayout,
		private renderer: TimelineRenderer,
		private viewportManager: ViewportManager,
		private eventHandler: TimelineEventHandler,
		private getTimelineContext: () => TimelineReference // Reference back to timeline for scroll
	) {}

	public async setupTimelineFeatures(
		theme: TimelineTheme,
		pixelsPerSecond: number,
		width: number,
		height: number,
		extendedDuration: number
	): Promise<void> {
		// Create toolbar
		this.toolbar = new TimelineToolbar(this.edit, theme, this.layout, width);
		this.renderer.getStage().addChild(this.toolbar);

		// Create ruler feature with extended duration for display
		const rulerOptions: RulerFeatureOptions = {
			pixelsPerSecond,
			timelineDuration: extendedDuration,
			rulerHeight: this.layout.rulerHeight,
			theme
		};
		this.ruler = new RulerFeature(rulerOptions);
		await this.ruler.load();
		this.ruler.getContainer().y = this.layout.rulerY;
		this.viewportManager.getRulerViewport().addChild(this.ruler.getContainer());

		// Connect ruler seek events
		this.ruler.events.on("ruler:seeked", this.eventHandler.handleSeek.bind(this.eventHandler));

		// Create playhead feature (should span full height including ruler)
		const playheadOptions: PlayheadFeatureOptions = {
			pixelsPerSecond,
			timelineHeight: height,
			theme
		};
		this.playhead = new PlayheadFeature(playheadOptions);
		await this.playhead.load();
		// Position playhead to start from top of ruler
		this.playhead.getContainer().y = this.layout.rulerY;
		// Add playhead to dedicated container that renders above ruler
		this.viewportManager.getPlayheadContainer().addChild(this.playhead.getContainer());

		// Connect playhead seek events
		this.playhead.events.on("playhead:seeked", this.eventHandler.handleSeek.bind(this.eventHandler));

		// Create scroll manager for handling scroll events
		const scrollOptions: ScrollManagerOptions = {
			timeline: this.getTimelineContext()
		};
		this.scroll = new ScrollManager(scrollOptions);
		await this.scroll.initialize();

		// Position viewport and apply initial transform
		this.viewportManager.updateViewportTransform();
	}

	public recreateTimelineFeatures(theme: TimelineTheme, pixelsPerSecond: number, height: number, extendedDuration: number): void {
		if (this.ruler) {
			this.ruler.dispose();
			const rulerHeight = theme.dimensions?.rulerHeight || this.layout.rulerHeight;
			const rulerOptions: RulerFeatureOptions = {
				pixelsPerSecond,
				timelineDuration: extendedDuration,
				rulerHeight,
				theme
			};
			this.ruler = new RulerFeature(rulerOptions);
			this.ruler.load();
			this.ruler.getContainer().y = this.layout.rulerY;
			this.viewportManager.getRulerViewport().addChild(this.ruler.getContainer());
			this.ruler.events.on("ruler:seeked", this.eventHandler.handleSeek.bind(this.eventHandler));
		}

		if (this.playhead) {
			this.playhead.dispose();
			const playheadOptions: PlayheadFeatureOptions = {
				pixelsPerSecond,
				timelineHeight: height,
				theme
			};
			this.playhead = new PlayheadFeature(playheadOptions);
			this.playhead.load();
			// Position playhead to start from top of ruler
			this.playhead.getContainer().y = this.layout.rulerY;
			// Add playhead to dedicated container that renders above ruler
			this.viewportManager.getPlayheadContainer().addChild(this.playhead.getContainer());
			this.playhead.events.on("playhead:seeked", this.eventHandler.handleSeek.bind(this.eventHandler));
		}
	}

	public updateRuler(pixelsPerSecond: number, extendedDuration: number): void {
		this.ruler.updateRuler(pixelsPerSecond, extendedDuration);
	}

	public updatePlayhead(pixelsPerSecond: number, timelineHeight: number): void {
		if (this.playhead) {
			this.playhead.updatePlayhead(pixelsPerSecond, timelineHeight);
		}
	}

	public getFeatures(): TimelineFeatures {
		return {
			toolbar: this.toolbar,
			ruler: this.ruler,
			playhead: this.playhead,
			scroll: this.scroll
		};
	}

	public getToolbar(): TimelineToolbar {
		return this.toolbar;
	}

	public getPlayhead(): PlayheadFeature {
		return this.playhead;
	}

	public dispose(): void {
		if (this.toolbar) {
			this.toolbar.destroy();
		}
		if (this.ruler) {
			this.ruler.dispose();
		}
		if (this.playhead) {
			this.playhead.dispose();
		}
		if (this.scroll) {
			this.scroll.dispose();
		}
	}
}
