import type { ResolvedClip, SvgAsset } from "@schemas";
import { injectShotstackStyles } from "@styles/inject";

import { BaseToolbar } from "./base-toolbar";

export class SvgToolbar extends BaseToolbar {
	private fillColorInput: HTMLInputElement | null = null;
	private cornerRadiusInput: HTMLInputElement | null = null;
	private fillInitialState: ResolvedClip | null = null;
	private cornerInitialState: ResolvedClip | null = null;
	private currentFill = "#0000ff";
	private currentRadius = 0;

	override mount(parent: HTMLElement): void {
		injectShotstackStyles();
		this.container = document.createElement("div");
		this.container.className = "ss-toolbar ss-svg-toolbar";
		this.container.innerHTML = `
			<div class="ss-toolbar-mode-toggle" data-mode="asset">
				<button class="ss-toolbar-mode-btn active" data-mode="asset" title="Asset properties (\`)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="2" y="2" width="12" height="12" rx="1.5"/>
						<path d="M2 6h12M6 6v8"/>
					</svg>
				</button>
				<button class="ss-toolbar-mode-btn" data-mode="clip" title="Clip timing (\`)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="8" cy="8" r="6"/>
						<path d="M8 5v3l2 2"/>
					</svg>
				</button>
				<span class="ss-toolbar-mode-indicator"></span>
			</div>
			<div class="ss-toolbar-mode-divider"></div>
			<input type="color" data-fill-color class="ss-toolbar-color-input" value="#0000ff" title="Fill color" />
			<div class="ss-toolbar-mode-divider"></div>
			<div class="ss-toolbar-slider-group--inline">
				<label>Corner</label>
				<input type="number" data-corner-radius-input
					   class="ss-toolbar-number-input" min="0" max="100" step="1" value="0"
					   title="Corner radius" />
			</div>
		`;
		parent.insertBefore(this.container, parent.firstChild);

		this.fillColorInput = this.container.querySelector("[data-fill-color]");
		this.cornerRadiusInput = this.container.querySelector("[data-corner-radius-input]");

		if (this.fillColorInput) {
			this.fillColorInput.addEventListener("pointerdown", () => {
				this.fillInitialState = structuredClone(this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx));
			});

			this.fillColorInput.addEventListener("input", e => {
				this.currentFill = (e.target as HTMLInputElement).value;
				const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
				const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
				if (!clipId || !clip || clip.asset?.type !== "svg") return;

				const svgAsset = clip.asset as SvgAsset;
				if (!svgAsset.src) return;

				const updated = structuredClone(svgAsset);
				updated.src = this.updateSvgAttr(svgAsset.src, "fill", this.currentFill);

				this.edit.updateClipInDocument(clipId, { asset: updated as ResolvedClip["asset"] });
				this.edit.resolveClip(clipId);
			});

			this.fillColorInput.addEventListener("change", () => {
				if (!this.fillInitialState) return;
				const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
				const finalClip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
				if (clipId && finalClip) {
					this.edit.commitClipUpdate(clipId, this.fillInitialState, finalClip);
				}
				this.fillInitialState = null;
			});
		}

		// Corner radius control
		if (this.cornerRadiusInput) {
			// Apply changes on every input (typing, stepper clicks, arrow keys)
			this.cornerRadiusInput.addEventListener("input", () => {
				try {
					// Capture initial state on first change
					if (!this.cornerInitialState) {
						this.cornerInitialState = structuredClone(this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx));
					}

					this.currentRadius = parseInt(this.cornerRadiusInput!.value, 10);

					if (Number.isNaN(this.currentRadius)) {
						return;
					}

					const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
					const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);

					if (!clipId || !clip || clip.asset?.type !== "svg") {
						return;
					}

					const svgAsset = clip.asset as SvgAsset;
					if (!svgAsset.src) return;

					// Parse SVG to get shape dimensions
					const doc = new DOMParser().parseFromString(svgAsset.src, "image/svg+xml");
					const shape = doc.querySelector("svg")?.querySelector("rect, circle, polygon, path, ellipse, line, polyline");

					const { scaleFactor, maxRadius } = shape ? this.getScalingInfo(svgAsset.src, shape) : { scaleFactor: 1, maxRadius: 100 };

					// Clamp the radius (with negative protection)
					const clampedRadius = Math.max(0, Math.min(this.currentRadius, maxRadius));
					if (clampedRadius !== this.currentRadius) {
						this.currentRadius = clampedRadius;
						this.cornerRadiusInput!.value = String(clampedRadius);
					}

					// Scale the radius
					const scaledRadius = clampedRadius * scaleFactor;
					const roundedRadius = Math.round(scaledRadius * 100) / 100;

					const updated = structuredClone(svgAsset);
					updated.src = this.updateSvgAttr(svgAsset.src, "rx", String(roundedRadius));
					updated.src = this.updateSvgAttr(updated.src, "ry", String(roundedRadius));

					// Update document and render
					this.edit.updateClipInDocument(clipId, { asset: updated as ResolvedClip["asset"] });
					this.edit.resolveClip(clipId);
				} catch (error) {
					console.error("[SVG Corner Radius] Error applying radius:", error);
					this.cornerInitialState = null;
				}
			});

			// Commit to undo history when done editing
			this.cornerRadiusInput.addEventListener("blur", () => {
				if (!this.cornerInitialState) {
					return;
				}

				const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
				const finalClip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);

				if (clipId && finalClip) {
					this.edit.commitClipUpdate(clipId, this.cornerInitialState, finalClip);
				}

				this.cornerInitialState = null;
			});
		}

		this.setupOutsideClickHandler();
	}

	/**
	 * Pure function: Calculate scale factor and max radius from SVG source and shape element.
	 */
	private getScalingInfo(svgSrc: string, shape: Element): { scaleFactor: number; maxRadius: number } {
		const viewBoxMatch = svgSrc.match(/viewBox=["']([^"']+)["']/);
		const scaleFactor = viewBoxMatch ? parseFloat(viewBoxMatch[1].split(/\s+/)[2]) / 100 : 1;

		const rectWidth = parseFloat(shape.getAttribute("width") || "100");
		const rectHeight = parseFloat(shape.getAttribute("height") || "100");
		const smallestDimension = Math.min(rectWidth, rectHeight);
		const maxRadius = smallestDimension / 2 / scaleFactor;

		return { scaleFactor, maxRadius };
	}

	private updateSvgAttr(svg: string, attr: string, value: string): string {
		const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
		const shape = doc.querySelector("svg")?.querySelector("rect, circle, polygon, path, ellipse, line, polyline");

		if (!shape) {
			// Fallback: insert attribute on first shape tag
			const shapePattern = /(<(?:rect|circle|polygon|path|ellipse|line|polyline)[^>]*)(>)/;
			return svg.replace(shapePattern, `$1 ${attr}="${value}"$2`);
		}

		shape.setAttribute(attr, value);
		return new XMLSerializer().serializeToString(doc);
	}

	protected override syncState(): void {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clip || clip.asset?.type !== "svg") {
			return;
		}

		const svgAsset = clip.asset as SvgAsset;
		if (!svgAsset.src) return;

		const doc = new DOMParser().parseFromString(svgAsset.src, "image/svg+xml");
		const shape = doc.querySelector("svg")?.querySelector("rect, circle, polygon, path, ellipse, line, polyline");
		if (!shape) {
			return;
		}

		// Sync fill color
		this.currentFill = shape.getAttribute("fill") || "#0000ff";
		if (this.fillColorInput) this.fillColorInput.value = this.currentFill;

		// Sync corner radius
		const rx = shape.getAttribute("rx") || "0";

		// Calculate scale factor and max radius
		const { scaleFactor, maxRadius } = this.getScalingInfo(svgAsset.src, shape);
		const maxSliderValue = Math.round(maxRadius);

		// Update input max attribute dynamically
		if (this.cornerRadiusInput) {
			this.cornerRadiusInput.max = String(maxSliderValue);
		}

		// Normalize the radius back to base scale for display
		const normalizedRadius = parseFloat(rx) / scaleFactor;
		this.currentRadius = Math.round(normalizedRadius);

		if (this.cornerRadiusInput) {
			this.cornerRadiusInput.value = String(this.currentRadius);
		}
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [];
	}

	override dispose(): void {
		this.fillInitialState = null;
		this.cornerInitialState = null;
		this.fillColorInput = null;
		this.cornerRadiusInput = null;
		super.dispose();
	}
}
