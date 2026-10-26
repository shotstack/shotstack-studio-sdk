import { EffectPresetBuilder } from "@animations/effect-preset-builder";
import { KeyframeBuilder, type PresetPoint } from "@animations/keyframe-builder";
import { TransitionPresetBuilder } from "@animations/transition-preset-builder";
import { WipeFilter } from "@animations/wipe-filter";
import { type Edit } from "@core/edit-session";
import { InternalEvent } from "@core/events/edit-events";
import { calculateContainerScale, calculateFitScale, calculateSpriteTransform, type FitMode } from "@core/layout/fit-system";
import {
	type AliasReference,
	type ResolvedTiming,
	type Seconds,
	type TimingIntent,
	type TimingValue,
	isAliasReference,
	sec
} from "@core/timing/types";
import { Pointer } from "@inputs/pointer";
import { type Size, type Vector } from "@layouts/geometry";
import { relativeToAbsolute, absoluteToRelative, rotationOriginOffset } from "@layouts/position-builder";
import { type Clip, type Keyframe, type ResolvedClip } from "@schemas";
import * as pixi from "pixi.js";

import { Entity } from "../../../core/shared/entity";

/**
 * Tracks a merge field binding for a specific property path.
 * Used to restore placeholders on export for properties that haven't changed.
 */
export interface MergeFieldBinding {
	/** The original placeholder string, e.g., "{{ HERO_IMAGE }}" */
	placeholder: string;
	/** The resolved value at binding time, used for change detection */
	resolvedValue: string;
}

export enum PlayerType {
	Video = "video",
	Image = "image",
	Audio = "audio",
	Text = "text",
	RichText = "rich-text",
	Luma = "luma",
	Html = "html",
	Html5 = "html5",
	Shape = "shape",
	Caption = "caption",
	Svg = "svg",
	TextToImage = "text-to-image",
	ImageToVideo = "image-to-video",
	TextToSpeech = "text-to-speech",
	RichCaption = "rich-caption"
}

/**
 * Base class for all visual content players in the canvas.
 *
 * Player is responsible for rendering clip content (video, image, text, etc.)
 * and applying keyframe animations.
 *
 */
export abstract class Player extends Entity {
	private static readonly DiscardedFrameCount = 0;

	public layer: number;
	public shouldDispose: boolean;
	public readonly playerType: PlayerType;

	/**
	 * Stable ID from the document for reconciliation.
	 * Used to track this Player across document changes.
	 */
	public clipId: string | null = null;

	/** True when the player's asset needs external resolution (e.g. alias caption awaiting transcription). */
	public needsResolution = false;

	/**
	 * Why the asset couldn't be shown, or null. A failing player draws a placeholder and still
	 * resolves load() so the rest of the edit keeps loading; this is how the failure is reported.
	 */
	public loadError: string | null = null;

	protected edit: Edit;
	public clipConfiguration: ResolvedClip;

	private resolvedTiming: ResolvedTiming;

	private offsetXKeyframeBuilder?: KeyframeBuilder;
	private offsetYKeyframeBuilder?: KeyframeBuilder;
	private scaleKeyframeBuilder?: KeyframeBuilder;
	private opacityKeyframeBuilder?: KeyframeBuilder;
	private rotationKeyframeBuilder?: KeyframeBuilder;
	private skewXKeyframeBuilder?: KeyframeBuilder;
	private skewYKeyframeBuilder?: KeyframeBuilder;
	private maskXKeyframeBuilder?: KeyframeBuilder;
	private wipeBrightnessBuilder?: KeyframeBuilder;
	private wipeInFromRight: boolean = false;
	private wipeOutFromRight: boolean = false;
	private wipeOutStart: number = Number.POSITIVE_INFINITY;
	private wipeFilter: WipeFilter | null = null;
	private zoomBlurBuilder?: KeyframeBuilder;
	private zoomBlurFilter: pixi.BlurFilter | null = null;
	private rotationOrigin?: { x: KeyframeBuilder; y: KeyframeBuilder };

	private wipeMask: pixi.Graphics | null;
	protected lumaWrapper: pixi.Container;
	protected contentContainer: pixi.Container;

	constructor(edit: Edit, clipConfiguration: ResolvedClip, playerType: PlayerType) {
		super();

		this.edit = edit;
		this.layer = 0;
		this.shouldDispose = false;
		this.playerType = playerType;

		this.clipConfiguration = clipConfiguration;

		this.resolvedTiming = { start: clipConfiguration.start, length: clipConfiguration.length };

		this.wipeMask = null;

		// TODO: Lazy-init lumaWrapper in getLumaWrapper() to avoid allocating per player when unused
		this.lumaWrapper = new pixi.Container();
		this.contentContainer = new pixi.Container();
		this.lumaWrapper.addChild(this.contentContainer);
		this.getContainer().addChild(this.lumaWrapper);
	}

	public reconfigureAfterRestore(): void {
		this.configureKeyframes();
	}

	/**
	 * Reload the asset for this player (e.g., when asset.src changes).
	 * Override in subclasses that have loadable assets (image, video).
	 * Default implementation is a no-op.
	 */
	public async reloadAsset(): Promise<void> {
		// Default: no-op. Override in ImagePlayer, VideoPlayer, etc.
	}

	protected configureKeyframes() {
		const length = this.getLength();
		const config = this.clipConfiguration;
		// A property that holds neither a number nor tweens, such as an unresolved merge field, plays its default.
		const curve = (value: Keyframe[] | number | undefined, fallback: number) =>
			new KeyframeBuilder(typeof value === "number" || (Array.isArray(value) && value.length > 0) ? value : fallback);

		this.offsetXKeyframeBuilder = curve(config.offset?.x, 0);
		this.offsetYKeyframeBuilder = curve(config.offset?.y, 0);
		this.scaleKeyframeBuilder = curve(config.scale, 1);
		this.opacityKeyframeBuilder = curve(config.opacity, 1);
		this.rotationKeyframeBuilder = curve(config.transform?.rotate?.angle, 0);
		this.skewXKeyframeBuilder = curve(config.transform?.skew?.x, 0);
		this.skewYKeyframeBuilder = curve(config.transform?.skew?.y, 0);

		// Build resolved clip config for preset builders
		const resolvedClipConfig: ResolvedClip = {
			...config,
			start: this.getStart(),
			length
		};

		const effectSet = new EffectPresetBuilder(resolvedClipConfig).buildRelative(this.edit.size, this.getSize());
		const transitionSet = new TransitionPresetBuilder(resolvedClipConfig).buildRelative();

		// The render applies the effect, then the in transition, then the out, each over the curves left by those before.
		for (const preset of [effectSet, transitionSet.in, transitionSet.out]) {
			this.offsetXKeyframeBuilder.addPresetPoints(preset.offsetXKeyframes);
			this.offsetYKeyframeBuilder.addPresetPoints(preset.offsetYKeyframes);
			this.scaleKeyframeBuilder.addPresetPoints(preset.scaleKeyframes);
			this.opacityKeyframeBuilder.addPresetPoints(preset.opacityKeyframes);
			this.rotationKeyframeBuilder.addPresetPoints(preset.rotationKeyframes);
		}

		// Curves only transitions drive, resting at a value that leaves the clip untouched.
		const transitionCurve = (rest: number, ...phases: PresetPoint[][]) => {
			if (!phases.some(points => points.length)) return undefined;
			const builder = new KeyframeBuilder(rest);
			phases.forEach(points => builder.addPresetPoints(points));
			return builder;
		};
		const { in: transitionIn, out: transitionOut } = transitionSet;

		this.maskXKeyframeBuilder = transitionCurve(1, transitionIn.maskXKeyframes, transitionOut.maskXKeyframes);

		// Wipe brightness sweep (wipeLeft/wipeRight) — driven through WipeFilter, not a mask.
		this.wipeBrightnessBuilder = transitionCurve(-1, transitionIn.brightnessKeyframes, transitionOut.brightnessKeyframes);
		this.wipeInFromRight = transitionIn.wipeFromRight;
		this.wipeOutFromRight = transitionOut.wipeFromRight;
		this.wipeOutStart = transitionOut.brightnessKeyframes[0]?.time ?? Number.POSITIVE_INFINITY;

		this.zoomBlurBuilder = transitionCurve(0, transitionIn.blurKeyframes, transitionOut.blurKeyframes);

		const originX = transitionCurve(0.5, transitionIn.originXKeyframes, transitionOut.originXKeyframes);
		const originY = transitionCurve(0.5, transitionIn.originYKeyframes, transitionOut.originYKeyframes);
		this.rotationOrigin = originX && originY ? { x: originX, y: originY } : undefined;
	}

	private getRotationOriginOffset(angle: number, scale: Vector): Vector {
		if (!this.rotationOrigin) return { x: 0, y: 0 };
		const time = this.getPlaybackTime();
		const size = this.getSize();
		const origin = { x: this.rotationOrigin.x.getValue(time), y: this.rotationOrigin.y.getValue(time) };
		return rotationOriginOffset({ width: size.width * scale.x, height: size.height * scale.y }, origin, angle);
	}

	protected recordLoadError(error: unknown): void {
		this.loadError = error instanceof Error ? error.message : String(error);
	}

	public override async load(): Promise<void> {
		this.loadError = null;
		if (this.lumaWrapper?.destroyed) {
			this.lumaWrapper = new pixi.Container();
			this.getContainer().addChild(this.lumaWrapper);
		}
		if (this.contentContainer?.destroyed) {
			this.contentContainer = new pixi.Container();
			this.lumaWrapper.addChild(this.contentContainer);
		}

		this.getContainer().sortableChildren = true;

		// Enable pointer events for click-to-select
		this.getContainer().cursor = "pointer";
		this.getContainer().eventMode = "static";
		this.getContainer().on?.("pointerdown", this.onPointerDown.bind(this));
	}

	public override update(_: number, __: number): void {
		this.applyPlayheadState();
	}

	/**
	 * Apply all playhead-time-dependent container state (visibility, transform, opacity, wipe mask)
	 * for the current playback time. Called by the per-frame tick and directly by static capture.
	 */
	public applyPlayheadState(): void {
		this.getContainer().visible = this.isActive();
		this.getContainer().zIndex = 100000 - this.layer * 100;
		if (!this.isActive()) {
			return;
		}

		const pivot = this.getPivot();
		const position = this.getPosition();
		const scaleVector = this.getContainerScale();
		const angle = this.getRotation();
		const turn = this.getRotationOriginOffset(angle, scaleVector);

		this.getContainer().scale.set(scaleVector.x, scaleVector.y);
		this.getContainer().pivot.set(pivot.x, pivot.y);
		this.getContainer().position.set(position.x + pivot.x + turn.x, position.y + pivot.y + turn.y);

		this.contentContainer.alpha = this.getOpacity();
		this.getContainer().angle = angle;

		const skew = this.getSkew();
		this.getContainer().skew?.set(skew.x * (Math.PI / 180), skew.y * (Math.PI / 180));

		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}

		// Update wipe/reveal mask animation
		this.updateWipeMask();
		this.updateWipeFilter();
		this.updateZoomBlur();

		if (this.shouldDiscardFrame()) {
			this.contentContainer.alpha = 0;
		}
	}

	private updateWipeMask(): void {
		if (!this.maskXKeyframeBuilder) {
			if (this.wipeMask) {
				this.getContainer().mask = null;
				this.wipeMask.destroy();
				this.wipeMask = null;
			}
			return;
		}

		const maskProgress = this.maskXKeyframeBuilder.getValue(this.getPlaybackTime());
		const size = this.getSize();

		// Create mask if it doesn't exist
		if (!this.wipeMask) {
			this.wipeMask = new pixi.Graphics();
			this.getContainer().addChild(this.wipeMask);
			this.getContainer().mask = this.wipeMask;
		}

		// Update mask to create wipe effect
		this.wipeMask.clear();
		this.wipeMask.rect(0, 0, size.width * maskProgress, size.height);
		this.wipeMask.fill(0xffffff);
	}

	private updateWipeFilter(): void {
		if (!this.wipeBrightnessBuilder) {
			this.removeWipeFilter();
			return;
		}
		if (!this.wipeFilter) {
			this.wipeFilter = new WipeFilter();
			this.contentContainer.filters = [this.wipeFilter];
		}
		const time = this.getPlaybackTime();
		this.wipeFilter.brightness = this.wipeBrightnessBuilder.getValue(time);
		this.wipeFilter.revealFromRight = time >= this.wipeOutStart ? this.wipeOutFromRight : this.wipeInFromRight;
	}

	private removeWipeFilter(): void {
		if (!this.wipeFilter) return;
		this.contentContainer.filters = [];
		this.wipeFilter.destroy();
		this.wipeFilter = null;
	}

	private updateZoomBlur(): void {
		if (!this.zoomBlurBuilder) {
			if (!this.zoomBlurFilter) return;
			this.getContainer().filters = [];
			this.zoomBlurFilter.destroy();
			this.zoomBlurFilter = null;
			return;
		}
		if (!this.zoomBlurFilter) {
			this.zoomBlurFilter = new pixi.BlurFilter();
			this.getContainer().filters = [this.zoomBlurFilter];
		}
		// The render blurs by a whole-pixel radius before applying the clip's scale, so on screen the blur grows with scale
		// and the canvas zoom. pixi's Gaussian approximates the render's three box-blur passes.
		const time = this.getPlaybackTime();
		const radius = Math.trunc(this.zoomBlurBuilder.getValue(time));
		const canvas = this.getContainer().parent?.worldTransform;
		const canvasZoom = canvas ? Math.hypot(canvas.a, canvas.b) : 1;
		this.zoomBlurFilter.enabled = radius > 0;
		this.zoomBlurFilter.strength = radius * (this.scaleKeyframeBuilder?.getValue(time) ?? 1) * canvasZoom;
	}

	public override dispose(): void {
		this.wipeMask?.destroy();
		this.wipeMask = null;
		this.wipeFilter?.destroy();
		this.wipeFilter = null;
		this.zoomBlurFilter?.destroy();
		this.zoomBlurFilter = null;

		this.contentContainer?.destroy();
		this.lumaWrapper?.destroy();
	}

	public getStart(): Seconds {
		return this.resolvedTiming.start;
	}

	public getLength(): Seconds {
		return this.resolvedTiming.length;
	}

	public getEnd(): Seconds {
		return sec(this.resolvedTiming.start + this.resolvedTiming.length);
	}

	/**
	 * Get timing intent from document (source of truth).
	 * Returns "auto"/"end"/"alias://x" strings as stored in the document, not resolved numeric values.
	 */
	public getTimingIntent(): TimingIntent {
		if (this.clipId) {
			const docClip = this.edit.getDocumentClipById(this.clipId);
			if (docClip) {
				let startIntent: Seconds | "auto" | AliasReference;
				if (docClip.start === "auto") {
					startIntent = "auto";
				} else if (isAliasReference(docClip.start)) {
					startIntent = docClip.start as AliasReference;
				} else {
					startIntent = docClip.start as Seconds;
				}

				let lengthIntent: TimingValue;
				if (docClip.length === "auto" || docClip.length === "end") {
					lengthIntent = docClip.length;
				} else if (isAliasReference(docClip.length)) {
					lengthIntent = docClip.length as AliasReference;
				} else {
					lengthIntent = docClip.length as Seconds;
				}

				return { start: startIntent, length: lengthIntent };
			}
		}
		// Fallback: use resolved timing from clipConfiguration
		return {
			start: this.clipConfiguration.start,
			length: this.clipConfiguration.length
		};
	}

	public getResolvedTiming(): ResolvedTiming {
		return { ...this.resolvedTiming };
	}

	public setResolvedTiming(timing: ResolvedTiming): void {
		this.resolvedTiming = { ...timing };
		this.clipConfiguration.start = timing.start;
		this.clipConfiguration.length = timing.length;
	}

	/**
	 * Get the clip configuration with timing intent applied.
	 * Note: Placeholder restoration is handled by document.toJSON() for export,
	 * or by EditSession.getTemplateClip() for API callers.
	 */
	public getExportableClip(): Clip {
		const exported = structuredClone(this.clipConfiguration) as Record<string, unknown>;

		// Apply timing intent (preserves "auto", "end" strings)
		const intent = this.getTimingIntent();
		exported["start"] = intent.start;
		exported["length"] = intent.length;

		return exported as Clip;
	}

	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Get the playback time relative to clip start, in seconds.
	 */
	public getPlaybackTime(): number {
		const clipTime = this.edit.playbackTime - this.getStart();

		if (clipTime < 0) return 0;
		if (clipTime > this.getLength()) return this.getLength();

		return clipTime;
	}

	/**
	 * Playback speed of the asset (1 = normal). Matches `asset.speed` used by renders.
	 */
	public getAssetSpeed(): number {
		const { speed } = this.clipConfiguration.asset as { speed?: unknown };
		return typeof speed === "number" ? speed : 1;
	}

	/**
	 * Map clip playback time to source media time. Matches render output:
	 * sourceTime = speed × (trim + playbackTime), i.e. trim is also scaled by speed.
	 */
	public getSourceTime(): number {
		const { trim = 0 } = this.clipConfiguration.asset as { trim?: number };
		return this.getAssetSpeed() * (trim + this.getPlaybackTime());
	}

	/** Duration of the source media in seconds, or null when unknown or not applicable. */
	public getSourceDuration(): number | null {
		return null;
	}

	/**
	 * Longest clip length the source media can fill at the current trim and speed
	 * (duration / speed − trim), or null when unbounded or the media isn't loaded yet.
	 */
	public getMaxLength(): number | null {
		const duration = this.getSourceDuration();
		if (duration === null) return null;

		const speed = this.getAssetSpeed();
		if (speed <= 0) return null;

		const { trim = 0 } = this.clipConfiguration.asset as { trim?: number };
		return Math.max(0.1, duration / speed - trim);
	}

	public abstract getSize(): Size;

	/**
	 * Returns the source content dimensions (before fit scaling).
	 */
	public getContentSize(): Size {
		return this.getSize();
	}

	protected getDisplaySize(): Size {
		return {
			width: this.clipConfiguration.width ?? this.edit.size.width,
			height: this.clipConfiguration.height ?? this.edit.size.height
		};
	}

	/** @internal */
	public getContentContainer(): pixi.Container {
		return this.contentContainer;
	}

	/** @internal */
	public getLumaWrapper(): pixi.Container {
		return this.lumaWrapper;
	}

	public getOpacity(): number {
		const opacity = this.opacityKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1;
		return Math.min(1, Math.max(0, opacity));
	}

	public getPosition(): Vector {
		const offset: Vector = {
			x: this.offsetXKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0,
			y: this.offsetYKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0
		};

		return relativeToAbsolute(this.edit.size, this.getSize(), this.clipConfiguration.position ?? "center", offset);
	}

	public getPivot(): Vector {
		const size = this.getSize();
		return { x: size.width / 2, y: size.height / 2 };
	}

	/**
	 * Calculate the new offset position after moving by a pixel delta.
	 * Returns the new offset without mutating player state.
	 * Used for keyboard arrow key positioning.
	 * @internal
	 */
	public calculateMoveOffset(deltaX: number, deltaY: number): { x: number; y: number } {
		const currentPos = this.getPosition();
		const newAbsolutePos = { x: currentPos.x + deltaX, y: currentPos.y + deltaY };

		const relativePos = absoluteToRelative(this.edit.size, this.getSize(), this.clipConfiguration.position ?? "center", newAbsolutePos);

		return { x: relativePos.x, y: relativePos.y };
	}

	protected getFitScale(): number {
		const targetSize = {
			width: this.clipConfiguration.width ?? this.edit.size.width,
			height: this.clipConfiguration.height ?? this.edit.size.height
		};
		const contentSize = this.getContentSize();
		const fit = (this.clipConfiguration.fit ?? "crop") as FitMode;

		return calculateFitScale(contentSize, targetSize, fit);
	}

	public getScale(): number {
		return (this.scaleKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1) * this.getFitScale();
	}

	protected getContainerScale(): Vector {
		const baseScale = this.scaleKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1;
		const contentSize = this.getContentSize();
		const fit = (this.clipConfiguration.fit ?? "crop") as FitMode;
		const hasFixedDimensions = Boolean(this.clipConfiguration.width && this.clipConfiguration.height);

		return calculateContainerScale(contentSize, this.edit.size, fit, baseScale, hasFixedDimensions);
	}

	public getRotation(): number {
		return this.rotationKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0;
	}

	public getSkew(): { x: number; y: number } {
		return {
			x: this.skewXKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0,
			y: this.skewYKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0
		};
	}

	public isActive(): boolean {
		// playbackTime is in seconds, matching clip start/end
		return this.edit.playbackTime >= this.getStart() && this.edit.playbackTime < this.getEnd();
	}

	/**
	 * Project this player's current frame into the Pixi scene for a one-off static capture.
	 * @internal
	 */
	public async prepareStaticRender(): Promise<void> {
		// Default: content is already a Pixi-scene projection — nothing to do.
	}

	/** @internal Undo any transient scene mutation made by prepareStaticRender(). Default: no-op. */
	public endStaticRender(): void {
		// Default: no-op.
	}

	public shouldDiscardFrame(): boolean {
		return this.getPlaybackTime() < Player.DiscardedFrameCount;
	}

	/**
	 * Handle pointer down — emit click event for selection handling.
	 * All drag/resize/rotate interaction is handled by SelectionHandles.
	 */
	private onPointerDown(event: pixi.FederatedPointerEvent): void {
		if (event.button !== Pointer.ButtonLeftClick) {
			return;
		}

		this.edit.getInternalEvents().emit(InternalEvent.CanvasClipClicked, { player: this });
	}

	protected applyFixedDimensions(): void {
		const clipWidth = this.clipConfiguration.width;
		const clipHeight = this.clipConfiguration.height;
		if (!clipWidth || !clipHeight) return;

		// Find sprite by type, not index (mask may be children[0] after refresh)
		const sprite = this.contentContainer.children.find(child => child instanceof pixi.Sprite) as pixi.Sprite | undefined;
		if (!sprite?.texture) return;

		const nativeWidth = sprite.texture.width;
		const nativeHeight = sprite.texture.height;
		const fit = this.clipConfiguration.fit || "crop";

		// Get or create the crop mask
		const existingMask = this.contentContainer.mask;
		let clipMask: pixi.Graphics;
		if (existingMask instanceof pixi.Graphics) {
			clipMask = existingMask;
		} else if (!existingMask) {
			clipMask = new pixi.Graphics();
			this.contentContainer.addChild(clipMask);
			this.contentContainer.mask = clipMask;
		} else {
			return;
		}

		// Expand mask to accommodate centered border strokes
		// Canvas library renders borders centered on content boundary (half extends outward)
		const { asset } = this.clipConfiguration;
		const borderWidth = asset && "border" in asset && asset.border && typeof asset.border === "object" ? (asset.border.width ?? 0) : 0;

		const halfBorder = borderWidth / 2;

		clipMask.clear();
		clipMask.rect(-halfBorder, -halfBorder, clipWidth + borderWidth, clipHeight + borderWidth);
		clipMask.fill(0xffffff);

		sprite.anchor.set(0.5, 0.5);

		// Use pure function for sprite transform calculation
		const nativeSize = { width: nativeWidth, height: nativeHeight };
		const targetSize = { width: clipWidth, height: clipHeight };
		const transform = calculateSpriteTransform(nativeSize, targetSize, fit as FitMode);

		sprite.scale.set(transform.scaleX, transform.scaleY);
		sprite.position.set(transform.positionX, transform.positionY);
	}

	protected applyAnchorPositioning(anchor: string, clipWidth: number, clipHeight: number, sprite: pixi.Sprite): void {
		const renderedWidth = sprite.width;
		const renderedHeight = sprite.height;

		const hasMask = Boolean(sprite.mask);
		if (hasMask) {
			sprite.position.set(0, 0);
			return;
		}

		const a = (anchor ?? "center").toLowerCase();

		let offsetX = 0;
		let offsetY = 0;

		if (a.includes("left") || a === "left") {
			offsetX = 0;
		} else if (a.includes("right") || a === "right") {
			offsetX = clipWidth - renderedWidth;
		} else {
			offsetX = (clipWidth - renderedWidth) / 2;
		}

		if (a.includes("top") || a === "top") {
			offsetY = 0;
		} else if (a.includes("bottom") || a === "bottom") {
			offsetY = clipHeight - renderedHeight;
		} else {
			offsetY = (clipHeight - renderedHeight) / 2;
		}

		sprite.position.set(offsetX, offsetY);
	}

	/**
	 * Override in subclasses to enable edge resize handles for dimension changes.
	 * When true, edge handles will be shown instead of corner scale handles.
	 */
	public supportsEdgeResize(): boolean {
		return false;
	}

	/**
	 * Called when dimensions change via edge resize. Override in subclasses to handle re-rendering.
	 */
	protected onDimensionsChanged(): void {
		// Default implementation does nothing - subclasses override this
	}

	/**
	 * Public wrapper for notifying dimension changes.
	 * Called by SelectionHandles after edge resize operations.
	 */
	public notifyDimensionsChanged(): void {
		this.onDimensionsChanged();
	}
}
