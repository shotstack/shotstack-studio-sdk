import { CreateTrackAndMoveClipCommand } from "@core/commands/create-track-and-move-clip-command";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import { ResizeClipCommand } from "@core/commands/resize-clip-command";
import * as PIXI from "pixi.js";

// eslint-disable-next-line import/no-cycle
import { Timeline } from "./timeline";
import { TimelineTheme } from "./theme";

interface DragInfo {
	trackIndex: number;
	clipIndex: number;
	startTime: number;
	offsetX: number;
	offsetY: number;
}

interface ResizeInfo {
	trackIndex: number;
	clipIndex: number;
	originalLength: number;
	startX: number;
}

enum InteractionState {
	IDLE = "idle",
	SELECTING = "selecting",
	DRAGGING = "dragging",
	RESIZING = "resizing"
}

export class TimelineInteraction {
	private timeline: Timeline;
	private state: InteractionState = InteractionState.IDLE;
	private abortController?: AbortController;

	// Drag detection
	private startPointerPos: { x: number; y: number } | null = null;
	private currentClipInfo: { trackIndex: number; clipIndex: number } | null = null;
	private dragInfo: DragInfo | null = null;
	private resizeInfo: ResizeInfo | null = null;

	// Drop zone visualization
	private dropZoneIndicator: PIXI.Graphics | null = null;
	private currentDropZone: { type: "above" | "between" | "below"; position: number } | null = null;

	// Snap guidelines visualization
	private snapGuidelines: PIXI.Graphics | null = null;

	// Distance threshold for drag detection (3px)
	private static readonly DRAG_THRESHOLD = 3;
	// Distance threshold for snap detection (10px)
	private static readonly SNAP_THRESHOLD = 10;
	
	// Dynamic thresholds based on track height
	private get RESIZE_EDGE_THRESHOLD(): number {
		const trackHeight = this.timeline.getLayout().trackHeight;
		// More generous scaling for smaller tracks (min 12px, max 20px)
		return Math.max(12, Math.min(20, trackHeight * 0.4));
	}
	
	private get DROP_ZONE_THRESHOLD(): number {
		const trackHeight = this.timeline.getLayout().trackHeight;
		// Make drop zones proportional to track height (25% of track height)
		// This ensures drop zones scale properly with track size
		return trackHeight * 0.25;
	}
	
	// Also make the drag detection more sensitive for small tracks
	private get EFFECTIVE_DRAG_THRESHOLD(): number {
		const trackHeight = this.timeline.getLayout().trackHeight;
		// Smaller threshold for smaller tracks to make dragging easier
		return trackHeight < 20 ? 2 : TimelineInteraction.DRAG_THRESHOLD;
	}

	constructor(timeline: Timeline) {
		this.timeline = timeline;
	}

	private get theme(): TimelineTheme {
		return this.timeline.getTheme();
	}

	public activate(): void {
		this.abortController = new AbortController();
		this.setupEventListeners();
	}

	public deactivate(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = undefined;
		}
		this.resetState();
	}

	private setupEventListeners(): void {
		const pixiApp = this.timeline.getPixiApp();

		pixiApp.stage.interactive = true;

		pixiApp.stage.on("pointerdown", this.handlePointerDown.bind(this), {
			signal: this.abortController?.signal
		});
		pixiApp.stage.on("pointermove", this.handlePointerMove.bind(this), {
			signal: this.abortController?.signal
		});
		pixiApp.stage.on("pointerup", this.handlePointerUp.bind(this), {
			signal: this.abortController?.signal
		});
		pixiApp.stage.on("pointerupoutside", this.handlePointerUp.bind(this), {
			signal: this.abortController?.signal
		});
	}

	private handlePointerDown(event: PIXI.FederatedPointerEvent): void {
		const target = event.target as PIXI.Container;

		// Check if clicked on a clip
		if (target.label) {
			const clipInfo = this.parseClipLabel(target.label);
			if (clipInfo) {
				// Check if clicking on resize edge
				if (this.isOnClipRightEdge(clipInfo, event)) {
					this.startResize(clipInfo, event);
					return;
				}

				this.startInteraction(clipInfo, event);
				return;
			}
		}

		// Clicked on empty space - clear selection
		this.timeline.getEdit().clearSelection();
	}

	private handlePointerMove(event: PIXI.FederatedPointerEvent): void {
		if (this.state === InteractionState.SELECTING && this.startPointerPos && this.currentClipInfo) {
			// Check if we've moved far enough to start dragging
			const currentPos = { x: event.global.x, y: event.global.y };
			const distance = Math.sqrt((currentPos.x - this.startPointerPos.x)**2 + (currentPos.y - this.startPointerPos.y)**2);

			if (distance > this.EFFECTIVE_DRAG_THRESHOLD) {
				this.startDrag(this.currentClipInfo, event);
			}
		} else if (this.state === InteractionState.DRAGGING) {
			this.updateDragPreview(event);
		} else if (this.state === InteractionState.RESIZING) {
			this.updateResizePreview(event);
		} else if (this.state === InteractionState.IDLE) {
			// Update cursor based on hover position
			this.updateCursorForPosition(event);
		}
	}

	private handlePointerUp(event: PIXI.FederatedPointerEvent): void {
		if (this.state === InteractionState.SELECTING && this.currentClipInfo) {
			// Complete selection using proper command system
			this.timeline.getEdit().selectClip(this.currentClipInfo.trackIndex, this.currentClipInfo.clipIndex);
		} else if (this.state === InteractionState.DRAGGING) {
			this.completeDrag(event);
		} else if (this.state === InteractionState.RESIZING) {
			this.completeResize(event);
		}

		this.resetState();
	}

	private startInteraction(clipInfo: { trackIndex: number; clipIndex: number }, event: PIXI.FederatedPointerEvent): void {
		this.state = InteractionState.SELECTING;
		this.startPointerPos = { x: event.global.x, y: event.global.y };
		this.currentClipInfo = clipInfo;

		// Set cursor to indicate draggable
		this.timeline.getPixiApp().canvas.style.cursor = "grab";
	}

	private startDrag(clipInfo: { trackIndex: number; clipIndex: number }, event: PIXI.FederatedPointerEvent): void {
		// Check if clip data exists
		const clipData = this.timeline.getClipData(clipInfo.trackIndex, clipInfo.clipIndex);
		if (!clipData) {
			console.warn(`Clip data not found for track ${clipInfo.trackIndex}, clip ${clipInfo.clipIndex}`);
			return;
		}

		// Calculate offset from clip start to mouse position
		const localPos = this.timeline.getContainer().toLocal(event.global);
		const layout = this.timeline.getLayout();
		const clipStartX = layout.getXAtTime(clipData.start || 0);
		const clipStartY = layout.getYAtTrack(clipInfo.trackIndex);

		this.dragInfo = {
			trackIndex: clipInfo.trackIndex,
			clipIndex: clipInfo.clipIndex,
			startTime: clipData.start || 0,
			offsetX: localPos.x - clipStartX,
			offsetY: localPos.y - clipStartY
		};

		this.state = InteractionState.DRAGGING;

		// Set cursor to indicate dragging
		this.timeline.getPixiApp().canvas.style.cursor = "grabbing";

		// Emit drag started event for visual feedback
		this.timeline.getEdit().events.emit("drag:started", this.dragInfo);
	}

	private updateDragPreview(event: PIXI.FederatedPointerEvent): void {
		if (!this.dragInfo) return;

		// Get clip duration for snapping calculations
		const clipConfig = this.timeline.getClipData(this.dragInfo.trackIndex, this.dragInfo.clipIndex);
		if (!clipConfig) return;
		const clipDuration = clipConfig.length || 0;

		// Calculate current drag position
		const localPos = this.timeline.getContainer().toLocal(event.global);
		const layout = this.timeline.getLayout();
		const rawDragTime = Math.max(0, layout.getTimeAtX(localPos.x - this.dragInfo.offsetX));
		// For drop zone detection, use raw Y position without offset
		// The offset is only needed for X positioning
		const dropZoneY = localPos.y;
		const dragY = localPos.y - this.dragInfo.offsetY;

		// Check if we're in a drop zone using raw Y
		const dropZone = this.getDropZone(dropZoneY);
		const dragTrack = Math.max(0, Math.floor(dragY / layout.trackHeight));

		// Ensure drag track is within valid bounds
		const maxTrackIndex = this.timeline.getVisualTracks().length - 1;
		const boundedDragTrack = Math.max(0, Math.min(maxTrackIndex, dragTrack));

		// Handle all visual state in one place
		if (dropZone) {
			// Show drop zone indicator and hide drag preview
			if (!this.currentDropZone || this.currentDropZone.type !== dropZone.type || this.currentDropZone.position !== dropZone.position) {
				this.currentDropZone = dropZone;
				this.showDropZoneIndicator(dropZone.position);
			}
			this.timeline.hideDragGhost();
			this.hideSnapGuidelines(); // Hide guidelines in drop zones
		} else {
			// Hide drop zone indicator
			if (this.currentDropZone || this.dropZoneIndicator) {
				this.hideDropZoneIndicator();
				this.currentDropZone = null;
			}

			// Calculate final position with snapping and collision prevention
			const excludeIndex = boundedDragTrack === this.dragInfo.trackIndex ? this.dragInfo.clipIndex : undefined;
			const finalTime = this.calculateDragPosition(rawDragTime, boundedDragTrack, clipDuration, excludeIndex);

			// Check if we're snapped to show guidelines
			this.updateSnapGuidelines(finalTime, boundedDragTrack, clipDuration, excludeIndex);

			// Show drag preview at final position
			this.timeline.showDragGhost(boundedDragTrack, finalTime);
		}

		// Emit drag event with calculated position
		const finalTime = dropZone
			? rawDragTime
			: this.calculateDragPosition(
					rawDragTime,
					boundedDragTrack,
					clipDuration,
					boundedDragTrack === this.dragInfo.trackIndex ? this.dragInfo.clipIndex : undefined
				);

		this.timeline.getEdit().events.emit("drag:moved", {
			...this.dragInfo,
			currentTime: finalTime,
			currentTrack: dropZone ? -1 : boundedDragTrack
		});
	}

	private completeDrag(event: PIXI.FederatedPointerEvent): void {
		if (!this.dragInfo) return;

		// Store drag info before ending drag
		const dragInfo = { ...this.dragInfo };

		// Get clip duration for final position calculations
		const clipConfig = this.timeline.getClipData(dragInfo.trackIndex, dragInfo.clipIndex);
		if (!clipConfig) {
			this.endDrag();
			return;
		}
		const clipDuration = clipConfig.length || 0;

		// Calculate drop position
		const localPos = this.timeline.getContainer().toLocal(event.global);
		const layout = this.timeline.getLayout();
		const rawDropTime = Math.max(0, layout.getTimeAtX(localPos.x - dragInfo.offsetX));
		// For drop zone detection, use raw Y position
		const dropZoneY = localPos.y;
		const dropY = localPos.y - dragInfo.offsetY;

		// Check if dropping in a drop zone using raw Y
		const dropZone = this.getDropZone(dropZoneY);

		// End drag to ensure visual cleanup happens first
		this.endDrag();

		if (dropZone) {
			// Use the CreateTrackAndMoveClipCommand for atomic operation
			const command = new CreateTrackAndMoveClipCommand(
				dropZone.position, // Insert track at this position
				dragInfo.trackIndex, // Source track
				dragInfo.clipIndex, // Source clip
				rawDropTime // New start time
			);
			this.timeline.getEdit().executeEditCommand(command);
		} else {
			// Normal drop on existing track - ensure within valid bounds
			const maxTrackIndex = this.timeline.getVisualTracks().length - 1;
			const dropTrack = Math.max(0, Math.min(maxTrackIndex, Math.floor(dropY / layout.trackHeight)));

			// Calculate final position with snapping and collision prevention
			const excludeIndex = dropTrack === dragInfo.trackIndex ? dragInfo.clipIndex : undefined;
			const finalTime = this.calculateDragPosition(rawDropTime, dropTrack, clipDuration, excludeIndex);

			const dropPosition = {
				track: dropTrack,
				time: finalTime,
				x: layout.getXAtTime(finalTime),
				y: layout.getYAtTrack(dropTrack)
			};

			// Only execute move if position actually changed
			const hasChanged = dropPosition.track !== dragInfo.trackIndex || Math.abs(dropPosition.time - dragInfo.startTime) > 0.01; // Small tolerance for floating point

			if (hasChanged) {
				// Use existing MoveClipCommand
				const command = new MoveClipCommand(
					dragInfo.trackIndex, // from track
					dragInfo.clipIndex, // from clip index
					dropPosition.track, // to track
					dropPosition.time // new start time
				);

				this.timeline.getEdit().executeEditCommand(command);
			}
		}
	}

	private endDrag(): void {
		this.dragInfo = null;

		// Hide drop zone indicator if showing
		this.hideDropZoneIndicator();

		// Hide snap guidelines
		this.hideSnapGuidelines();

		// Reset cursor
		this.timeline.getPixiApp().canvas.style.cursor = "default";

		// Emit drag ended event for visual feedback cleanup
		this.timeline.getEdit().events.emit("drag:ended", {});
	}

	private resetState(): void {
		this.state = InteractionState.IDLE;
		this.startPointerPos = null;
		this.currentClipInfo = null;
		this.dragInfo = null;
		this.resizeInfo = null;

		// Hide drop zone indicator if showing
		this.hideDropZoneIndicator();

		// Hide snap guidelines
		this.hideSnapGuidelines();

		// Reset cursor
		this.timeline.getPixiApp().canvas.style.cursor = "default";
	}

	private parseClipLabel(label: string): { trackIndex: number; clipIndex: number } | null {
		if (!label?.startsWith("clip-")) {
			return null;
		}

		const parts = label.split("-");
		if (parts.length !== 3) {
			return null;
		}

		const trackIndex = parseInt(parts[1], 10);
		const clipIndex = parseInt(parts[2], 10);

		if (Number.isNaN(trackIndex) || Number.isNaN(clipIndex)) {
			return null;
		}

		return { trackIndex, clipIndex };
	}

	public dispose(): void {
		this.deactivate();
	}

	// Resize-related methods
	private isOnClipRightEdge(clipInfo: { trackIndex: number; clipIndex: number }, event: PIXI.FederatedPointerEvent): boolean {
		const track = this.timeline.getVisualTracks()[clipInfo.trackIndex];
		if (!track) return false;

		const clip = track.getClip(clipInfo.clipIndex);
		if (!clip) return false;

		// Get the clip's right edge position in global coordinates
		const clipContainer = clip.getContainer();
		const clipBounds = clipContainer.getBounds();
		const rightEdgeX = clipBounds.x + clipBounds.width;

		// Check if mouse is within threshold of right edge
		const distance = Math.abs(event.global.x - rightEdgeX);
		return distance <= this.RESIZE_EDGE_THRESHOLD;
	}

	private startResize(clipInfo: { trackIndex: number; clipIndex: number }, event: PIXI.FederatedPointerEvent): void {
		const clipData = this.timeline.getClipData(clipInfo.trackIndex, clipInfo.clipIndex);
		if (!clipData) return;

		this.resizeInfo = {
			trackIndex: clipInfo.trackIndex,
			clipIndex: clipInfo.clipIndex,
			originalLength: clipData.length || 0,
			startX: event.global.x
		};

		this.state = InteractionState.RESIZING;

		// Set cursor to indicate resizing
		this.timeline.getPixiApp().canvas.style.cursor = "ew-resize";

		// Set visual feedback on the clip
		const track = this.timeline.getVisualTracks()[clipInfo.trackIndex];
		if (track) {
			const clip = track.getClip(clipInfo.clipIndex);
			if (clip) {
				clip.setResizing(true);
			}
		}
	}

	private updateResizePreview(event: PIXI.FederatedPointerEvent): void {
		if (!this.resizeInfo) return;

		// Calculate new duration based on mouse movement
		const deltaX = event.global.x - this.resizeInfo.startX;
		const pixelsPerSecond = this.timeline.getOptions().pixelsPerSecond || 50;
		const deltaTime = deltaX / pixelsPerSecond;
		const newLength = Math.max(0.1, this.resizeInfo.originalLength + deltaTime);

		// Update visual preview
		const track = this.timeline.getVisualTracks()[this.resizeInfo.trackIndex];
		if (track) {
			const clip = track.getClip(this.resizeInfo.clipIndex);
			if (clip) {
				const newWidth = newLength * pixelsPerSecond;
				clip.setPreviewWidth(newWidth);
			}
		}
	}

	private completeResize(event: PIXI.FederatedPointerEvent): void {
		if (!this.resizeInfo) return;

		// Calculate final duration
		const deltaX = event.global.x - this.resizeInfo.startX;
		const pixelsPerSecond = this.timeline.getOptions().pixelsPerSecond || 50;
		const deltaTime = deltaX / pixelsPerSecond;
		const newLength = Math.max(0.1, this.resizeInfo.originalLength + deltaTime);

		// Clear visual preview first
		const track = this.timeline.getVisualTracks()[this.resizeInfo.trackIndex];
		if (track) {
			const clip = track.getClip(this.resizeInfo.clipIndex);
			if (clip) {
				clip.setResizing(false);
				clip.setPreviewWidth(null);
			}
		}

		// Execute resize command if length changed significantly
		if (Math.abs(newLength - this.resizeInfo.originalLength) > 0.01) {
			const command = new ResizeClipCommand(this.resizeInfo.trackIndex, this.resizeInfo.clipIndex, newLength);
			this.timeline.getEdit().executeEditCommand(command);
		}
	}

	private updateCursorForPosition(event: PIXI.FederatedPointerEvent): void {
		const target = event.target as PIXI.Container;

		if (target.label) {
			const clipInfo = this.parseClipLabel(target.label);
			if (clipInfo && this.isOnClipRightEdge(clipInfo, event)) {
				this.timeline.getPixiApp().canvas.style.cursor = "ew-resize";
				return;
			}
		}

		// Default cursor
		this.timeline.getPixiApp().canvas.style.cursor = "default";
	}

	private getDropZone(y: number): { type: "above" | "between" | "below"; position: number } | null {
		const {trackHeight} = this.timeline.getLayout();
		const tracks = this.timeline.getVisualTracks();
		const threshold = this.DROP_ZONE_THRESHOLD;

		// Check each potential insertion point (0 to tracks.length)
		for (let i = 0; i <= tracks.length; i += 1) {
			const boundaryY = i * trackHeight;
			if (Math.abs(y - boundaryY) < threshold) {
				return {
					type: (() => {
						if (i === 0) return "above";
						if (i === tracks.length) return "below";
						return "between";
					})(),
					position: i
				};
			}
		}

		return null; // Not near any boundary
	}

	private showDropZoneIndicator(position: number): void {
		// Remove existing indicator if any
		this.hideDropZoneIndicator();

		// Create new indicator
		this.dropZoneIndicator = new PIXI.Graphics();

		const layout = this.timeline.getLayout();
		const width = this.timeline.getExtendedTimelineWidth();
		// Position at the border between tracks (position 0 = top of first track)
		const y = position * layout.trackHeight;

		// Draw a highlighted line with some thickness using theme color
		const trackInsertionColor = this.theme.colors.interaction.trackInsertion;
		this.dropZoneIndicator.setStrokeStyle({ width: 4, color: trackInsertionColor, alpha: 0.8 });
		this.dropZoneIndicator.moveTo(0, y);
		this.dropZoneIndicator.lineTo(width, y);
		this.dropZoneIndicator.stroke();

		// Add a subtle glow effect
		this.dropZoneIndicator.setStrokeStyle({ width: 8, color: trackInsertionColor, alpha: 0.3 });
		this.dropZoneIndicator.moveTo(0, y);
		this.dropZoneIndicator.lineTo(width, y);
		this.dropZoneIndicator.stroke();

		// Add to viewport (not overlay) so it scrolls with content
		this.timeline.getContainer().addChild(this.dropZoneIndicator);
	}

	private hideDropZoneIndicator(): void {
		if (this.dropZoneIndicator) {
			// Clear the graphics first
			this.dropZoneIndicator.clear();

			// Ensure it's actually removed from parent
			if (this.dropZoneIndicator.parent) {
				this.dropZoneIndicator.parent.removeChild(this.dropZoneIndicator);
			}

			// Destroy the graphics object
			this.dropZoneIndicator.destroy();
			this.dropZoneIndicator = null;
		}
		this.currentDropZone = null;
	}

	// Snap guidelines visualization
	private updateSnapGuidelines(time: number, dragTrack: number, clipDuration: number, excludeClipIndex?: number): void {
		const alignedTimes = this.findAlignedTimes(time, clipDuration, dragTrack, excludeClipIndex);

		if (alignedTimes.length > 0) {
			this.showSnapGuidelines(alignedTimes);
		} else {
			this.hideSnapGuidelines();
		}
	}

	private findAlignedTimes(
		clipStart: number,
		clipDuration: number,
		currentTrack: number,
		excludeClipIndex?: number
	): Array<{
		time: number;
		tracks: number[];
		isPlayhead: boolean;
	}> {
		const SNAP_THRESHOLD = 0.1;
		const clipEnd = clipStart + clipDuration;
		const alignments = new Map<number, { tracks: Set<number>; isPlayhead: boolean }>();

		// Check all tracks for alignments
		this.timeline.getVisualTracks().forEach((track, trackIdx) => {
			track.getClips().forEach((clip, clipIdx) => {
				if (trackIdx === currentTrack && clipIdx === excludeClipIndex) return;

				const config = clip.getClipConfig();
				if (!config) return;

				const otherStart = config.start || 0;
				const otherEnd = otherStart + (config.length || 0);

				// Check alignments
				[
					{ time: otherStart, aligns: [clipStart, clipEnd] },
					{ time: otherEnd, aligns: [clipStart, clipEnd] }
				].forEach(({ time, aligns }) => {
					if (aligns.some(t => Math.abs(t - time) < SNAP_THRESHOLD)) {
						if (!alignments.has(time)) {
							alignments.set(time, { tracks: new Set(), isPlayhead: false });
						}
						alignments.get(time)!.tracks.add(trackIdx);
					}
				});
			});
		});

		// Check playhead alignment
		const playheadTime = this.timeline.getPlayheadTime();
		if (Math.abs(clipStart - playheadTime) < SNAP_THRESHOLD || Math.abs(clipEnd - playheadTime) < SNAP_THRESHOLD) {
			if (!alignments.has(playheadTime)) {
				alignments.set(playheadTime, { tracks: new Set(), isPlayhead: true });
			}
			alignments.get(playheadTime)!.isPlayhead = true;
		}

		// Convert to array format
		return Array.from(alignments.entries()).map(([time, data]) => ({
			time,
			tracks: Array.from(data.tracks).concat(currentTrack),
			isPlayhead: data.isPlayhead
		}));
	}

	private showSnapGuidelines(
		alignedTimes: Array<{
			time: number;
			tracks: number[];
			isPlayhead: boolean;
		}>
	): void {
		this.hideSnapGuidelines();

		this.snapGuidelines = new PIXI.Graphics();
		const layout = this.timeline.getLayout();
		const {trackHeight} = layout;

		// Draw each guideline
		alignedTimes.forEach(({ time, tracks, isPlayhead }) => {
			const x = layout.getXAtTime(time);
			const minTrack = Math.min(...tracks);
			const maxTrack = Math.max(...tracks);

			// Calculate guideline bounds
			const startY = minTrack * trackHeight;
			const endY = (maxTrack + 1) * trackHeight;

			// Choose color based on type using theme
			const color = isPlayhead ? 
				this.theme.colors.interaction.playhead : 
				this.theme.colors.interaction.snapGuide;

			// Draw with glow effect
			this.drawGuideline(x, startY, endY, color);
		});

		// Add to container
		this.timeline.getContainer().addChild(this.snapGuidelines);
	}

	private drawGuideline(x: number, startY: number, endY: number, color: number): void {
		if (!this.snapGuidelines) return;

		// Glow effect
		this.snapGuidelines.setStrokeStyle({ width: 3, color, alpha: 0.3 });
		this.snapGuidelines.moveTo(x, startY);
		this.snapGuidelines.lineTo(x, endY);
		this.snapGuidelines.stroke();

		// Core line
		this.snapGuidelines.setStrokeStyle({ width: 1, color, alpha: 0.8 });
		this.snapGuidelines.moveTo(x, startY);
		this.snapGuidelines.lineTo(x, endY);
		this.snapGuidelines.stroke();
	}

	private hideSnapGuidelines(): void {
		if (this.snapGuidelines) {
			if (this.snapGuidelines.parent) {
				this.snapGuidelines.parent.removeChild(this.snapGuidelines);
			}
			this.snapGuidelines.destroy();
			this.snapGuidelines = null;
		}
	}

	// Unified method for calculating drag position with snapping and collision prevention
	private calculateDragPosition(time: number, trackIndex: number, clipDuration: number, excludeClipIndex?: number): number {
		// First apply snapping
		const snapResult = this.getSnapPosition(time, trackIndex, clipDuration);

		// Then ensure no overlaps
		const validPosition = this.getValidDropPosition(snapResult.time, clipDuration, trackIndex, excludeClipIndex);

		return validPosition.validTime;
	}

	// Snap-related methods
	private getAllSnapPoints(
		currentTrackIndex: number,
		excludeClipIndex?: number
	): Array<{
		time: number;
		type: "clip-start" | "clip-end" | "playhead";
		trackIndex?: number;
		clipIndex?: number;
	}> {
		const snapPoints: Array<{
			time: number;
			type: "clip-start" | "clip-end" | "playhead";
			trackIndex?: number;
			clipIndex?: number;
		}> = [];

		// Get clips from ALL tracks for cross-track alignment
		const tracks = this.timeline.getVisualTracks();
		tracks.forEach((track, trackIdx) => {
			const clips = track.getClips();
			clips.forEach((clip, clipIdx) => {
				// Skip the clip being dragged
				if (trackIdx === currentTrackIndex && clipIdx === excludeClipIndex) return;

				const clipConfig = clip.getClipConfig();
				if (clipConfig) {
					snapPoints.push({
						time: clipConfig.start || 0,
						type: "clip-start",
						trackIndex: trackIdx,
						clipIndex: clipIdx
					});
					snapPoints.push({
						time: (clipConfig.start || 0) + (clipConfig.length || 0),
						type: "clip-end",
						trackIndex: trackIdx,
						clipIndex: clipIdx
					});
				}
			});
		});

		// Add playhead position
		const playheadTime = this.timeline.getPlayheadTime();
		snapPoints.push({ time: playheadTime, type: "playhead" });

		return snapPoints;
	}

	// Get snap points only from the target track (for same-track operations)
	private getSnapPoints(trackIndex: number, excludeClipIndex?: number): Array<{ time: number; type: "clip-start" | "clip-end" | "playhead" }> {
		return this.getAllSnapPoints(trackIndex, excludeClipIndex)
			.filter(point => point.trackIndex === undefined || point.trackIndex === trackIndex)
			.map(({ time, type }) => ({ time, type }));
	}

	private getSnapPosition(
		dragTime: number,
		dragTrack: number,
		draggedClipDuration: number
	): {
		time: number;
		snapped: boolean;
		snapType?: "clip-start" | "clip-end" | "playhead";
	} {
		const pixelsPerSecond = this.timeline.getOptions().pixelsPerSecond || 50;
		const snapThresholdTime = TimelineInteraction.SNAP_THRESHOLD / pixelsPerSecond;

		// Get all potential snap points for this track
		const snapPoints = this.getSnapPoints(dragTrack, this.dragInfo?.clipIndex);

		// Check snap points for both clip start and clip end
		let closestSnap: { time: number; type: "clip-start" | "clip-end" | "playhead"; distance: number } | null = null;

		for (const snapPoint of snapPoints) {
			// Check snap for clip start
			const startDistance = Math.abs(dragTime - snapPoint.time);
			if (startDistance < snapThresholdTime) {
				if (!closestSnap || startDistance < closestSnap.distance) {
					closestSnap = { time: snapPoint.time, type: snapPoint.type, distance: startDistance };
				}
			}

			// Check snap for clip end
			const endDistance = Math.abs(dragTime + draggedClipDuration - snapPoint.time);
			if (endDistance < snapThresholdTime) {
				if (!closestSnap || endDistance < closestSnap.distance) {
					// Adjust time so clip end aligns with snap point
					closestSnap = {
						time: snapPoint.time - draggedClipDuration,
						type: snapPoint.type,
						distance: endDistance
					};
				}
			}
		}

		if (closestSnap) {
			return { time: closestSnap.time, snapped: true, snapType: closestSnap.type };
		}

		return { time: dragTime, snapped: false };
	}

	private getValidDropPosition(
		time: number,
		duration: number,
		trackIndex: number,
		excludeClipIndex?: number
	): {
		validTime: number;
		wouldOverlap: boolean;
	} {
		const track = this.timeline.getVisualTracks()[trackIndex];
		if (!track) return { validTime: time, wouldOverlap: false };

		// Get all clips except the one being dragged
		const otherClips = track
			.getClips()
			.map((clip, index) => ({ clip, index }))
			.filter(({ index }) => index !== excludeClipIndex)
			.map(({ clip }) => {
				const config = clip.getClipConfig();
				return config
					? {
							start: config.start || 0,
							end: (config.start || 0) + (config.length || 0)
						}
					: null;
			})
			.filter((clip): clip is { start: number; end: number } => clip !== null)
			.sort((a, b) => a.start - b.start);

		// Find the first overlap
		const dragEnd = time + duration;
		const overlap = otherClips.find(
			clip => !(dragEnd <= clip.start || time >= clip.end) // Not if completely before or after
		);

		if (!overlap) {
			return { validTime: time, wouldOverlap: false };
		}

		// Find nearest valid position
		const beforeGap = overlap.start - duration;
		const afterGap = overlap.end;

		// Choose position closest to original intent
		const validTime = Math.abs(time - beforeGap) < Math.abs(time - afterGap) && beforeGap >= 0 ? beforeGap : afterGap;

		// Recursively check if new position is valid
		const recursiveCheck = this.getValidDropPosition(validTime, duration, trackIndex, excludeClipIndex);

		return {
			validTime: recursiveCheck.validTime,
			wouldOverlap: true
		};
	}
}
