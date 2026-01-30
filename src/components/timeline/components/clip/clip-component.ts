import { getAiAssetTypeLabel, isAiAsset, type ResolvedClipWithId } from "@core/shared/ai-asset-utils";
import type { ResolvedClip } from "@schemas";

import { AI_ICON_LINE_PATHS, AI_ASSET_ICON_MAP } from "../../../canvas/players/ai-icons";
import { formatClipErrorMessage } from "../../error-messages";
import type { ClipState, ClipRenderer } from "../../timeline.types";

/** Reference to an attached luma clip */
interface LumaRef {
	trackIndex: number;
	clipIndex: number;
}

export interface ClipComponentOptions {
	showBadges: boolean;
	onSelect: (trackIndex: number, clipIndex: number, addToSelection: boolean) => void;
	getRenderer: (type: string) => ClipRenderer | undefined;
	/** Get error state for a clip (if asset failed to load) */
	getClipError?: (trackIndex: number, clipIndex: number) => { error: string; assetType: string } | null;
	/** Reference to attached luma (if this clip has a mask) */
	attachedLuma?: LumaRef;
	/** Callback when mask badge is clicked - passes the CONTENT clip indices */
	onMaskClick?: (contentTrackIndex: number, contentClipIndex: number) => void;
	/** Pre-computed AI asset numbers (map of clip ID to number) */
	aiAssetNumbers: Map<string, number>;
}

/** Renders a single clip element */
export class ClipComponent {
	public readonly element: HTMLElement;
	private readonly options: ClipComponentOptions;
	private currentState: ClipState | null = null;
	private currentLumaRef: LumaRef | undefined = undefined;
	private maskBadge: HTMLElement | null = null;
	private errorBadge: HTMLElement | null = null;
	private currentError: { error: string; assetType: string } | null = null;
	private needsUpdate = true;

	// Cached element references (avoid querySelector every frame)
	private iconEl: HTMLElement | null = null;
	private labelEl: HTMLElement | null = null;
	private badgeEl: HTMLElement | null = null;

	constructor(clip: ClipState, options: ClipComponentOptions) {
		this.element = document.createElement("div");
		this.element.className = "ss-clip";
		this.options = options;
		this.buildElement(clip);
		this.currentState = clip;
		this.element.dataset["clipId"] = clip.id;
	}

	private buildElement(clip: ClipState): void {
		// Content container
		const content = document.createElement("div");
		content.className = "ss-clip-content";

		// Icon for asset type (cache reference)
		this.iconEl = document.createElement("span");
		this.iconEl.className = "ss-clip-icon";
		content.appendChild(this.iconEl);

		// Label (cache reference)
		this.labelEl = document.createElement("span");
		this.labelEl.className = "ss-clip-label";
		content.appendChild(this.labelEl);

		this.element.appendChild(content);

		// Timing badge (cache reference)
		if (this.options.showBadges) {
			this.badgeEl = document.createElement("div");
			this.badgeEl.className = "ss-clip-badge";
			this.element.appendChild(this.badgeEl);
		}

		// Resize handles
		const leftHandle = document.createElement("div");
		leftHandle.className = "ss-clip-resize-handle left";
		this.element.appendChild(leftHandle);

		const rightHandle = document.createElement("div");
		rightHandle.className = "ss-clip-resize-handle right";
		this.element.appendChild(rightHandle);

		// Set up interaction handlers
		this.setupInteraction(clip);
	}

	private setupInteraction(clip: ClipState): void {
		this.element.addEventListener("pointerdown", e => {
			// Check if clicking on resize handle
			const target = e.target as HTMLElement;
			if (target.classList.contains("ss-clip-resize-handle")) {
				// Resize will be handled by InteractionController
				return;
			}

			// Select clip
			const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey;
			this.options.onSelect(clip.trackIndex, clip.clipIndex, addToSelection);
		});
	}

	public draw(): void {
		if (!this.needsUpdate || !this.currentState) return;
		this.needsUpdate = false;

		const clip = this.currentState;
		const { config } = clip;
		const assetType = this.getAssetType(config);

		const prevAssetType = this.element.dataset["assetType"];
		if (prevAssetType && prevAssetType !== assetType) {
			this.clearRendererStyles();
		}

		// Update data attributes
		this.element.dataset["assetType"] = assetType;
		this.element.dataset["trackIndex"] = String(clip.trackIndex);
		this.element.dataset["clipIndex"] = String(clip.clipIndex);

		// Update CSS custom properties for positioning
		this.element.style.setProperty("--clip-start", String(config.start));
		this.element.style.setProperty("--clip-length", String(config.length));

		// Update visual state classes
		this.element.classList.toggle("selected", clip.visualState === "selected");
		this.element.classList.toggle("dragging", clip.visualState === "dragging");
		this.element.classList.toggle("resizing", clip.visualState === "resizing");

		// Update icon (using cached reference)
		if (this.iconEl && this.iconEl.dataset["assetType"] !== assetType) {
			this.iconEl.dataset["assetType"] = assetType;
			const aiIconType = AI_ASSET_ICON_MAP[assetType];
			if (aiIconType) {
				this.iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${AI_ICON_LINE_PATHS[aiIconType]}"/></svg>`;
			} else {
				this.iconEl.textContent = this.getAssetIcon(assetType);
			}
		}

		// Update label (using cached reference)
		if (this.labelEl) {
			this.labelEl.textContent = this.getClipLabel(config);
		}

		// Update timing badge (using cached reference)
		if (this.badgeEl) {
			this.updateBadge(this.badgeEl, clip.timingIntent);
		}

		// Update mask badge (show if clip has attached luma)
		this.updateMaskBadge();

		// Update error state (show if asset failed to load)
		this.updateErrorState();

		// Apply custom renderer if available
		const renderer = this.options.getRenderer(assetType);
		if (renderer) {
			renderer.render(config, this.element);
		}
	}

	/** Show/hide mask badge based on attached luma */
	private updateMaskBadge(): void {
		if (this.currentLumaRef && this.currentState) {
			// Create badge if it doesn't exist
			if (!this.maskBadge) {
				this.maskBadge = document.createElement("div");
				this.maskBadge.className = "ss-clip-mask-badge";
				this.maskBadge.textContent = "◐";
				this.maskBadge.title = "Luma mask attached - click to detach";
				this.maskBadge.addEventListener("click", e => {
					e.stopPropagation();
					// Pass the CONTENT clip indices (this clip), not the luma indices
					if (this.currentState && this.options.onMaskClick) {
						this.options.onMaskClick(this.currentState.trackIndex, this.currentState.clipIndex);
					}
				});
				this.element.appendChild(this.maskBadge);
			}
			this.maskBadge.style.display = "flex";
		} else if (this.maskBadge) {
			// Hide badge if no luma attached
			this.maskBadge.style.display = "none";
		}
	}

	/** Show/hide error state based on clip error */
	private updateErrorState(): void {
		const error = this.currentState ? this.options.getClipError?.(this.currentState.trackIndex, this.currentState.clipIndex) : null;

		// Compare by value, not reference (getClipError returns new object each call)
		const hasNewError = error && (!this.currentError || error.error !== this.currentError.error || error.assetType !== this.currentError.assetType);

		if (hasNewError) {
			this.currentError = error;
			this.element.classList.add("ss-clip--error");

			// Create error badge if needed
			if (!this.errorBadge) {
				this.errorBadge = document.createElement("div");
				this.errorBadge.className = "ss-clip-error-badge";
				this.errorBadge.textContent = "⚠";
				this.element.appendChild(this.errorBadge);
			}

			// User-friendly tooltip
			this.errorBadge.title = formatClipErrorMessage(error.error, error.assetType);
		} else if (!error && this.currentError) {
			// Clear error state
			this.currentError = null;
			this.element.classList.remove("ss-clip--error");
			this.errorBadge?.remove();
			this.errorBadge = null;
		}
	}

	public dispose(): void {
		// Call dispose on custom renderer if exists
		if (this.currentState) {
			const assetType = this.getAssetType(this.currentState.config);
			const renderer = this.options.getRenderer(assetType);
			if (renderer?.dispose) {
				renderer.dispose(this.element);
			}
		}

		this.element.remove();
	}

	/** Clear any styles that renderers might have applied */
	private clearRendererStyles(): void {
		this.element.classList.remove("ss-clip--thumbnails", "ss-clip--loading-thumbnails");
		this.element.style.backgroundImage = "";
		this.element.style.backgroundPosition = "";
		this.element.style.backgroundSize = "";
		this.element.style.backgroundRepeat = "";
	}

	/** Update clip state and mark for re-render */
	public updateClip(clip: ClipState, attachedLuma?: LumaRef): void {
		// Only mark dirty if data actually changed (reference equality works due to TimelineStateManager caching)
		const clipChanged = clip !== this.currentState;
		const lumaChanged = attachedLuma !== this.currentLumaRef;

		if (!clipChanged && !lumaChanged) {
			return; // Nothing changed, skip update
		}

		this.currentState = clip;
		this.currentLumaRef = attachedLuma;
		this.needsUpdate = true;
	}

	private updateBadge(badge: HTMLElement, timingIntent: ClipState["timingIntent"]): void {
		let icon = "";
		let intent = "fixed";
		let tooltip = "";

		if (timingIntent.length === "auto") {
			icon = "↔";
			intent = "auto";
			tooltip = "Auto length (from asset)";
		} else if (timingIntent.length === "end") {
			icon = "→";
			intent = "end";
			tooltip = "Extends to timeline end";
		}

		/* eslint-disable no-param-reassign -- Intentional DOM element mutation */
		badge.textContent = icon;
		badge.dataset["intent"] = intent;
		badge.title = tooltip;
		/* eslint-enable no-param-reassign */
	}

	private getAssetType(clip: ResolvedClip): string {
		const { asset } = clip;
		if (!asset) return "unknown";
		return asset.type || "unknown";
	}

	private getAssetIcon(type: string): string {
		const icons: Record<string, string> = {
			video: "▶",
			image: "⛰",
			audio: "♪",
			text: "T",
			"rich-text": "T",
			shape: "◇",
			caption: "≡",
			html: "<>",
			luma: "◐",
			svg: "◇"
		};
		return icons[type] ?? "•";
	}

	private getClipLabel(clip: ResolvedClip): string {
		const { asset } = clip;
		if (!asset) return "Clip";

		// Check if clip has ID (needed for AI assets)
		const clipWithId = clip as ResolvedClipWithId;
		const hasClipId = "id" in clip && typeof clipWithId.id === "string";

		// AI assets get numbered labels with prompt preview
		if (isAiAsset(asset)) {
			const number = hasClipId ? (this.options.aiAssetNumbers.get(clipWithId.id) ?? null) : null;
			const typeLabel = getAiAssetTypeLabel(asset.type);
			const prompt = asset.prompt || "";

			if (number && prompt) {
				const truncatedPrompt = prompt.substring(0, 40);
				return `${typeLabel} ${number}: ${truncatedPrompt}${prompt.length > 40 ? "..." : ""}`;
			}
			if (number) {
				return `${typeLabel} ${number}`;
			}
			// Fallback if number computation fails
			return `${typeLabel} Asset`;
		}

		// Get asset type for other checks
		const assetType = "type" in asset && typeof (asset as { type: unknown }).type === "string" ? (asset as { type: string }).type : undefined;

		// SVG special case
		if (assetType === "svg") {
			return "Shape";
		}

		if ("src" in asset && typeof asset.src === "string") {
			const { src } = asset;
			const filename = src.split("/").pop() || src;
			return filename.split("?")[0];
		}

		if ("text" in asset && typeof asset.text === "string") {
			return asset.text.substring(0, 20) + (asset.text.length > 20 ? "..." : "");
		}

		return assetType || "Clip";
	}

	public getState(): ClipState | null {
		return this.currentState;
	}

	// ========== Luma Drop Target State ==========

	/** Set this clip as a luma drop target (during luma drag) */
	public setLumaDropTarget(active: boolean): void {
		this.element.classList.toggle("ss-clip-luma-target", active);
	}

	/** Play attachment animation when luma is successfully attached */
	public playLumaAttachAnimation(): void {
		// Add animation class and remove after animation completes
		this.element.classList.add("ss-clip-luma-attached");
		setTimeout(() => {
			this.element.classList.remove("ss-clip-luma-attached");
		}, 600); // Match CSS animation duration
	}

	/** Check if this clip has an attached luma mask */
	public hasLumaMask(): boolean {
		return this.currentLumaRef !== undefined;
	}
}
