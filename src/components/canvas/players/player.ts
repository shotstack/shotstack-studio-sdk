import { ComposedKeyframeBuilder } from "@animations/composed-keyframe-builder";
import { EffectPresetBuilder } from "@animations/effect-preset-builder";
import { KeyframeBuilder } from "@animations/keyframe-builder";
import { TransitionPresetBuilder } from "@animations/transition-preset-builder";
import { type Edit } from "@core/edit-session";
import { InternalEvent } from "@core/events/edit-events";
import { calculateContainerScale, calculateFitScale, calculateSpriteTransform, type FitMode } from "@core/layout/fit-system";
import { type ResolvedTiming, type Seconds, type TimingIntent, type TimingValue, sec } from "@core/timing/types";
import { Pointer } from "@inputs/pointer";
import { type Size, type Vector } from "@layouts/geometry";
import { PositionBuilder } from "@layouts/position-builder";
import { type Clip, type ResolvedClip, type Keyframe } from "@schemas";
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
	Shape = "shape",
	Caption = "caption",
	Svg = "svg"
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

	protected edit: Edit;
	public clipConfiguration: ResolvedClip;

	private resolvedTiming: ResolvedTiming;

	private positionBuilder: PositionBuilder;
	private offsetXKeyframeBuilder?: ComposedKeyframeBuilder;
	private offsetYKeyframeBuilder?: ComposedKeyframeBuilder;
	private scaleKeyframeBuilder?: ComposedKeyframeBuilder;
	private opacityKeyframeBuilder?: ComposedKeyframeBuilder;
	private rotationKeyframeBuilder?: ComposedKeyframeBuilder;
	private skewXKeyframeBuilder?: ComposedKeyframeBuilder;
	private skewYKeyframeBuilder?: ComposedKeyframeBuilder;
	private maskXKeyframeBuilder?: KeyframeBuilder;

	private wipeMask: pixi.Graphics | null;
	protected contentContainer: pixi.Container;

	constructor(edit: Edit, clipConfiguration: ResolvedClip, playerType: PlayerType) {
		super();

		this.edit = edit;
		this.layer = 0;
		this.shouldDispose = false;
		this.playerType = playerType;

		this.clipConfiguration = clipConfiguration;
		this.positionBuilder = new PositionBuilder(edit.size);

		this.resolvedTiming = { start: clipConfiguration.start, length: clipConfiguration.length };

		this.wipeMask = null;

		this.contentContainer = new pixi.Container();
		this.getContainer().addChild(this.contentContainer);
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

		// Extract base values from clip configuration
		const baseOffsetX = typeof config.offset?.x === "number" ? config.offset.x : 0;
		const baseOffsetY = typeof config.offset?.y === "number" ? config.offset.y : 0;
		const baseScale = typeof config.scale === "number" ? config.scale : 1;
		const baseOpacity = typeof config.opacity === "number" ? config.opacity : 1;
		const baseRotation = typeof config.transform?.rotate?.angle === "number" ? config.transform.rotate.angle : 0;
		const baseSkewX = typeof config.transform?.skew?.x === "number" ? config.transform.skew.x : 0;
		const baseSkewY = typeof config.transform?.skew?.y === "number" ? config.transform.skew.y : 0;

		// Create composed builders with base values
		this.offsetXKeyframeBuilder = new ComposedKeyframeBuilder(baseOffsetX, length, "additive");
		this.offsetYKeyframeBuilder = new ComposedKeyframeBuilder(baseOffsetY, length, "additive");
		this.scaleKeyframeBuilder = new ComposedKeyframeBuilder(baseScale, length, "multiplicative");
		this.opacityKeyframeBuilder = new ComposedKeyframeBuilder(baseOpacity, length, "multiplicative", { min: 0, max: 1 });
		this.rotationKeyframeBuilder = new ComposedKeyframeBuilder(baseRotation, length, "additive");
		this.skewXKeyframeBuilder = new ComposedKeyframeBuilder(baseSkewX, length, "additive");
		this.skewYKeyframeBuilder = new ComposedKeyframeBuilder(baseSkewY, length, "additive");

		// If user has custom keyframes, add them and skip effect/transition layers
		if (this.clipHasKeyframes()) {
			if (Array.isArray(config.scale)) {
				this.scaleKeyframeBuilder.addLayer(config.scale);
			}
			if (Array.isArray(config.opacity)) {
				this.opacityKeyframeBuilder.addLayer(config.opacity);
			}
			if (Array.isArray(config.offset?.x)) {
				this.offsetXKeyframeBuilder.addLayer(config.offset.x);
			}
			if (Array.isArray(config.offset?.y)) {
				this.offsetYKeyframeBuilder.addLayer(config.offset.y);
			}
			if (Array.isArray(config.transform?.rotate?.angle)) {
				this.rotationKeyframeBuilder.addLayer(config.transform.rotate.angle);
			}
			if (Array.isArray(config.transform?.skew?.x)) {
				this.skewXKeyframeBuilder.addLayer(config.transform.skew.x);
			}
			if (Array.isArray(config.transform?.skew?.y)) {
				this.skewYKeyframeBuilder.addLayer(config.transform.skew.y);
			}
			return;
		}

		// Build resolved clip config for preset builders
		const resolvedClipConfig: ResolvedClip = {
			...config,
			start: this.getStart(),
			length
		};

		// Build relative effect keyframes (factors/deltas)
		const effectSet = new EffectPresetBuilder(resolvedClipConfig).buildRelative(this.edit.size, this.getSize());

		// Build relative transition keyframes (separate in/out sets)
		const transitionSet = new TransitionPresetBuilder(resolvedClipConfig).buildRelative();

		// Add effect layer
		this.offsetXKeyframeBuilder.addLayer(effectSet.offsetXKeyframes);
		this.offsetYKeyframeBuilder.addLayer(effectSet.offsetYKeyframes);
		this.scaleKeyframeBuilder.addLayer(effectSet.scaleKeyframes);
		this.opacityKeyframeBuilder.addLayer(effectSet.opacityKeyframes);
		this.rotationKeyframeBuilder.addLayer(effectSet.rotationKeyframes);

		// Add transition-in layer
		this.offsetXKeyframeBuilder.addLayer(transitionSet.in.offsetXKeyframes);
		this.offsetYKeyframeBuilder.addLayer(transitionSet.in.offsetYKeyframes);
		this.scaleKeyframeBuilder.addLayer(transitionSet.in.scaleKeyframes);
		this.opacityKeyframeBuilder.addLayer(transitionSet.in.opacityKeyframes);
		this.rotationKeyframeBuilder.addLayer(transitionSet.in.rotationKeyframes);

		// Add transition-out layer
		this.offsetXKeyframeBuilder.addLayer(transitionSet.out.offsetXKeyframes);
		this.offsetYKeyframeBuilder.addLayer(transitionSet.out.offsetYKeyframes);
		this.scaleKeyframeBuilder.addLayer(transitionSet.out.scaleKeyframes);
		this.opacityKeyframeBuilder.addLayer(transitionSet.out.opacityKeyframes);
		this.rotationKeyframeBuilder.addLayer(transitionSet.out.rotationKeyframes);

		// Mask keyframes (wipe/reveal effects)
		const maskXKeyframes: Keyframe[] = [...transitionSet.in.maskXKeyframes, ...transitionSet.out.maskXKeyframes];
		if (maskXKeyframes.length) {
			this.maskXKeyframeBuilder = new KeyframeBuilder(maskXKeyframes, length);
		}
	}

	public override async load(): Promise<void> {
		if (this.contentContainer?.destroyed) {
			this.contentContainer = new pixi.Container();
			this.getContainer().addChild(this.contentContainer);
		}

		this.getContainer().sortableChildren = true;

		// Enable pointer events for click-to-select
		this.getContainer().cursor = "pointer";
		this.getContainer().eventMode = "static";
		this.getContainer().on?.("pointerdown", this.onPointerDown.bind(this));
	}

	public override update(_: number, __: number): void {
		this.getContainer().visible = this.isActive();
		this.getContainer().zIndex = 100000 - this.layer * 100;
		if (!this.isActive()) {
			return;
		}

		const pivot = this.getPivot();
		const position = this.getPosition();
		const scaleVector = this.getContainerScale();

		this.getContainer().scale.set(scaleVector.x, scaleVector.y);
		this.getContainer().pivot.set(pivot.x, pivot.y);
		this.getContainer().position.set(position.x + pivot.x, position.y + pivot.y);

		const angle = this.getRotation();

		this.contentContainer.alpha = this.getOpacity();
		this.getContainer().angle = angle;

		const skew = this.getSkew();
		this.getContainer().skew?.set(skew.x * (Math.PI / 180), skew.y * (Math.PI / 180));

		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}

		// Update wipe/reveal mask animation
		this.updateWipeMask();

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

	public override draw(): void {
		// Re-apply fixed dimensions when config changes (e.g., fit property updated)
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}
	}

	public override dispose(): void {
		this.wipeMask?.destroy();
		this.wipeMask = null;

		this.contentContainer?.destroy();
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
	 * Returns "auto"/"end" strings as stored in the document, not resolved numeric values.
	 */
	public getTimingIntent(): TimingIntent {
		// Read timing intent from document (source of truth)
		if (this.clipId) {
			const docClip = this.edit.getDocumentClipById(this.clipId);
			if (docClip) {
				const startIntent = docClip.start === "auto" ? "auto" : (docClip.start as Seconds);
				const lengthIntent = (typeof docClip.length === "string" ? docClip.length : docClip.length) as TimingValue;
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

	public abstract getSize(): Size;

	/**
	 * Returns the source content dimensions (before fit scaling).
	 */
	public getContentSize(): Size {
		return this.getSize();
	}

	/** @internal */
	public getContentContainer(): pixi.Container {
		return this.contentContainer;
	}

	public getOpacity(): number {
		return this.opacityKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1;
	}

	public getPosition(): Vector {
		const offset: Vector = {
			x: this.offsetXKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0,
			y: this.offsetYKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0
		};

		return this.positionBuilder.relativeToAbsolute(this.getSize(), this.clipConfiguration.position ?? "center", offset);
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

		const relativePos = this.positionBuilder.absoluteToRelative(this.getSize(), this.clipConfiguration.position ?? "center", newAbsolutePos);

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

	public shouldDiscardFrame(): boolean {
		return this.getPlaybackTime() < Player.DiscardedFrameCount;
	}

	/**
	 * Handle pointer down - emit click event for selection handling.
	 * All drag/resize/rotate interaction is handled by SelectionHandles.
	 */
	private onPointerDown(event: pixi.FederatedPointerEvent): void {
		if (event.button !== Pointer.ButtonLeftClick) {
			return;
		}

		this.edit.events.emit(InternalEvent.CanvasClipClicked, { player: this });
	}

	private clipHasKeyframes(): boolean {
		return [
			this.clipConfiguration.scale,
			this.clipConfiguration.opacity,
			this.clipConfiguration.offset?.x,
			this.clipConfiguration.offset?.y,
			this.clipConfiguration.transform?.rotate?.angle,
			this.clipConfiguration.transform?.skew?.x,
			this.clipConfiguration.transform?.skew?.y
		].some(property => property && typeof property !== "number");
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

		// Get or create the mask - only if it's a Graphics mask or doesn't exist
		// Luma masks are Sprites and should not be replaced
		const existingMask = this.contentContainer.mask;
		let clipMask: pixi.Graphics | null = null;

		if (existingMask instanceof pixi.Graphics) {
			clipMask = existingMask;
		} else if (!existingMask) {
			clipMask = new pixi.Graphics();
			this.contentContainer.addChild(clipMask);
			this.contentContainer.mask = clipMask;
		}

		// Update Graphics mask to current dimensions (skip if it's a luma Sprite mask)
		if (clipMask) {
			clipMask.clear();
			clipMask.rect(0, 0, clipWidth, clipHeight);
			clipMask.fill(0xffffff);
		}

		// keep animation code exactly as-is
		const currentUserScale = this.scaleKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1;

		sprite.anchor.set(0.5, 0.5);

		// Use pure function for sprite transform calculation
		const nativeSize = { width: nativeWidth, height: nativeHeight };
		const targetSize = { width: clipWidth, height: clipHeight };
		const transform = calculateSpriteTransform(nativeSize, targetSize, fit as FitMode);

		sprite.scale.set(transform.scaleX, transform.scaleY);
		sprite.position.set(transform.positionX, transform.positionY);

		// 🟣 keep animation logic untouched
		this.contentContainer.scale.set(currentUserScale, currentUserScale);
		this.contentContainer.position.set((clipWidth / 2) * (1 - currentUserScale), (clipHeight / 2) * (1 - currentUserScale));
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
