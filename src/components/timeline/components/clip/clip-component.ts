import type { ResolvedClip } from "@schemas/clip";

import { TimelineEntity } from "../../core/timeline-entity";
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
	/** Reference to attached luma (if this clip has a mask) */
	attachedLuma?: LumaRef;
	/** Callback when mask badge is clicked - passes the CONTENT clip indices */
	onMaskClick?: (contentTrackIndex: number, contentClipIndex: number) => void;
}

/** Renders a single clip element */
export class ClipComponent extends TimelineEntity {
	private readonly options: ClipComponentOptions;
	private currentState: ClipState | null = null;
	private currentLumaRef: LumaRef | undefined = undefined;
	private maskBadge: HTMLElement | null = null;
	private needsUpdate = true;

	constructor(clip: ClipState, options: ClipComponentOptions) {
		super("div", "ss-clip");
		this.options = options;
		this.buildElement(clip);
		this.currentState = clip;
		this.element.dataset["clipId"] = clip.id;
	}

	private buildElement(clip: ClipState): void {
		// Content container
		const content = document.createElement("div");
		content.className = "ss-clip-content";

		// Icon for asset type
		const icon = document.createElement("span");
		icon.className = "ss-clip-icon";
		content.appendChild(icon);

		const label = document.createElement("span");
		label.className = "ss-clip-label";
		content.appendChild(label);

		this.element.appendChild(content);

		// Timing badge
		if (this.options.showBadges) {
			const badge = document.createElement("div");
			badge.className = "ss-clip-badge";
			this.element.appendChild(badge);
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

	public async load(): Promise<void> {
		// No async initialization needed
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// State is updated via updateClip()
	}

	public draw(): void {
		if (!this.needsUpdate || !this.currentState) return;
		this.needsUpdate = false;

		const clip = this.currentState;
		const { config } = clip;
		const assetType = this.getAssetType(config);

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

		// Update icon
		const icon = this.element.querySelector(".ss-clip-icon") as HTMLElement;
		if (icon) {
			icon.textContent = this.getAssetIcon(assetType);
		}

		// Update label
		const label = this.element.querySelector(".ss-clip-label") as HTMLElement;
		if (label) {
			label.textContent = this.getClipLabel(config);
		}

		// Update timing badge
		if (this.options.showBadges) {
			const badge = this.element.querySelector(".ss-clip-badge") as HTMLElement;
			if (badge) {
				this.updateBadge(badge, clip.timingIntent);
			}
		}

		// Update mask badge (show if clip has attached luma)
		this.updateMaskBadge();

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
				this.maskBadge.title = "Luma mask attached - click to toggle";
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

	/** Update clip state and mark for re-render */
	public updateClip(clip: ClipState, attachedLuma?: LumaRef): void {
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
			image: "◻",
			audio: "♪",
			text: "T",
			"rich-text": "T",
			shape: "◇",
			caption: "≡",
			html: "<>",
			luma: "◐"
		};
		return icons[type] ?? "•";
	}

	private getClipLabel(clip: ResolvedClip): string {
		const { asset } = clip;
		if (!asset) return "Clip";

		// Try to get a meaningful label
		if ("src" in asset && typeof asset.src === "string") {
			const { src } = asset;
			const filename = src.split("/").pop() || src;
			return filename.split("?")[0];
		}

		if ("text" in asset && typeof asset.text === "string") {
			return asset.text.substring(0, 20) + (asset.text.length > 20 ? "..." : "");
		}

		return asset.type || "Clip";
	}

	public getState(): ClipState | null {
		return this.currentState;
	}
}
