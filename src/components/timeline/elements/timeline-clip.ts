import { Entity } from "@shared/entity";
import { getAssetColor, TIMELINE_CONFIG } from "@timeline/timeline-config";
import type { TimelineClipData, AssetType } from "@timeline/timeline-types";
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

	private background: pixi.Graphics | null;
	private label: pixi.Text | null;

	// Event handlers
	public onClipClick?: (trackIndex: number, clipIndex: number, event: pixi.FederatedPointerEvent) => void;

	constructor(
		clipData: TimelineClipData,
		trackHeight: number,
		scrollPosition: number,
		pixelsPerSecond: number,
		selectedClipId: string | null,
		trackIndex: number,
		clipIndex: number
	) {
		super();
		this.clipData = clipData;
		this.trackHeight = trackHeight;
		this.scrollPosition = scrollPosition;
		this.pixelsPerSecond = pixelsPerSecond;
		this.selectedClipId = selectedClipId;
		this.trackIndex = trackIndex;
		this.clipIndex = clipIndex;

		this.background = null;
		this.label = null;
	}

	public override async load(): Promise<void> {
		this.background = new pixi.Graphics();
		this.getContainer().addChild(this.background);

		this.setupInteraction();
		this.draw();
	}

	public override update(_: number, __: number): void {}

	public override draw(): void {
		if (!this.background) return;

		const clipId = this.getClipId(this.clipIndex);
		const isSelected = this.selectedClipId === clipId;

		const clipX = this.clipData.start * this.pixelsPerSecond - this.scrollPosition;
		const clipWidth = this.clipData.length * this.pixelsPerSecond;

		this.getContainer().position.x = clipX;

		this.background.clear();

		// Use different style for selected clips
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

		this.background.alpha = 1.0;

		this.background.rect(0, 0, clipWidth, this.trackHeight);
		this.background.fill();

		// Add/update label if there's enough space
		this.updateLabel(clipWidth, isSelected);
	}

	public override dispose(): void {
		// Remove event listeners first to prevent memory leaks
		this.getContainer().removeAllListeners();
		this.getContainer().eventMode = "none";

		// Clear event handler references
		this.onClipClick = undefined;

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
	}

	// Public methods for timeline control
	public updateScrollPosition(scrollPosition: number): void {
		this.scrollPosition = scrollPosition;
		this.draw();
	}

	public updatePixelsPerSecond(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.draw();
	}

	public updateSelectedClipId(selectedClipId: string | null): void {
		this.selectedClipId = selectedClipId;
		this.draw();
	}

	private setupInteraction(): void {
		this.getContainer().eventMode = "static";
		this.getContainer().cursor = "pointer";

		this.getContainer().on("pointerdown", (event: pixi.FederatedPointerEvent) => {
			// Stop event from propagating up to prevent timeline click
			event.stopPropagation();

			// Always treat as a click
			if (this.onClipClick) {
				this.onClipClick(this.trackIndex, this.clipIndex, event);
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
			this.label = new pixi.Text({
				text: this.getClipLabel(this.clipData),
				style: {
					fontSize: 10,
					fill: textColor,
					fontWeight: isSelected ? "bold" : "normal"
				}
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
}
