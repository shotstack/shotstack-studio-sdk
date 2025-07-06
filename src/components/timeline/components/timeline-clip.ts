import { Entity } from "@shared/entity";
import { TimelineDragManager } from "@timeline/drag";
import { getAssetColor, TIMELINE_CONFIG } from "@timeline/timeline-config";
import type { TimelineClipData, AssetType, TimelineTrackData } from "@timeline/timeline-types";
import { isTextAsset, hasSourceUrl } from "@timeline/timeline-types";
import * as pixi from "pixi.js";

export class TimelineClip extends Entity {
	private clipData: TimelineClipData;
	private trackHeight: number;
	private scrollPosition: number;
	private pixelsPerSecond: number;
	private selectedClipId: string | null;
	private trackIndex: number;
	private clipIndex: number;
	private trackData: TimelineTrackData;

	private background: pixi.Graphics | null;
	private label: pixi.Text | null;
	private ghostClip: pixi.Graphics | null;

	// Resize drag state management
	private isDragging: boolean = false;
	private initialMouseX: number = 0;
	private initialClipLength: number = 0;
	private dragStartPosition: { x: number; y: number } = { x: 0, y: 0 };
	private pendingUpdate: boolean = false;
	private lastPointerEvent: PointerEvent | null = null;

	// Drag manager
	private dragManager: TimelineDragManager | null = null;

	// Visual preview state
	private previewLength: number = 0;
	private isShowingPreview: boolean = false;
	private previewStart: number = 0;
	private isShowingClipPreview: boolean = false;
	private lastDrawnLength: number = 0; // Cache for draw optimization
	private lastDrawnStart: number = 0; // Cache for position optimization

	// Event handlers
	public onClipClick?: (clipData: TimelineClipData, event: pixi.FederatedPointerEvent) => void;
	public onClipResize?: (trackIndex: number, clipIndex: number, newLength: number, initialLength: number) => void;
	public onClipDrag?: (trackIndex: number, clipIndex: number, newStart: number, initialStart: number) => void;

	constructor(
		clipData: TimelineClipData,
		trackHeight: number,
		scrollPosition: number,
		pixelsPerSecond: number,
		selectedClipId: string | null,
		trackIndex: number,
		clipIndex: number,
		trackData: TimelineTrackData
	) {
		super();
		this.clipData = clipData;
		this.trackHeight = trackHeight;
		this.scrollPosition = scrollPosition;
		this.pixelsPerSecond = pixelsPerSecond;
		this.selectedClipId = selectedClipId;
		this.trackIndex = trackIndex;
		this.clipIndex = clipIndex;
		this.trackData = trackData;

		this.background = null;
		this.label = null;
		this.ghostClip = null;
	}

	public override async load(): Promise<void> {
		this.background = new pixi.Graphics();
		this.getContainer().addChild(this.background);

		this.ghostClip = new pixi.Graphics();
		this.getContainer().addChild(this.ghostClip);

		this.setupInteraction();
		this.draw();
	}

	public override update(_: number, __: number): void {
		// Clips are relatively static, only redraw when needed
	}

	public override draw(): void {
		if (!this.background) return;

		const clipId = this.getClipId(this.clipIndex);
		const isSelected = this.selectedClipId === clipId;

		// Use preview start position during drag, otherwise use actual start
		const actualStart = this.isShowingClipPreview ? this.previewStart : this.clipData.start;
		const clipX = actualStart * this.pixelsPerSecond - this.scrollPosition;

		// Use preview length during resize drag, otherwise use actual length
		const actualLength = this.isShowingPreview ? this.previewLength : this.clipData.length;
		const clipWidth = actualLength * this.pixelsPerSecond;

		// Optimize: Skip redraw if neither position nor length have changed
		if (actualLength === this.lastDrawnLength && actualStart === this.lastDrawnStart && !this.background.destroyed) {
			return;
		}
		this.lastDrawnLength = actualLength;
		this.lastDrawnStart = actualStart;

		this.getContainer().position.x = clipX;

		this.background.clear();

		// Use different style for selected clips and drag states
		if (isSelected) {
			// Draw selection border first (slightly larger than the clip)
			this.background.strokeStyle = { color: TIMELINE_CONFIG.colors.selectionBorder, width: 2 };
			this.background.rect(-1, -1, clipWidth + 2, this.trackHeight - 2);
			this.background.stroke();

			// Brighter background for selected clips
			this.background.fillStyle = { color: this.getClipColor(this.clipData.asset.type, true) };
		} else {
			this.background.fillStyle = { color: this.getClipColor(this.clipData.asset.type, false) };
		}

		// Apply drag state visual feedback
		if (this.dragManager && this.dragManager.isDragging()) {
			// Semi-transparent during drag to show it's being moved
			this.background.alpha = 0.7;
		} else {
			this.background.alpha = 1.0;
		}

		this.background.rect(0, 0, clipWidth, this.trackHeight);
		this.background.fill();

		// Draw ghost clip at original position during drag
		this.drawGhostClip();

		// Add/update label if there's enough space
		this.updateLabel(clipWidth, isSelected);
	}

	public override dispose(): void {
		// Clean up any active drag operations
		if (this.isDragging) {
			this.cancelResizeDrag();
		}
		if (this.dragManager && this.dragManager.isDragging()) {
			this.dragManager.cancelDrag();
		}

		// Remove event listeners first to prevent memory leaks
		this.getContainer().removeAllListeners();
		this.getContainer().eventMode = "none";

		// Clear event handler references
		this.onClipClick = undefined;
		this.onClipResize = undefined;
		this.onClipDrag = undefined;

		// Dispose of PIXI objects with proper cleanup
		if (this.background) {
			if (this.background.parent) {
				this.background.parent.removeChild(this.background);
			}
			this.background.destroy({ children: true });
			this.background = null;
		}

		if (this.label) {
			if (this.label.parent) {
				this.label.parent.removeChild(this.label);
			}
			this.label.destroy({ children: true });
			this.label = null;
		}

		if (this.ghostClip) {
			if (this.ghostClip.parent) {
				this.ghostClip.parent.removeChild(this.ghostClip);
			}
			this.ghostClip.destroy({ children: true });
			this.ghostClip = null;
		}
	}

	// Public methods for timeline control
	public updateScrollPosition(scrollPosition: number): void {
		this.scrollPosition = scrollPosition;
		this.lastDrawnLength = 0; // Reset draw cache for position changes
		this.lastDrawnStart = 0; // Reset position cache
		this.draw();
	}

	public updatePixelsPerSecond(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.lastDrawnLength = 0; // Reset draw cache for zoom changes
		this.lastDrawnStart = 0; // Reset position cache
		this.draw();
	}

	public updateSelectedClipId(selectedClipId: string | null): void {
		this.selectedClipId = selectedClipId;
		this.lastDrawnLength = 0; // Reset draw cache for selection changes
		this.lastDrawnStart = 0; // Reset position cache
		this.draw();
	}

	public updateClipData(clipData: TimelineClipData): void {
		this.clipData = clipData;
		this.lastDrawnLength = 0; // Reset draw cache
		this.lastDrawnStart = 0; // Reset position cache
		this.draw();
	}

	public setDragManager(dragManager: TimelineDragManager): void {
		this.dragManager = dragManager;
	}

	private setupInteraction(): void {
		this.getContainer().eventMode = "static";
		this.getContainer().cursor = "pointer";

		// Add hover event for cursor management
		this.getContainer().on("pointerover", (event: pixi.FederatedPointerEvent) => {
			this.updateCursor(event);
		});

		this.getContainer().on("pointermove", (event: pixi.FederatedPointerEvent) => {
			this.updateCursor(event);
		});

		this.getContainer().on("pointerout", () => {
			this.getContainer().cursor = "pointer";
		});

		this.getContainer().on("pointerdown", (event: pixi.FederatedPointerEvent) => {
			// Stop event from propagating up to prevent timeline click
			event.stopPropagation();

			const localPos = event.getLocalPosition(this.getContainer());

			// Check if we're starting a resize drag
			if (this.isInResizeZone(localPos.x)) {
				this.startResizeDrag(event);
			} else if (this.dragManager) {
				// Check if it's a drag operation (distinguish from selection click)
				this.dragManager.startHorizontalDrag(event, this.clipData, this.trackData, this.trackIndex, this.clipIndex, this.pixelsPerSecond, {
					onPreviewUpdate: start => this.updateClipPreview(start),
					onDragComplete: (newStart, initialStart) => {
						this.isShowingClipPreview = false;
						this.previewStart = 0;
						this.draw();
						const hasChanges = newStart !== initialStart;
						if (hasChanges && this.onClipDrag) {
							this.onClipDrag(this.trackIndex, this.clipIndex, newStart, initialStart);
						} else if (!hasChanges && this.onClipClick) {
							// If no significant movement, treat as a click
							this.onClipClick(this.clipData, event);
						}
					},
					onDragCancel: () => {
						this.isShowingClipPreview = false;
						this.previewStart = 0;
						this.draw();
					}
				});
			}
		});
	}

	private updateLabel(clipWidth: number, isSelected: boolean): void {
		// Remove existing label
		if (this.label) {
			this.getContainer().removeChild(this.label);
			this.label.destroy();
			this.label = null;
		}

		// Add label if there's enough space
		if (clipWidth > 40) {
			const textColor = isSelected ? TIMELINE_CONFIG.colors.textPrimary : TIMELINE_CONFIG.colors.textSecondary;
			this.label = new pixi.Text(this.getClipLabel(this.clipData), {
				fontSize: 10,
				fill: textColor,
				fontWeight: isSelected ? "bold" : "normal"
			});

			this.label.position.set(5, this.trackHeight / 2 - this.label.height / 2);
			this.getContainer().addChild(this.label);
		}
	}

	private getClipColor(assetType: AssetType, isSelected: boolean = false): number {
		return getAssetColor(assetType, isSelected);
	}

	private getClipLabel(clipData: TimelineClipData): string {
		if (isTextAsset(clipData.asset)) {
			return clipData.asset.text.substring(0, 20);
		}

		if (hasSourceUrl(clipData.asset)) {
			const filename = clipData.asset.src.substring(clipData.asset.src.lastIndexOf("/") + 1);
			return filename.substring(0, 20);
		}

		return clipData.asset.type;
	}

	private getClipId(clipIndex: number): string {
		return `track${this.trackIndex}-clip${clipIndex}`;
	}

	private calculateMaxAllowedLength(): number {
		const currentClipStart = this.clipData.start;
		const currentClipEnd = currentClipStart + this.clipData.length;

		// Edge case: If no track data or no clips, return default max
		if (!this.trackData || !this.trackData.clips || this.trackData.clips.length === 0) {
			return 300;
		}

		// Performance optimization: Early exit if only one clip (current clip)
		if (this.trackData.clips.length === 1) {
			return 300;
		}

		// Find the next clip that would collide
		let nextClipStart = Infinity;
		const epsilon = 0.001; // Small tolerance for floating point comparisons

		// Performance optimization: Check clips in order and break early when possible
		for (let i = 0; i < this.trackData.clips.length; i += 1) {
			const clip = this.trackData.clips[i];

			// Skip the current clip (same index or same start time)
			if (i === this.clipIndex || clip.start === this.clipData.start) {
				// Skip to next iteration
			} else if (clip.start < currentClipEnd - epsilon) {
				// Performance optimization: Skip clips that start before current clip ends
			} else if (clip.start < nextClipStart) {
				// Found a clip that starts after current clip ends
				nextClipStart = clip.start;

				// Performance optimization: If clips are sorted by start time,
				// we could break here, but we can't assume sorting
				// For now, continue to find the absolute nearest clip
			}
		}

		// Edge case: No subsequent clips found - use default max length
		if (nextClipStart === Infinity) {
			return 300;
		}

		// Edge case: Ensure we don't return negative or zero lengths
		const maxLength = Math.max(0.1, nextClipStart - currentClipStart);

		// Edge case: Cap at reasonable maximum to prevent extreme values
		return Math.min(maxLength, 300);
	}

	private isInResizeZone(localX: number): boolean {
		// Use preview length during resize drag, otherwise use actual length
		const actualLength = this.isShowingPreview ? this.previewLength : this.clipData.length;
		const clipWidth = actualLength * this.pixelsPerSecond;

		// Adaptive resize zone for very small clips
		const baseResizeZoneWidth = 8; // 8px resize zone as specified in PRD
		const minResizeZoneWidth = 4; // Minimum resize zone for very small clips
		const maxResizeZoneRatio = 0.3; // Max 30% of clip width can be resize zone

		const maxResizeZoneByRatio = clipWidth * maxResizeZoneRatio;
		const resizeZoneWidth = Math.max(minResizeZoneWidth, Math.min(baseResizeZoneWidth, maxResizeZoneByRatio));

		return localX >= clipWidth - resizeZoneWidth;
	}

	private updateCursor(event: pixi.FederatedPointerEvent): void {
		if (this.isDragging || (this.dragManager && this.dragManager.isDragging())) {
			return; // Don't change cursor during drag operations
		}

		const localPos = event.getLocalPosition(this.getContainer());
		this.getContainer().cursor = this.isInResizeZone(localPos.x) ? "ew-resize" : "grab";
	}

	private startResizeDrag(event: pixi.FederatedPointerEvent): void {
		if (this.isDragging) return; // Prevent multiple drag sessions

		this.isDragging = true;
		const globalPos = event.global;
		this.dragStartPosition = { x: globalPos.x, y: globalPos.y };
		this.initialMouseX = globalPos.x;
		this.initialClipLength = this.clipData.length;

		// Set pointer capture for reliable tracking
		try {
			const pointerId = (event.nativeEvent as PointerEvent)?.pointerId;
			const container = this.getContainer() as any;
			const { canvas } = container;
			if (pointerId !== undefined && canvas && canvas.setPointerCapture) {
				canvas.setPointerCapture(pointerId);
			}
		} catch (e) {
			// Fallback if pointer capture fails
			console.warn("Pointer capture not available, using fallback tracking");
		}

		// Set up global event listeners for drag
		document.addEventListener("pointermove", this.handleResizeDrag, { passive: false });
		document.addEventListener("pointerup", this.handleResizeDragEnd, { passive: false });
		document.addEventListener("pointercancel", this.handleResizeDragEnd, { passive: false });
		document.addEventListener("keydown", this.handleResizeDragKeyDown);

		// Change cursor globally during drag
		document.body.style.cursor = "ew-resize";

		// Prevent text selection during drag
		document.body.style.userSelect = "none";
	}

	private handleResizeDrag = (event: PointerEvent): void => {
		if (!this.isDragging) return;

		// Only handle primary pointer to avoid multi-touch issues
		if (!event.isPrimary) return;

		// Store the latest event for RAF processing
		this.lastPointerEvent = event;

		// Use RAF for smooth updates instead of simple throttling
		if (!this.pendingUpdate) {
			this.pendingUpdate = true;
			requestAnimationFrame(this.processResizeDrag);
		}
	};

	private processResizeDrag = (): void => {
		this.pendingUpdate = false;

		if (!this.isDragging || !this.lastPointerEvent) return;

		const event = this.lastPointerEvent;

		// Enhanced boundary check - handle timeline edges and extreme positions
		const screenWidth = window.innerWidth;
		const timelineLeft = 0; // Timeline left edge
		const timelineRight = screenWidth; // Timeline right edge

		// Allow some tolerance outside screen but prevent extreme values
		if (event.clientX < timelineLeft - 200 || event.clientX > timelineRight + 200) {
			// Don't process drag if pointer is too far outside timeline
			return;
		}

		// Calculate absolute delta from initial mouse position
		const absoluteDeltaX = event.clientX - this.initialMouseX;

		// Calculate relative delta from drag start position (for future use)
		// const relativeDeltaX = event.clientX - this.dragStartPosition.x;

		// Convert pixel delta to time delta using current pixelsPerSecond
		// Handle coordinate space transformations for zoom/scroll scenarios
		const effectivePixelsPerSecond = Math.max(0.1, this.pixelsPerSecond); // Prevent division by zero
		const timeDelta = absoluteDeltaX / effectivePixelsPerSecond;

		// Calculate new length with constraints that scale with zoom level
		const proposedLength = this.initialClipLength + timeDelta;
		const minLength = 0.1; // Minimum 0.1 seconds as per PRD
		const maxLength = 300; // Maximum 5 minutes to prevent extreme values

		// Apply additional constraints for extreme zoom levels
		const minPixelWidth = 20; // Minimum 20 pixels wide for usability
		const minLengthForZoom = minPixelWidth / this.pixelsPerSecond;
		const effectiveMinLength = Math.max(minLength, minLengthForZoom);

		// Apply collision detection - get maximum allowed length before hitting next clip
		const maxLengthByCollision = this.calculateMaxAllowedLength();

		// Use the most restrictive constraint
		const finalMaxLength = Math.min(maxLength, maxLengthByCollision);

		const newLength = Math.max(effectiveMinLength, Math.min(finalMaxLength, proposedLength));

		// Update visual preview without modifying actual clip data
		this.updateResizePreview(newLength);
	};

	private handleResizeDragKeyDown = (event: KeyboardEvent): void => {
		if (!this.isDragging) return;

		// Cancel drag on ESC key
		if (event.key === "Escape") {
			this.cancelResizeDrag();
		}
	};

	private cancelResizeDrag(): void {
		if (!this.isDragging) return;

		this.isDragging = false;

		// Clean up global event listeners
		document.removeEventListener("pointermove", this.handleResizeDrag);
		document.removeEventListener("pointerup", this.handleResizeDragEnd);
		document.removeEventListener("pointercancel", this.handleResizeDragEnd);
		document.removeEventListener("keydown", this.handleResizeDragKeyDown);

		// Clean up RAF state
		this.pendingUpdate = false;
		this.lastPointerEvent = null;

		// Restore cursor and user selection
		document.body.style.cursor = "";
		document.body.style.userSelect = "";

		// Reset preview state and redraw to show actual clip length (no commit)
		this.isShowingPreview = false;
		this.previewLength = 0;
		this.draw();

		console.log("Resize drag cancelled");
	}

	private handleResizeDragEnd = (): void => {
		if (!this.isDragging) return;

		// Store the final preview length before cleanup
		const finalLength = this.previewLength;
		const hasChanges = this.isShowingPreview && finalLength !== this.clipData.length;

		this.isDragging = false;

		// Clean up global event listeners
		document.removeEventListener("pointermove", this.handleResizeDrag);
		document.removeEventListener("pointerup", this.handleResizeDragEnd);
		document.removeEventListener("pointercancel", this.handleResizeDragEnd);
		document.removeEventListener("keydown", this.handleResizeDragKeyDown);

		// Clean up RAF state
		this.pendingUpdate = false;
		this.lastPointerEvent = null;

		// Restore cursor and user selection
		document.body.style.cursor = "";
		document.body.style.userSelect = "";

		// Reset preview state and redraw to show actual clip length
		this.isShowingPreview = false;
		this.previewLength = 0;
		this.draw();

		// Commit the resize operation if there were changes
		if (hasChanges && this.onClipResize) {
			this.onClipResize(this.trackIndex, this.clipIndex, finalLength, this.initialClipLength);
		}
	};

	private updateResizePreview(newLength: number): void {
		// Update preview state
		this.previewLength = newLength;
		this.isShowingPreview = true;

		// Redraw clip with new visual preview
		this.draw();
	}

	private updateClipPreview(newStart: number): void {
		// Update preview state
		this.previewStart = newStart;
		this.isShowingClipPreview = true;

		// Redraw clip with new visual preview
		this.draw();
	}

	private drawGhostClip(): void {
		if (!this.ghostClip || !(this.dragManager && this.dragManager.isDragging())) {
			// Hide ghost clip when not dragging
			if (this.ghostClip) {
				this.ghostClip.clear();
			}
			return;
		}

		this.ghostClip.clear();

		// Calculate original position
		const originalX = this.clipData.start * this.pixelsPerSecond - this.scrollPosition;
		const clipWidth = this.clipData.length * this.pixelsPerSecond;

		// Position ghost at original location (relative to current container position)
		const currentX = this.getContainer().position.x;
		const ghostX = originalX - currentX;

		// Draw ghost clip with dashed border and low opacity
		this.ghostClip.strokeStyle = {
			color: TIMELINE_CONFIG.colors.selectionBorder,
			width: 1,
			alpha: 0.5
		};

		// Create dashed line effect by drawing multiple small rectangles
		const dashLength = 4;
		const gapLength = 4;
		const totalLength = dashLength + gapLength;
		const dashCount = Math.ceil(clipWidth / totalLength);

		for (let i = 0; i < dashCount; i += 1) {
			const dashStart = i * totalLength;
			const dashEnd = Math.min(dashStart + dashLength, clipWidth);

			if (dashEnd > dashStart) {
				this.ghostClip.rect(ghostX + dashStart, 0, dashEnd - dashStart, this.trackHeight);
			}
		}

		this.ghostClip.stroke();

		// Add semi-transparent fill
		this.ghostClip.fillStyle = {
			color: this.getClipColor(this.clipData.asset.type, false),
			alpha: 0.2
		};
		this.ghostClip.rect(ghostX, 0, clipWidth, this.trackHeight);
		this.ghostClip.fill();
	}
}
