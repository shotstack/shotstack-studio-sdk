import type { TrackState, ClipState, ClipRenderer } from "../../timeline.types";
import { MAX_TRACK_HEIGHT, MIN_TRACK_HEIGHT, getTrackHeight } from "../../timeline.types";
import { ClipComponent } from "../clip/clip-component";

export interface TrackComponentOptions {
	showBadges: boolean;
	onClipSelect: (trackIndex: number, clipIndex: number, addToSelection: boolean) => void;
	getClipRenderer: (type: string) => ClipRenderer | undefined;
	/** Get error state for a clip (if asset failed to load) */
	getClipError?: (trackIndex: number, clipIndex: number) => { error: string; assetType: string } | null;
	/** Check if content clip has an attached luma (pure function) */
	hasAttachedLuma?: (trackIndex: number, clipIndex: number) => boolean;
	/** Find attached luma for a content clip via timing match (pure function) */
	findAttachedLuma?: (trackIndex: number, clipIndex: number) => { trackIndex: number; clipIndex: number } | null;
	/** Callback when mask badge is clicked on a content clip */
	onMaskClick?: (contentTrackIndex: number, contentClipIndex: number) => void;
	/** Check if attached luma is currently visible for editing */
	isLumaVisibleForEditing?: (contentTrackIndex: number, contentClipIndex: number) => boolean;
	/** Find the content clip that a luma is attached to via timing match (pure function) */
	findContentForLuma?: (lumaTrack: number, lumaClip: number) => { trackIndex: number; clipIndex: number } | null;
	/** Pre-computed AI asset numbers (map of clip ID to number) */
	aiAssetNumbers: Map<string, number>;
	/** Callback when a track's height changes via resize (no args — parent re-reads heights) */
	onHeightChange?: () => void;
}

/** Renders a single track with its clips */
export class TrackComponent {
	public readonly element: HTMLElement;
	private readonly clipComponents = new Map<string, ClipComponent>();
	private readonly options: TrackComponentOptions;
	private readonly resizeHandle: HTMLElement;
	private trackIndex: number;

	// Current state for draw
	private currentTrack: TrackState | null = null;
	private currentPixelsPerSecond = 50;
	private currentHeight = 0;
	private needsUpdate = true;

	// Per-track resize state (component-local)
	private customHeight: number | null = null;
	private isResizing = false;

	constructor(trackIndex: number, options: TrackComponentOptions) {
		this.element = document.createElement("div");
		this.element.className = "ss-track";
		this.trackIndex = trackIndex;
		this.options = options;
		this.element.dataset["trackIndex"] = String(trackIndex);

		this.resizeHandle = document.createElement("div");
		this.resizeHandle.className = "ss-track-resize-handle";
		this.element.appendChild(this.resizeHandle);
		this.setupResizeDrag();
	}

	private setupResizeDrag(): void {
		let startY = 0;
		let startHeight = 0;

		const onPointerDown = (e: PointerEvent): void => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation(); // Prevent InteractionController from clearing clip selection

			startY = e.clientY;
			startHeight = this.element.offsetHeight;
			this.isResizing = true;

			this.element.classList.add("ss-track--resizing");
			this.resizeHandle.setPointerCapture(e.pointerId);
		};

		const onPointerMove = (e: PointerEvent): void => {
			if (!this.isResizing) return;

			const delta = e.clientY - startY;
			const newHeight = Math.max(MIN_TRACK_HEIGHT, Math.min(MAX_TRACK_HEIGHT, startHeight + delta));

			this.customHeight = newHeight;
			this.currentHeight = newHeight;
			this.element.style.height = `${newHeight}px`;
			this.options.onHeightChange?.();
		};

		const onPointerUp = (e: PointerEvent): void => {
			if (!this.isResizing) return;

			this.isResizing = false;
			this.element.classList.remove("ss-track--resizing");
			this.resizeHandle.releasePointerCapture(e.pointerId);
			this.options.onHeightChange?.();
		};

		const onDblClick = (e: MouseEvent): void => {
			e.preventDefault();
			e.stopPropagation();

			this.customHeight = null;
			const height = getTrackHeight(this.currentTrack?.primaryAssetType ?? "default");
			this.currentHeight = height;
			this.element.style.height = `${height}px`;
			this.options.onHeightChange?.();
		};

		this.resizeHandle.addEventListener("pointerdown", onPointerDown);
		this.resizeHandle.addEventListener("pointermove", onPointerMove);
		this.resizeHandle.addEventListener("pointerup", onPointerUp);
		this.resizeHandle.addEventListener("pointercancel", onPointerUp);
		this.resizeHandle.addEventListener("dblclick", onDblClick);
	}

	/** Get the effective height (custom override or default for asset type) */
	public getEffectiveHeight(): number {
		return this.customHeight ?? getTrackHeight(this.currentTrack?.primaryAssetType ?? "default");
	}

	public draw(): void {
		if (!this.needsUpdate || !this.currentTrack) {
			return; // Nothing changed, skip entirely
		}
		this.needsUpdate = false;

		const track = this.currentTrack;
		this.trackIndex = track.index;
		this.element.dataset["trackIndex"] = String(track.index);

		const processedIds = new Set<string>();

		// Update or create clips
		for (const clipState of track.clips) {
			// Check if this is an attached luma clip (luma with matching content via timing)
			const isLumaClip = clipState.config.asset?.type === "luma";
			const contentClip = isLumaClip ? this.options.findContentForLuma?.(clipState.trackIndex, clipState.clipIndex) : null;
			const isAttachedLuma = isLumaClip && contentClip !== null;

			if (isAttachedLuma && contentClip) {
				// Check if it should be visible for editing
				const isVisibleForEditing = this.options.isLumaVisibleForEditing?.(contentClip.trackIndex, contentClip.clipIndex);

				if (isVisibleForEditing) {
					// Render the luma clip (it's visible for editing)
					processedIds.add(clipState.id);

					let clipComponent = this.clipComponents.get(clipState.id);
					if (!clipComponent) {
						clipComponent = new ClipComponent(clipState, {
							showBadges: this.options.showBadges,
							onSelect: this.options.onClipSelect,
							getRenderer: this.options.getClipRenderer,
							getClipError: this.options.getClipError,
							aiAssetNumbers: this.options.aiAssetNumbers
						});
						this.clipComponents.set(clipState.id, clipComponent);
						this.element.appendChild(clipComponent.element);
					}
					clipComponent.updateClip(clipState, undefined);
				} else {
					// Hide attached luma - remove clip component if it exists
					const existingComponent = this.clipComponents.get(clipState.id);
					if (existingComponent) {
						existingComponent.dispose();
						this.clipComponents.delete(clipState.id);
					}
				}
			} else {
				// Normal clip rendering (non-luma or unattached luma)
				processedIds.add(clipState.id);

				// Check if this content clip has an attached luma (for badge display)
				const attachedLuma = this.options.findAttachedLuma?.(clipState.trackIndex, clipState.clipIndex);

				let clipComponent = this.clipComponents.get(clipState.id);
				if (!clipComponent) {
					clipComponent = new ClipComponent(clipState, {
						showBadges: this.options.showBadges,
						onSelect: this.options.onClipSelect,
						getRenderer: this.options.getClipRenderer,
						getClipError: this.options.getClipError,
						attachedLuma: attachedLuma ?? undefined,
						onMaskClick: this.options.onMaskClick,
						aiAssetNumbers: this.options.aiAssetNumbers
					});
					this.clipComponents.set(clipState.id, clipComponent);
					this.element.appendChild(clipComponent.element);
				}

				clipComponent.updateClip(clipState, attachedLuma ?? undefined);
			}
		}

		// Remove clips that no longer exist
		for (const [id, component] of this.clipComponents) {
			if (!processedIds.has(id)) {
				component.dispose();
				this.clipComponents.delete(id);
			}
		}

		// Draw all clip components
		for (const clipComponent of this.clipComponents.values()) {
			clipComponent.draw();
		}
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
		// Only mark dirty if data actually changed (reference equality works due to TimelineStateManager caching)
		const trackChanged = track !== this.currentTrack;
		const ppsChanged = pixelsPerSecond !== this.currentPixelsPerSecond;

		if (!trackChanged && !ppsChanged) {
			return; // Nothing changed, skip update
		}

		const prevAssetType = this.currentTrack?.primaryAssetType;

		// Reset custom height when component is reassigned to a different track (pool reuse)
		if (track.index !== this.currentTrack?.index) {
			this.customHeight = null;
		}

		this.currentTrack = track;
		this.currentPixelsPerSecond = pixelsPerSecond;

		// Skip height update during resize (prevents render loop fighting drag),
		// unless the asset type genuinely changed
		if (!this.isResizing || track.primaryAssetType !== prevAssetType) {
			if (this.isResizing && track.primaryAssetType !== prevAssetType) {
				this.customHeight = null;
			}
			const height = this.customHeight ?? getTrackHeight(track.primaryAssetType);
			if (height !== this.currentHeight) {
				this.element.style.height = `${height}px`;
				this.currentHeight = height;
			}
		}

		if (track.primaryAssetType !== prevAssetType) {
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
			if (state) {
				const clipStart = state.config.start * pixelsPerSecond;
				const clipEnd = (state.config.start + state.config.length) * pixelsPerSecond;

				if (x >= clipStart && x <= clipEnd) {
					return state;
				}
			}
		}
		return null;
	}
}
