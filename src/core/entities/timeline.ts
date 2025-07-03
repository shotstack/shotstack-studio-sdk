import { Entity } from "@entities/base/entity";
import { Edit } from "@entities/system/edit";
import { type Size } from "@layouts/geometry";
import * as pixi from "pixi.js";



export class Timeline extends Entity {
	private edit: Edit;
	private width: number;
	private height: number;
	public readonly application: pixi.Application;

	// Core visual components
	private background: pixi.Graphics;
	private ruler: pixi.Graphics;
	private tracks: pixi.Container;
	private playhead: pixi.Graphics;
	private trackContainer: pixi.Container; // Container for all tracks that can be scrolled

	// Timeline parameters
	private pixelsPerSecond: number = 100;
	private trackHeight: number = 30; // Reduced from 40 to make tracks tighter
	private scrollPosition: number = 0;
	private verticalScrollPosition: number = 0;
	private visibleHeight: number = 0; // Height of the visible area for tracks

	// Selection tracking
	private selectedClipId: string | null = null;

	constructor(edit: Edit, size: Size) {
		super();
		this.edit = edit;
		this.width = size.width;
		this.height = size.height;
		this.application = new pixi.Application();

		// Initialize graphics
		this.background = new pixi.Graphics();
		this.ruler = new pixi.Graphics();
		this.tracks = new pixi.Container();
		this.playhead = new pixi.Graphics();
		this.trackContainer = new pixi.Container();

		// Add event listeners for edit state changes
		this.edit.events.on("clip:selected", this.handleClipSelected.bind(this));
		this.edit.events.on("clip:updated", this.handleClipUpdated.bind(this));
	}

	public override async load(): Promise<void> {
		await this.application.init({
			width: this.width,
			height: this.height,
			background: "#232323",
			antialias: true
		});

		// Set up container hierarchy
		this.getContainer().addChild(this.background);
		this.getContainer().addChild(this.trackContainer);
		this.trackContainer.addChild(this.tracks);
		this.getContainer().addChild(this.ruler);
		this.getContainer().addChild(this.playhead);

		this.application.stage.addChild(this.getContainer());

		// Calculate the visible height for tracks (total height minus ruler height)
		const rulerHeight = 20;
		this.visibleHeight = this.height - rulerHeight;

		// Create a mask for the track container to enable scrolling
		const mask = new pixi.Graphics();
		mask.beginFill(0xffffff);
		mask.drawRect(0, rulerHeight, this.width, this.visibleHeight);
		mask.endFill();
		this.trackContainer.mask = mask;
		this.getContainer().addChild(mask);

		// Position the track container
		this.trackContainer.position.y = rulerHeight;

		// Initialize background
		this.drawBackground();

		// Set up interaction handlers
		this.setupInteractions();

		// Initial rendering
		this.buildTracks();
		this.drawRuler();
		this.drawPlayhead();
	}

	public override update(_: number, __: number): void {
		// Update playhead position based on edit time
		const playheadX = (this.edit.playbackTime / 1000) * this.pixelsPerSecond - this.scrollPosition;

		// Clear and redraw playhead at new position
		this.playhead.clear();
		this.playhead.position.x = Math.max(0, Math.min(this.width, playheadX));

		// Draw playhead line
		this.playhead.strokeStyle = { color: 0xff0000, width: 2 };
		this.playhead.moveTo(0, 0);
		this.playhead.lineTo(0, this.height);
		this.playhead.stroke();

		// Draw playhead handle
		this.playhead.fillStyle = { color: 0xff0000 };
		this.playhead.circle(0, 15, 5);
		this.playhead.fill();

		// Auto-scroll if needed while playing
		if (this.edit.isPlaying) {
			// If playhead is approaching the right edge of the screen (within 100px)
			const rightEdgeThreshold = this.width - 100;

			// If the non-adjusted playhead position is beyond the threshold
			if (playheadX > rightEdgeThreshold) {
				// Adjust the scroll position to keep the playhead within view
				this.scrollPosition += (playheadX - rightEdgeThreshold) * 0.1; // Smooth scrolling

				// Refresh the view since we changed scroll position
				this.refreshView();
			}

			// If playhead is close to the left edge and we're scrolled
			if (playheadX < 100 && this.scrollPosition > 0) {
				// Scroll back to follow the playhead
				this.scrollPosition = Math.max(0, this.scrollPosition - 10);
				this.refreshView();
			}
		}
	}

	public override draw(): void {
		// This is called by the rendering system
		// Most drawing is done in component-specific methods
	}

	public override dispose(): void {
		// Clean up graphics resources
		this.background.destroy();
		this.ruler.destroy();
		this.tracks.destroy({ children: true });
		this.playhead.destroy();

		// Remove event listeners
		this.getContainer().removeAllListeners();
		this.edit.events.off("clip:selected", this.handleClipSelected.bind(this));
		this.edit.events.off("clip:updated", this.handleClipUpdated.bind(this));

		this.application.destroy(true, { children: true, texture: true });
	}

	// Timeline-specific methods
	public setZoom(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.refreshView();
	}

	public setScrollPosition(scrollPosition: number): void {
		this.scrollPosition = Math.max(0, scrollPosition);
		this.refreshView();
	}

	// Private implementation methods
	private drawBackground(): void {
		this.background.clear();
		this.background.fillStyle = { color: 0x232323 };
		this.background.rect(0, 0, this.width, this.height);
		this.background.fill();
	}

	private buildTracks(): void {
		// Clear existing tracks
		this.tracks.removeChildren();

		// Get edit data
		const editData = this.edit.getEdit();

		// Create a track for each track in the edit
		for (let i = 0; i < editData.timeline.tracks.length; i += 1) {
			const trackData = editData.timeline.tracks[i];
			const trackY = i * this.trackHeight - this.verticalScrollPosition;

			// Skip tracks that are completely outside the visible area
			if (trackY + this.trackHeight >= 0 && trackY <= this.visibleHeight) {
				const track = new pixi.Container();
				track.position.y = trackY;

				// Create track background
				const trackBg = new pixi.Graphics();
				trackBg.fillStyle = { color: 0x333333 };
				trackBg.rect(0, 0, this.width, this.trackHeight);
				trackBg.fill();

				// Add track separator line
				trackBg.strokeStyle = { color: 0x222222, width: 1 };
				trackBg.moveTo(0, this.trackHeight);
				trackBg.lineTo(this.width, this.trackHeight);
				trackBg.stroke();

				track.addChild(trackBg);

				// Add clips to track
				for (const clipData of trackData.clips) {
					const clip = this.createClipVisual(clipData);
					track.addChild(clip);
				}

				this.tracks.addChild(track);
			}
		}
	}

	private createClipVisual(clipData: any): pixi.Container {
		const clip = new pixi.Container();
		const clipId = this.getClipId(clipData);
		const isSelected = this.selectedClipId === clipId;

		// Position based on time
		const clipX = clipData.start * this.pixelsPerSecond - this.scrollPosition;
		const clipWidth = clipData.length * this.pixelsPerSecond;

		clip.position.x = clipX;

		// Create clip background
		const clipBg = new pixi.Graphics();

		// Use different style for selected clips
		if (isSelected) {
			// Draw selection border first (slightly larger than the clip)
			clipBg.strokeStyle = { color: 0xffffff, width: 2 };
			clipBg.rect(-1, -1, clipWidth + 2, this.trackHeight - 2);
			clipBg.stroke();

			// Brighter background for selected clips
			clipBg.fillStyle = { color: this.getClipColor(clipData.asset.type, true) };
		} else {
			clipBg.fillStyle = { color: this.getClipColor(clipData.asset.type, false) };
		}

		clipBg.rect(0, 0, clipWidth, this.trackHeight - 4);
		clipBg.fill();

		clip.addChild(clipBg);

		// Add label if there's enough space
		if (clipWidth > 40) {
			const textColor = isSelected ? 0xffffff : 0xdddddd;
			const label = new pixi.Text(this.getClipLabel(clipData), {
				fontSize: 10,
				fill: textColor,
				fontWeight: isSelected ? "bold" : "normal"
			});

			label.position.set(5, (this.trackHeight - 4) / 2 - label.height / 2);
			clip.addChild(label);
		}

		// Add interaction
		clip.eventMode = "static";
		clip.cursor = "pointer";
		clip.on("pointerdown", event => {
			// Stop event from propagating up to prevent timeline click
			event.stopPropagation();
			this.handleClipClick(clipData);
		});

		return clip;
	}

	private drawRuler(): void {
		this.ruler.clear();

		// Remove all existing children (text labels)
		while (this.ruler.children.length > 0) {
			this.ruler.removeChildAt(0);
		}

		// Draw ruler background
		this.ruler.fillStyle = { color: 0x2a2a2a };
		this.ruler.rect(0, 0, this.width, 20);
		this.ruler.fill();

		// Draw time markers
		this.ruler.strokeStyle = { color: 0xcccccc, width: 1 };

		const secondsInView = this.width / this.pixelsPerSecond;

		// Determine appropriate interval based on zoom level
		let interval = 1; // 1 second
		if (this.pixelsPerSecond < 30) interval = 5;
		if (this.pixelsPerSecond < 10) interval = 10;

		const startTime = Math.floor(this.scrollPosition / this.pixelsPerSecond);

		for (let time = startTime; time <= startTime + secondsInView + 1; time += interval) {
			if (time >= 0) {
				const x = time * this.pixelsPerSecond - this.scrollPosition;

				// Draw tick mark
				this.ruler.moveTo(x, 15);
				this.ruler.lineTo(x, 20);
				this.ruler.stroke();

				// Add timestamp text
				const timeText = new pixi.Text(this.formatTime(time), {
					fontSize: 9,
					fill: 0xffffff
				});

				timeText.position.set(x - timeText.width / 2, 2);
				this.ruler.addChild(timeText);
			}
		}
	}

	private drawPlayhead(): void {
		this.playhead.clear();

		// Draw playhead line
		this.playhead.strokeStyle = { color: 0xff0000, width: 2 };
		this.playhead.moveTo(0, 0);
		this.playhead.lineTo(0, this.height);
		this.playhead.stroke();

		// Draw playhead handle
		this.playhead.fillStyle = { color: 0xff0000 };
		this.playhead.circle(0, 15, 5);
		this.playhead.fill();
	}

	private setupInteractions(): void {
		// Get the container and ensure it can receive events
		const container = this.getContainer();
		container.eventMode = "static";
		container.hitArea = new pixi.Rectangle(0, 0, this.width, this.height);

		// Background should be clickable too
		this.background.eventMode = "static";
		this.background.hitArea = new pixi.Rectangle(0, 0, this.width, this.height);

		// Ruler should be clickable
		this.ruler.eventMode = "static";

		// Direct click handler on container
		container.on("pointerdown", this.handleTimelineClick.bind(this));
		this.background.on("pointerdown", this.handleTimelineClick.bind(this));
		this.ruler.on("pointerdown", this.handleTimelineClick.bind(this));

		// Scroll horizontally and vertically
		container.on("wheel", event => {
			if (event.ctrlKey) {
				// Zoom in/out
				const oldZoom = this.pixelsPerSecond;
				this.pixelsPerSecond = Math.max(10, Math.min(200, this.pixelsPerSecond * (1 - event.deltaY * 0.001)));

				// Adjust scroll to keep point under cursor stable
				const mouseX = event.getLocalPosition(container).x;
				const timeAtCursor = (mouseX + this.scrollPosition) / oldZoom;
				this.scrollPosition = timeAtCursor * this.pixelsPerSecond - mouseX;
			} else if (event.shiftKey) {
				// Horizontal scroll when holding shift
				this.scrollPosition += event.deltaY;
				this.scrollPosition = Math.max(0, this.scrollPosition);
			} else {
				// Vertical scroll without modifiers
				const maxScroll = this.getMaxVerticalScroll();
				this.verticalScrollPosition += event.deltaY * 0.5; // Adjust scroll speed
				this.verticalScrollPosition = Math.max(0, Math.min(maxScroll, this.verticalScrollPosition));
			}

			this.refreshView();
		});
	}

	private getMaxVerticalScroll(): number {
		const editData = this.edit.getEdit();
		const totalTracksHeight = editData.timeline.tracks.length * this.trackHeight;
		return Math.max(0, totalTracksHeight - this.visibleHeight);
	}

	private refreshView(): void {
		this.buildTracks();
		this.drawRuler();
	}

	private handleTimelineClick(event: pixi.FederatedPointerEvent): void {
		// Get the local position of the click
		const clickX = event.getLocalPosition(this.getContainer()).x;
		const clickY = event.getLocalPosition(this.getContainer()).y;

		// Only move playhead when clicking on ruler or background (not tracks)
		const rulerHeight = 20;
		const isRulerClick = clickY < rulerHeight;

		// Only process clicks on the ruler or background, not on the tracks
		if (isRulerClick) {
			// Calculate time based on click position
			const clickTime = ((clickX + this.scrollPosition) / this.pixelsPerSecond) * 1000;

			// Seek the edit to that time
			this.edit.seek(clickTime);
		}
	}

	// Helper methods
	private getClipColor(assetType: string, isSelected: boolean = false): number {
		// Base colors
		let color: number;

		switch (assetType) {
			case "video":
				color = 0x4a90e2;
				break;
			case "audio":
				color = 0x7ed321;
				break;
			case "image":
				color = 0xf5a623;
				break;
			case "text":
				color = 0xbd10e0;
				break;
			case "shape":
				color = 0x9013fe;
				break;
			case "html":
				color = 0x50e3c2;
				break;
			default:
				color = 0x888888;
				break;
		}

		// Brighten the color if selected
		if (isSelected) {
			// Convert to RGB
			// eslint-disable-next-line no-bitwise
			const r = (color >> 16) & 0xff;
			// eslint-disable-next-line no-bitwise
			const g = (color >> 8) & 0xff;
			// eslint-disable-next-line no-bitwise
			const b = color & 0xff;

			// Brighten by 20%
			const brighterR = Math.min(255, r + 40);
			const brighterG = Math.min(255, g + 40);
			const brighterB = Math.min(255, b + 40);

			// Convert back to hex
			// eslint-disable-next-line no-bitwise
			return (brighterR << 16) | (brighterG << 8) | brighterB;
		}

		return color;
	}

	private getClipLabel(clipData: any): string {
		if (clipData.asset.type === "text" && clipData.asset.text) {
			return clipData.asset.text.substring(0, 20);
		}

		if (clipData.asset.src) {
			const {src} = clipData.asset;
			const filename = src.substring(src.lastIndexOf("/") + 1);
			return filename.substring(0, 20);
		}

		return clipData.asset.type;
	}

	private formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	}

	// Event handlers
	private handleClipClick(clipData: any): void {
		// Store the selected clip ID
		this.selectedClipId = this.getClipId(clipData);

		// Find track and clip indices
		const editData = this.edit.getEdit();
		let trackIndex = -1;
		let clipIndex = -1;

		// First, let's find if we can match by reference
		for (let i = 0; i < editData.timeline.tracks.length; i += 1) {
			const track = editData.timeline.tracks[i];
			for (let j = 0; j < track.clips.length; j += 1) {
				// Try to match by start time and asset type which should be unique enough
				if (track.clips[j].start === clipData.start && track.clips[j].asset.type === clipData.asset.type) {
					trackIndex = i;
					clipIndex = j;
					break;
				}
			}
			if (trackIndex !== -1) break;
		}

		if (trackIndex !== -1 && clipIndex !== -1) {
			// Get the player from the edit
			const clip = this.edit.getClip(trackIndex, clipIndex);

			if (clip) {
				// Notify the edit that this clip is selected
				// We need to directly call the event since setSelectedClip expects a Player object
				this.edit.events.emit("clip:selected", {
					clip,
					trackIndex,
					clipIndex
				});
			}
		}

		// Refresh the timeline to show the selection
		this.refreshView();
	}

	private handleClipSelected(data: any): void {
		// Update selection based on event
		if (data.clip) {
			this.selectedClipId = this.getClipId(data.clip);
		} else {
			this.selectedClipId = null;
		}

		this.refreshView();
	}

	private handleClipUpdated(_: any): void {
		this.refreshView();
	}

	public getCanvas(): HTMLCanvasElement {
		return this.application.canvas;
	}

	// Helper to generate a unique ID for a clip
	private getClipId(clip: any): string {
		return `${clip.start}-${clip.asset.type}-${clip.asset.src || clip.asset.text || ""}`;
	}
}
