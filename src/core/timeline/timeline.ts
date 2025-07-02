import { Entity } from "@entities/base/entity";
import { Edit } from "@entities/system/edit";
import { type Size } from "@layouts/geometry";
import * as pixi from "pixi.js";


import { TimelineRuler, TimelineTrack } from "./components";
import type {
	TimelineClipData,
	ClipClickEventData,
	ClipSelectedEventData,
	ClipUpdatedEventData
} from "./timeline-types";
import { isTextAsset, hasSourceUrl } from "./timeline-types";

export class Timeline extends Entity {
	private edit: Edit;
	private width: number;
	private height: number;

	// PIXI Application for standalone component functionality
	public readonly application: pixi.Application;

	// Core visual components using Entity architecture
	private background: pixi.Graphics | null;
	private ruler: TimelineRuler | null;
	private tracks: TimelineTrack[] = [];
	private playhead: pixi.Graphics | null;
	private trackContainer: pixi.Container | null; // Container for all tracks that can be scrolled

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

		// Create PIXI application for standalone functionality
		this.application = new pixi.Application();

		// Initialize graphics as null (following Inspector pattern for internal components)
		this.background = null;
		this.ruler = null;
		this.tracks = [];
		this.playhead = null;
		this.trackContainer = null;

		// Add event listeners for edit state changes
		this.edit.events.on("clip:selected", this.handleClipSelected.bind(this));
		this.edit.events.on("clip:updated", this.handleClipUpdated.bind(this));
	}

	public override async load(): Promise<void> {
		// Initialize standalone application
		await this.application.init({
			width: this.width,
			height: this.height,
			background: "#232323",
			antialias: true
		});

		// Create PIXI objects and Entity components
		this.background = new pixi.Graphics();
		this.ruler = new TimelineRuler(this.edit, this.width);
		this.playhead = new pixi.Graphics();
		this.trackContainer = new pixi.Container();

		// Set up container hierarchy using Entity's getContainer() for internal organization
		this.getContainer().addChild(this.background);
		this.getContainer().addChild(this.trackContainer);
		this.getContainer().addChild(this.ruler.getContainer());
		this.getContainer().addChild(this.playhead);

		// Load ruler component
		await this.ruler.load();

		// Add main container to application stage for standalone functionality
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
		this.drawBackground();
		this.buildTracks();
		this.drawPlayhead();
	}

	public override update(deltaTime: number, elapsed: number): void {
		if (!this.playhead) return;
		
		// Update Entity components
		this.ruler?.update(deltaTime, elapsed);
		for (const track of this.tracks) {
			track.update(deltaTime, elapsed);
		}
		
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
		// Remove event listeners first to prevent memory leaks
		this.getContainer().removeAllListeners();
		this.getContainer().eventMode = 'none';
		
		// Remove edit event listeners
		this.edit.events.off("clip:selected", this.handleClipSelected.bind(this));
		this.edit.events.off("clip:updated", this.handleClipUpdated.bind(this));
		
		// Dispose track entities in reverse order to avoid index issues
		for (let i = this.tracks.length - 1; i >= 0; i -= 1) {
			const track = this.tracks[i];
			if (this.trackContainer && track.getContainer().parent === this.trackContainer) {
				this.trackContainer.removeChild(track.getContainer());
			}
			track.dispose();
		}
		this.tracks.length = 0;
		
		// Dispose ruler entity
		if (this.ruler) {
			if (this.ruler.getContainer().parent) {
				this.ruler.getContainer().parent.removeChild(this.ruler.getContainer());
			}
			this.ruler.dispose();
			this.ruler = null;
		}
		
		// Dispose PIXI graphics objects with proper cleanup
		if (this.background) {
			if (this.background.parent) {
				this.background.parent.removeChild(this.background);
			}
			this.background.destroy({ children: true });
			this.background = null;
		}
		
		if (this.playhead) {
			if (this.playhead.parent) {
				this.playhead.parent.removeChild(this.playhead);
			}
			this.playhead.destroy({ children: true });
			this.playhead = null;
		}
		
		if (this.trackContainer) {
			// Remove mask first if it exists
			if (this.trackContainer.mask) {
				const mask = this.trackContainer.mask as pixi.Graphics;
				this.trackContainer.mask = null;
				if (mask.parent) {
					mask.parent.removeChild(mask);
				}
				mask.destroy({ children: true });
			}
			
			if (this.trackContainer.parent) {
				this.trackContainer.parent.removeChild(this.trackContainer);
			}
			this.trackContainer.destroy({ children: true });
			this.trackContainer = null;
		}
		
		// Destroy standalone application with proper cleanup
		if (this.application) {
			// Remove main container from stage first
			if (this.getContainer().parent === this.application.stage) {
				this.application.stage.removeChild(this.getContainer());
			}
			
			// Destroy application
			this.application.destroy(true, {
				children: true,
				texture: true
			});
		}
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
		if (!this.background) return;
		
		this.background.clear();
		this.background.fillStyle = { color: 0x232323 };
		this.background.rect(0, 0, this.width, this.height);
		this.background.fill();
	}

	private buildTracks(): void {
		// Clear existing track entities with proper memory management
		for (let i = this.tracks.length - 1; i >= 0; i -= 1) {
			const track = this.tracks[i];
			if (this.trackContainer && track.getContainer().parent === this.trackContainer) {
				this.trackContainer.removeChild(track.getContainer());
			}
			track.dispose();
		}
		this.tracks.length = 0; // Clear array efficiently

		// Get edit data
		const editData = this.edit.getEdit();

		// Create Entity-based tracks for each track in the edit
		for (let i = 0; i < editData.timeline.tracks.length; i += 1) {
			const trackData = editData.timeline.tracks[i];
			const trackY = i * this.trackHeight - this.verticalScrollPosition;

			// Skip tracks that are completely outside the visible area
			if (trackY + this.trackHeight < 0 || trackY > this.visibleHeight) {
				// eslint-disable-next-line no-continue
				continue;
			}

			// Create TimelineTrack Entity
			const track = new TimelineTrack(
				this.edit,
				trackData,
				this.width,
				this.trackHeight,
				this.scrollPosition,
				this.pixelsPerSecond,
				this.selectedClipId
			);

			// Position the track
			track.getContainer().position.y = trackY;

			// Set up track event handling
			track.getContainer().on('clip:click', (data: ClipClickEventData) => {
				this.handleClipClick(data.clipData);
			});

			// Add to timeline and load
			this.trackContainer?.addChild(track.getContainer());
			track.load(); // Load asynchronously without waiting
			this.tracks.push(track);
		}
	}



	private drawPlayhead(): void {
		if (!this.playhead) return;
		
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
		if (this.background) {
			this.background.eventMode = "static";
			this.background.hitArea = new pixi.Rectangle(0, 0, this.width, this.height);
			this.background.on("pointerdown", this.handleTimelineClick.bind(this));
		}

		// Ruler should be clickable - set up event handling on ruler Entity
		if (this.ruler) {
			this.ruler.getContainer().eventMode = "static";
			this.ruler.getContainer().on("pointerdown", (event: pixi.FederatedPointerEvent) => {
				this.ruler?.handleClick(event);
			});
		}

		// Direct click handler on container
		container.on("pointerdown", this.handleTimelineClick.bind(this));

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
		this.ruler?.updateScrollPosition(this.scrollPosition);
		this.ruler?.updatePixelsPerSecond(this.pixelsPerSecond);
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

	private formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	}

	// Event handlers
	private handleClipClick(clipData: TimelineClipData): void {
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

	private handleClipSelected(data: ClipSelectedEventData): void {
		// Update selection based on event
		if (data.clip) {
			this.selectedClipId = this.getClipId(data.clip);
		} else {
			this.selectedClipId = null;
		}

		this.refreshView();
	}

	private handleClipUpdated(_data: ClipUpdatedEventData): void {
		this.refreshView();
	}

	// Standalone component interface - provides canvas for developer integration
	public getCanvas(): HTMLCanvasElement {
		return this.application.canvas;
	}

	// Helper to generate a unique ID for a clip
	private getClipId(clip: TimelineClipData): string {
		let identifier = "";
		
		if (isTextAsset(clip.asset)) {
			identifier = clip.asset.text;
		} else if (hasSourceUrl(clip.asset)) {
			identifier = clip.asset.src;
		}
		
		return `${clip.start}-${clip.asset.type}-${identifier}`;
	}
}
