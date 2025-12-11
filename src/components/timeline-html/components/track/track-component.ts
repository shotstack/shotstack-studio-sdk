import { TimelineEntity } from "../../core/timeline-entity";
import type { TrackState, ClipState, ClipRenderer } from "../../html-timeline.types";
import { getTrackHeight } from "../../html-timeline.types";
import { ClipComponent } from "../clip/clip-component";

export interface TrackComponentOptions {
	showBadges: boolean;
	onClipSelect: (trackIndex: number, clipIndex: number, addToSelection: boolean) => void;
	getClipRenderer: (type: string) => ClipRenderer | undefined;
}

/** Renders a single track with its clips */
export class TrackComponent extends TimelineEntity {
	private readonly clipComponents = new Map<string, ClipComponent>();
	private readonly options: TrackComponentOptions;
	private trackIndex: number;

	// Current state for draw
	private currentTrack: TrackState | null = null;
	private currentPixelsPerSecond = 50;
	private needsUpdate = true;

	constructor(trackIndex: number, options: TrackComponentOptions) {
		super("div", "ss-track");
		this.trackIndex = trackIndex;
		this.options = options;
		this.element.dataset["trackIndex"] = String(trackIndex);
	}

	public async load(): Promise<void> {
		await this.loadChildren();
	}

	public update(_deltaTime: number, _elapsed: number): void {
		this.updateChildren(_deltaTime, _elapsed);
	}

	public draw(): void {
		if (!this.needsUpdate || !this.currentTrack) {
			// Still need to draw clip components even when data hasn't changed
			for (const clipComponent of this.clipComponents.values()) {
				clipComponent.draw();
			}
			this.drawChildren();
			return;
		}
		this.needsUpdate = false;

		const track = this.currentTrack;
		this.trackIndex = track.index;
		this.element.dataset["trackIndex"] = String(track.index);

		const processedIds = new Set<string>();

		// Update or create clips
		for (const clipState of track.clips) {
			processedIds.add(clipState.id);

			let clipComponent = this.clipComponents.get(clipState.id);
			if (!clipComponent) {
				clipComponent = new ClipComponent(clipState, {
					showBadges: this.options.showBadges,
					onSelect: this.options.onClipSelect,
					getRenderer: this.options.getClipRenderer
				});
				this.clipComponents.set(clipState.id, clipComponent);
				this.element.appendChild(clipComponent.element);
			}

			clipComponent.updateClip(clipState);
		}

		// Remove clips that no longer exist
		for (const [id, component] of this.clipComponents) {
			if (!processedIds.has(id)) {
				component.dispose();
				this.clipComponents.delete(id);
			}
		}

		// Draw all clip components (they're not in children array)
		for (const clipComponent of this.clipComponents.values()) {
			clipComponent.draw();
		}

		this.drawChildren();
	}

	public dispose(): void {
		for (const component of this.clipComponents.values()) {
			component.dispose();
		}
		this.clipComponents.clear();
		this.element.remove();
	}

	/** Update track state and mark for re-render */
	public updateTrack(track: TrackState, pixelsPerSecond: number): void {
		// Only update height if asset type changed (not every frame)
		const prevAssetType = this.currentTrack?.primaryAssetType;

		this.currentTrack = track;
		this.currentPixelsPerSecond = pixelsPerSecond;

		// Set height only when asset type changes
		if (track.primaryAssetType !== prevAssetType) {
			const height = getTrackHeight(track.primaryAssetType);
			this.element.style.height = `${height}px`;
			this.element.dataset["assetType"] = track.primaryAssetType;
		}

		this.needsUpdate = true;
	}

	/** Get the current track state */
	public getCurrentTrack(): TrackState | null {
		return this.currentTrack;
	}

	public getClipComponent(clipId: string): ClipComponent | undefined {
		return this.clipComponents.get(clipId);
	}

	public getClipAtPosition(x: number, pixelsPerSecond: number): ClipState | null {
		for (const component of this.clipComponents.values()) {
			const state = component.getState();
			if (!state) continue;

			const clipStart = state.config.start * pixelsPerSecond;
			const clipEnd = (state.config.start + state.config.length) * pixelsPerSecond;

			if (x >= clipStart && x <= clipEnd) {
				return state;
			}
		}
		return null;
	}
}
