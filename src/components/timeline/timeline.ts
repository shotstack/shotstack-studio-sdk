import { ResizeClipCommand } from "@core/commands/resize-clip-command";
import { UpdateClipPositionCommand } from "@core/commands/update-clip-position-command";
import { Edit } from "@core/edit";
import { type Size } from "@layouts/geometry";
import * as pixi from "pixi.js";

import { TimelineBase } from "./base/timeline-base";
import { TimelineDragManager } from "./drag";
import { TimelineRuler, TimelineTrack } from "./elements";
import { TIMELINE_CONFIG } from "./timeline-config";
import type { ClipSelectedEventData, ClipUpdatedEventData, ClipDeletedEventData, TrackDeletedEventData } from "./timeline-types";

export class Timeline extends TimelineBase {
	private width: number;
	private height: number;

	public application: pixi.Application | null;
	private background: pixi.Graphics | null;
	private ruler: TimelineRuler | null;
	private tracks: TimelineTrack[] = [];
	private playhead: pixi.Graphics | null;
	private trackContainer: pixi.Container | null;
	private pixelsPerSecondValue: number = TIMELINE_CONFIG.dimensions.defaultPixelsPerSecond;
	private trackHeightValue: number = TIMELINE_CONFIG.dimensions.trackHeight;
	private scrollPositionValue: number = 0;
	private verticalScrollPositionValue: number = 0;
	private visibleHeightValue: number = 0;
	private selectedClipIdValue: string | null = null;
	private isPlayingValue: boolean = false;

	private refreshTimeout: number | null = null;
	private static readonly REFRESH_DEBOUNCE_MS = 16;
	private readonly boundTimelineClickHandler: (event: pixi.FederatedPointerEvent) => void;
	private readonly boundWheelHandler: (event: pixi.FederatedWheelEvent) => void;
	private dragManager: TimelineDragManager;

	constructor(edit: Edit, size: Size) {
		super(edit);
		this.width = size.width;
		this.height = size.height;

		this.application = null;
		this.background = null;
		this.ruler = null;
		this.tracks = [];
		this.playhead = null;
		this.trackContainer = null;

		this.boundTimelineClickHandler = this.handleTimelineClick.bind(this);
		this.boundWheelHandler = this.handleWheel.bind(this);

		// Create drag manager instance
		this.dragManager = new TimelineDragManager();

		// Bind event handlers with proper context
		this.bindEvent("clip:selected", this.handleClipSelected.bind(this));
		this.bindEvent("clip:updated", this.handleClipUpdated.bind(this));
		this.bindEvent("clip:deleted", this.handleClipDeleted.bind(this));
		this.bindEvent("track:deleted", this.handleTrackDeleted.bind(this));
	}

	public override async load(): Promise<void> {
		this.application = new pixi.Application();
		await this.application.init({
			width: this.width,
			height: this.height,
			background: `#${TIMELINE_CONFIG.colors.background.toString(16).padStart(6, "0")}`,
			antialias: true
		});

		try {
			this.background = new pixi.Graphics();
			this.ruler = new TimelineRuler(this.edit, this.width);
			this.playhead = new pixi.Graphics();
			this.trackContainer = new pixi.Container();
		} catch (error) {
			const { message } = error as Error;
			console.error("Failed to create timeline components:", message);
			throw new Error("Timeline component initialization failed");
		}

		this.getContainer().addChild(this.background);
		this.getContainer().addChild(this.trackContainer);
		this.getContainer().addChild(this.ruler.getContainer());
		this.getContainer().addChild(this.playhead);

		try {
			await this.ruler.load();
		} catch (error) {
			console.error("Failed to load timeline ruler:", error);
			throw new Error("Timeline ruler initialization failed");
		}

		if (this.application) {
			this.application.stage.addChild(this.getContainer());
		}

		const { rulerHeight } = TIMELINE_CONFIG.dimensions;
		this.visibleHeightValue = this.height - rulerHeight;

		if (this.trackContainer) {
			const mask = new pixi.Graphics();
			mask.rect(0, rulerHeight, this.width, this.visibleHeight);
			mask.fill({ color: 0xffffff });
			this.trackContainer.mask = mask;
			this.getContainer().addChild(mask);

			this.trackContainer.position.y = rulerHeight;
		}

		this.drawBackground();

		this.setupInteractions();

		this.drawBackground();
		this.buildTracks();
		this.drawPlayhead();
	}

	public override update(deltaTime: number, elapsed: number): void {
		if (!this.playhead) return;

		this.ruler?.update(deltaTime, elapsed);
		for (const track of this.tracks) {
			track.update(deltaTime, elapsed);
		}

		const playheadX = (this.edit.playbackTime / 1000) * this.pixelsPerSecond - this.scrollPosition;

		this.playhead.clear();
		this.playhead.position.x = Math.max(0, Math.min(this.width, playheadX));

		this.playhead.strokeStyle = { color: TIMELINE_CONFIG.colors.playhead, width: TIMELINE_CONFIG.dimensions.playheadWidth };
		this.playhead.moveTo(0, 0);
		this.playhead.lineTo(0, this.height);
		this.playhead.stroke();

		this.playhead.fillStyle = { color: TIMELINE_CONFIG.colors.playhead };
		this.playhead.circle(0, 15, 5);
		this.playhead.fill();

		if (this.edit.isPlaying) {
			const rightEdgeThreshold = this.width - TIMELINE_CONFIG.animation.autoScrollThreshold;

			if (playheadX > rightEdgeThreshold) {
				this.scrollPosition += (playheadX - rightEdgeThreshold) * 0.1;

				this.refreshView();
			}

			if (playheadX < TIMELINE_CONFIG.animation.autoScrollThreshold && this.scrollPosition > 0) {
				this.scrollPosition = Math.max(0, this.scrollPosition - 10);
				this.refreshView();
			}
		}
	}

	public override draw(): void {}

	public override dispose(): void {
		if (this.refreshTimeout !== null) {
			clearTimeout(this.refreshTimeout);
			this.refreshTimeout = null;
		}

		this.getContainer().off("wheel", this.boundWheelHandler);
		this.getContainer().removeAllListeners();
		this.getContainer().eventMode = "none";

		for (let i = this.tracks.length - 1; i >= 0; i -= 1) {
			const track = this.tracks[i];
			if (this.trackContainer && track.getContainer().parent === this.trackContainer) {
				this.trackContainer.removeChild(track.getContainer());
			}
			track.dispose();
		}
		this.tracks.length = 0;

		if (this.ruler) {
			if (this.ruler.getContainer().parent) {
				this.ruler.getContainer().parent.removeChild(this.ruler.getContainer());
			}
			this.ruler.dispose();
			this.ruler = null;
		}

		this.background?.destroy({ children: true });
		this.background = null;

		this.playhead?.destroy({ children: true });
		this.playhead = null;

		if (this.trackContainer?.mask) {
			const mask = this.trackContainer.mask as pixi.Graphics;
			this.trackContainer.mask = null;
			mask.destroy({ children: true });
		}
		this.trackContainer?.destroy({ children: true });
		this.trackContainer = null;

		this.application?.destroy(true, {
			children: true,
			texture: true
		});
		this.application = null;

		// Clean up event bindings
		// Note: TimelineBase dispose is abstract, no super call needed
	}

	public get pixelsPerSecond(): number {
		return this.pixelsPerSecondValue;
	}

	public set pixelsPerSecond(value: number) {
		const validatedValue = Math.max(TIMELINE_CONFIG.dimensions.minZoom, Math.min(TIMELINE_CONFIG.dimensions.maxZoom, value));

		if (this.pixelsPerSecondValue !== validatedValue) {
			this.pixelsPerSecondValue = validatedValue;
			this.onStateChanged("pixelsPerSecond");
		}
	}

	public get scrollPosition(): number {
		return this.scrollPositionValue;
	}

	public set scrollPosition(value: number) {
		const validatedValue = Math.max(0, value);

		if (this.scrollPositionValue !== validatedValue) {
			this.scrollPositionValue = validatedValue;
			this.onStateChanged("scrollPosition");
		}
	}

	public get verticalScrollPosition(): number {
		return this.verticalScrollPositionValue;
	}

	public set verticalScrollPosition(value: number) {
		const maxScroll = this.getMaxVerticalScroll();
		const validatedValue = Math.max(0, Math.min(maxScroll, value));

		if (this.verticalScrollPositionValue !== validatedValue) {
			this.verticalScrollPositionValue = validatedValue;
			this.onStateChanged("verticalScrollPosition");
		}
	}

	public get selectedClipId(): string | null {
		return this.selectedClipIdValue;
	}

	public set selectedClipId(value: string | null) {
		if (this.selectedClipIdValue !== value) {
			this.selectedClipIdValue = value;
			this.onStateChanged("selectedClipId");
		}
	}

	public get isPlaying(): boolean {
		return this.isPlayingValue;
	}

	public set isPlaying(value: boolean) {
		if (this.isPlayingValue !== value) {
			this.isPlayingValue = value;
			this.onStateChanged("isPlaying");
		}
	}

	public get visibleHeight(): number {
		return this.visibleHeightValue;
	}

	public set visibleHeight(value: number) {
		const validatedValue = Math.max(0, value);

		if (this.visibleHeightValue !== validatedValue) {
			this.visibleHeightValue = validatedValue;
			this.onStateChanged("visibleHeight");
		}
	}

	public get trackHeight(): number {
		return this.trackHeightValue;
	}

	public set trackHeight(value: number) {
		const validatedValue = Math.max(1, value);

		if (this.trackHeightValue !== validatedValue) {
			this.trackHeightValue = validatedValue;
			this.onStateChanged("trackHeight");
		}
	}

	private onStateChanged(property: string): void {
		if (this.edit?.events) {
			this.edit.events.emit("timeline:stateChanged" as any, {
				property,
				value: (this as any)[`${property}Value`]
			});
		}

		const immediateRefreshProperties = ["scrollPosition", "verticalScrollPosition"];
		const debouncedRefreshProperties = ["pixelsPerSecond", "selectedClipId"];

		if (immediateRefreshProperties.includes(property)) {
			this.refreshView();
		} else if (debouncedRefreshProperties.includes(property)) {
			this.debouncedRefreshView();
		}
	}

	public setZoom(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
	}

	public setScrollPosition(scrollPosition: number): void {
		this.scrollPosition = scrollPosition;
	}

	private drawBackground(): void {
		if (!this.background) return;

		this.background.clear();
		this.background.fillStyle = { color: 0x232323 };
		this.background.rect(0, 0, this.width, this.height);
		this.background.fill();
	}

	private buildTracks(): void {
		for (let i = this.tracks.length - 1; i >= 0; i -= 1) {
			const track = this.tracks[i];
			try {
				if (this.trackContainer && track.getContainer().parent === this.trackContainer) {
					this.trackContainer.removeChild(track.getContainer());
				}
				track.dispose();
			} catch (error) {
				console.warn("Failed to dispose timeline track:", error);
			}
		}
		this.tracks.length = 0;

		let editData;
		try {
			editData = this.edit.getEdit();
		} catch (error) {
			console.error("Failed to get edit data:", error);
			return;
		}

		for (let i = 0; i < editData.timeline.tracks.length; i += 1) {
			const trackData = editData.timeline.tracks[i];
			const trackY = i * this.trackHeight - this.verticalScrollPosition;

			if (trackY + this.trackHeight >= 0 && trackY <= this.visibleHeight) {
				try {
					const track = new TimelineTrack(
						this.edit,
						trackData,
						this.width,
						this.trackHeight,
						this.scrollPosition,
						this.pixelsPerSecond,
						this.selectedClipId,
						i,
						this.dragManager
					);

					track.getContainer().position.y = trackY;

					track.getContainer().on("clip:click", (data: { trackIndex: number; clipIndex: number; event: pixi.FederatedPointerEvent }) => {
						this.handleClipClick(data.trackIndex, data.clipIndex);
					});

					track.getContainer().on("clip:resize", (data: { trackIndex: number; clipIndex: number; newLength: number; initialLength: number }) => {
						this.handleClipResize(data.trackIndex, data.clipIndex, data.newLength, data.initialLength);
					});

					track.getContainer().on("clip:drag", (data: { trackIndex: number; clipIndex: number; newStart: number; initialStart: number }) => {
						this.handleClipDrag(data.trackIndex, data.clipIndex, data.newStart, data.initialStart);
					});

					this.trackContainer?.addChild(track.getContainer());
					track.load();
					this.tracks.push(track);
				} catch (error) {
					console.warn(`Failed to create track ${i}:`, error);
				}
			}
		}
	}

	private drawPlayhead(): void {
		if (!this.playhead) return;

		this.playhead.clear();

		this.playhead.strokeStyle = { color: TIMELINE_CONFIG.colors.playhead, width: TIMELINE_CONFIG.dimensions.playheadWidth };
		this.playhead.moveTo(0, 0);
		this.playhead.lineTo(0, this.height);
		this.playhead.stroke();

		this.playhead.fillStyle = { color: TIMELINE_CONFIG.colors.playhead };
		this.playhead.circle(0, 15, 5);
		this.playhead.fill();
	}

	private setupInteractions(): void {
		const container = this.getContainer();
		container.eventMode = "static";
		container.hitArea = new pixi.Rectangle(0, 0, this.width, this.height);

		if (this.background) {
			this.background.eventMode = "static";
			this.background.hitArea = new pixi.Rectangle(0, 0, this.width, this.height);
			this.background.on("pointerdown", this.boundTimelineClickHandler);
		}

		if (this.ruler) {
			this.ruler.getContainer().eventMode = "static";
			this.ruler.getContainer().on("pointerdown", (event: pixi.FederatedPointerEvent) => {
				this.ruler?.handleClick(event);
			});
		}

		container.on("pointerdown", this.boundTimelineClickHandler);

		container.on("wheel", this.boundWheelHandler);
	}

	private getMaxVerticalScroll(): number {
		const editData = this.edit.getEdit();
		const totalTracksHeight = editData.timeline.tracks.length * this.trackHeight;
		return Math.max(0, totalTracksHeight - this.visibleHeight);
	}

	private refreshView(): void {
		this.buildTracks();
		this.ruler?.updateScrollPosition(this.scrollPosition);
		this.ruler?.updatePixelsPerSecond(this.pixelsPerSecond);
	}

	private debouncedRefreshView(): void {
		if (this.refreshTimeout !== null) {
			clearTimeout(this.refreshTimeout);
		}

		this.refreshTimeout = window.setTimeout(() => {
			this.refreshView();
			this.refreshTimeout = null;
		}, Timeline.REFRESH_DEBOUNCE_MS);
	}

	private handleTimelineClick(event: pixi.FederatedPointerEvent): void {
		const clickX = event.getLocalPosition(this.getContainer()).x;
		const clickY = event.getLocalPosition(this.getContainer()).y;

		const rulerHeight = 20;
		const isRulerClick = clickY < rulerHeight;

		if (isRulerClick) {
			const clickTime = ((clickX + this.scrollPosition) / this.pixelsPerSecond) * 1000;

			this.edit.seek(clickTime);
		}
	}

	private handleWheel(event: pixi.FederatedWheelEvent): void {
		if (event.altKey) {
			const oldZoom = this.pixelsPerSecond;
			this.pixelsPerSecond = Math.max(
				TIMELINE_CONFIG.dimensions.minZoom,
				Math.min(TIMELINE_CONFIG.dimensions.maxZoom, this.pixelsPerSecond * (1 - event.deltaY * TIMELINE_CONFIG.animation.zoomSpeed))
			);

			const mouseX = event.getLocalPosition(this.getContainer()).x;
			const timeAtCursor = (mouseX + this.scrollPosition) / oldZoom;
			this.scrollPosition = timeAtCursor * this.pixelsPerSecond - mouseX;
		} else if (event.shiftKey) {
			this.scrollPosition += event.deltaY;
		} else {
			if (event.deltaX !== 0) {
				this.scrollPosition += event.deltaX;
			}
			if (event.deltaY !== 0) {
				this.verticalScrollPosition += event.deltaY * TIMELINE_CONFIG.animation.scrollSpeed;
			}
		}
	}

	private handleClipClick(trackIndex: number, clipIndex: number): void {
		this.selectedClipId = this.getClipId(trackIndex, clipIndex);

		try {
			const playerClip = this.edit.getPlayerClip(trackIndex, clipIndex);
			if (playerClip) {
				this.edit.setSelectedClip(playerClip);
			}
		} catch (error) {
			console.warn("Failed to handle clip selection:", error);
		}

		this.refreshView();
	}

	private handleClipResize(trackIndex: number, clipIndex: number, newLength: number, _: number): void {
		try {
			const command = new ResizeClipCommand(trackIndex, clipIndex, newLength);
			this.edit.executeEditCommand(command);
		} catch (error) {
			console.warn("Failed to handle clip resize:", error);
		}
	}

	private handleClipDrag(trackIndex: number, clipIndex: number, newStart: number, __: number): void {
		try {
			const command = new UpdateClipPositionCommand(trackIndex, clipIndex, newStart);
			this.edit.executeEditCommand(command);
		} catch (error) {
			console.warn("Failed to handle clip drag:", error);
		}
	}

	private handleClipSelected(data: ClipSelectedEventData): void {
		if (data.clip) {
			this.selectedClipId = this.getClipId(data.trackIndex, data.clipIndex);
		} else {
			this.selectedClipId = null;
		}

		this.refreshView();
	}

	private handleClipUpdated(_: ClipUpdatedEventData): void {
		this.refreshView();
	}

	private handleClipDeleted(data: ClipDeletedEventData): void {
		if (this.selectedClipId === data.clipId) {
			this.selectedClipId = null;
		}
		this.refreshView();
	}

	private handleTrackDeleted(_: TrackDeletedEventData): void {
		this.refreshView();
	}

	public getCanvas(): HTMLCanvasElement {
		if (!this.application) {
			throw new Error("Timeline not loaded - call load() first");
		}
		return this.application.canvas;
	}

	private getClipId(trackIndex: number, clipIndex: number): string {
		return `track${trackIndex}-clip${clipIndex}`;
	}
}
