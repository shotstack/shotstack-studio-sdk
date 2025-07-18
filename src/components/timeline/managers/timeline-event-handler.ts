import { Edit } from "@core/edit";

import { EditType, ClipConfig } from "../types/timeline";

export interface TimelineEventCallbacks {
	onEditChange: (editType?: EditType) => Promise<void>;
	onSeek: (time: number) => void;
	onClipSelected: (trackIndex: number, clipIndex: number) => void;
	onSelectionCleared: () => void;
	onDragStarted: (trackIndex: number, clipIndex: number) => void;
	onDragEnded: () => void;
}

export class TimelineEventHandler {
	constructor(
		private edit: Edit,
		private callbacks: TimelineEventCallbacks
	) {}

	public setupEventListeners(): void {
		this.edit.events.on("timeline:updated", this.handleTimelineUpdated.bind(this));
		this.edit.events.on("clip:updated", this.handleClipUpdated.bind(this));
		this.edit.events.on("clip:selected", this.handleClipSelected.bind(this));
		this.edit.events.on("selection:cleared", this.handleSelectionCleared.bind(this));
		this.edit.events.on("drag:started", this.handleDragStarted.bind(this));
		this.edit.events.on("drag:ended", this.handleDragEnded.bind(this));
		this.edit.events.on("track:created-and-clip:moved", this.handleTrackCreatedAndClipMoved.bind(this));
	}

	private async handleTimelineUpdated(event: { current: EditType }): Promise<void> {
		await this.callbacks.onEditChange(event.current);
	}

	private async handleClipUpdated(): Promise<void> {
		await this.callbacks.onEditChange();
	}

	private handleClipSelected(event: { clip: ClipConfig; trackIndex: number; clipIndex: number }): void {
		this.callbacks.onClipSelected(event.trackIndex, event.clipIndex);
	}

	private handleSelectionCleared(): void {
		this.callbacks.onSelectionCleared();
	}

	private handleDragStarted(event: { trackIndex: number; clipIndex: number; startTime: number; offsetX: number; offsetY: number }): void {
		this.callbacks.onDragStarted(event.trackIndex, event.clipIndex);
	}

	private handleDragEnded(): void {
		this.callbacks.onDragEnded();
	}

	private async handleTrackCreatedAndClipMoved(): Promise<void> {
		await this.callbacks.onEditChange();
	}

	public handleSeek(event: { time: number }): void {
		// Convert timeline seconds to edit milliseconds
		this.callbacks.onSeek(event.time * 1000);
	}

	public dispose(): void {
		this.edit.events.off("timeline:updated", this.handleTimelineUpdated.bind(this));
		this.edit.events.off("clip:updated", this.handleClipUpdated.bind(this));
		this.edit.events.off("clip:selected", this.handleClipSelected.bind(this));
		this.edit.events.off("selection:cleared", this.handleSelectionCleared.bind(this));
		this.edit.events.off("drag:started", this.handleDragStarted.bind(this));
		this.edit.events.off("drag:ended", this.handleDragEnded.bind(this));
		this.edit.events.off("track:created-and-clip:moved", this.handleTrackCreatedAndClipMoved.bind(this));
	}
}