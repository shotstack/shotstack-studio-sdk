import { ComposedKeyframeBuilder } from "@animations/composed-keyframe-builder";
import { EffectPresetBuilder } from "@animations/effect-preset-builder";
import { KeyframeBuilder } from "@animations/keyframe-builder";
import { TransitionPresetBuilder } from "@animations/transition-preset-builder";
import { type Edit } from "@core/edit-session";
import { InternalEvent } from "@core/events/edit-events";
import { calculateContainerScale, calculateFitScale, calculateSpriteTransform, type FitMode } from "@core/layout/fit-system";
import { getNestedValue, setNestedValue } from "@core/shared/utils";
import { type ResolvedTiming, type Seconds, type TimingIntent, sec } from "@core/timing/types";
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
	Caption = "caption"
}

/**
 * Base class for all visual content players in the canvas.
 *
 * Player is responsible for rendering clip content (video, image, text, etc.)
 * and applying keyframe animations. It does NOT handle selection UI or
 * drag/resize/rotate interactions - those are handled by SelectionHandles
 * when registered via UIController.
 *
 * This separation allows Canvas to be used as a pure preview renderer
 * without any interactive overlays.
 */
export abstract class Player extends Entity {
	private static readonly DiscardedFrameCount = 0;

	public layer: number;
	public shouldDispose: boolean;
	public readonly playerType: PlayerType;

	protected edit: Edit;
	public clipConfiguration: ResolvedClip;

	private timingIntent: TimingIntent;
	private resolvedTiming: ResolvedTiming;

	private positionBuilder: PositionBuilder;
	private offsetXKeyframeBuilder?: ComposedKeyframeBuilder;
	private offsetYKeyframeBuilder?: ComposedKeyframeBuilder;
	private scaleKeyframeBuilder?: ComposedKeyframeBuilder;
	private opacityKeyframeBuilder?: ComposedKeyframeBuilder;
	private rotationKeyframeBuilder?: ComposedKeyframeBuilder;
	private maskXKeyframeBuilder?: KeyframeBuilder;

	private wipeMask: pixi.Graphics | null;
	protected contentContainer: pixi.Container;

	/**
	 * Tracks which properties came from merge field templates.
	 * Key: property path (e.g., "asset.src"), Value: binding info
	 */
	private mergeFieldBindings: Map<string, MergeFieldBinding> = new Map();

	constructor(edit: Edit, clipConfiguration: ResolvedClip, playerType: PlayerType) {
		super();

		this.edit = edit;
		this.layer = 0;
		this.shouldDispose = false;
		this.playerType = playerType;

		this.clipConfiguration = clipConfiguration;
		this.positionBuilder = new PositionBuilder(edit.size);

		this.timingIntent = {
			start: clipConfiguration.start,
			length: clipConfiguration.length
		};

		// ResolvedClip.start/length are already Seconds branded types
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

		// Create composed builders with base values
		// Offsets use additive composition (base + effect delta + transition delta)
		this.offsetXKeyframeBuilder = new ComposedKeyframeBuilder(baseOffsetX, length, "additive");
		this.offsetYKeyframeBuilder = new ComposedKeyframeBuilder(baseOffsetY, length, "additive");
		// Scale and opacity use multiplicative composition (base × effect factor × transition factor)
		this.scaleKeyframeBuilder = new ComposedKeyframeBuilder(baseScale, length, "multiplicative");
		this.opacityKeyframeBuilder = new ComposedKeyframeBuilder(baseOpacity, length, "multiplicative", { min: 0, max: 1 });
		// Rotation uses additive composition
		this.rotationKeyframeBuilder = new ComposedKeyframeBuilder(baseRotation, length, "additive");

		// If user has custom keyframes, don't add effect/transition layers
		if (this.clipHasKeyframes()) {
			return;
		}

		// Build resolved clip config for preset builders
		// getStart() and length are already in Seconds
		const resolvedClipConfig: ResolvedClip = {
			...config,
			start: this.getStart(),
			length
		};

		// Build relative effect keyframes (factors/deltas)
		const effectSet = new EffectPresetBuilder(resolvedClipConfig).buildRelative(this.edit.size, this.getSize());

		// Build relative transition keyframes (separate in/out sets)
		const transitionSet = new TransitionPresetBuilder(resolvedClipConfig).buildRelative();

		// Add effect layer (runs for full clip duration)
		this.offsetXKeyframeBuilder.addLayer(effectSet.offsetXKeyframes);
		this.offsetYKeyframeBuilder.addLayer(effectSet.offsetYKeyframes);
		this.scaleKeyframeBuilder.addLayer(effectSet.scaleKeyframes);
		this.opacityKeyframeBuilder.addLayer(effectSet.opacityKeyframes);
		this.rotationKeyframeBuilder.addLayer(effectSet.rotationKeyframes);

		// Add transition-in layer (runs at clip start)
		this.offsetXKeyframeBuilder.addLayer(transitionSet.in.offsetXKeyframes);
		this.offsetYKeyframeBuilder.addLayer(transitionSet.in.offsetYKeyframes);
		this.scaleKeyframeBuilder.addLayer(transitionSet.in.scaleKeyframes);
		this.opacityKeyframeBuilder.addLayer(transitionSet.in.opacityKeyframes);
		this.rotationKeyframeBuilder.addLayer(transitionSet.in.rotationKeyframes);

		// Add transition-out layer (runs at clip end)
		this.offsetXKeyframeBuilder.addLayer(transitionSet.out.offsetXKeyframes);
		this.offsetYKeyframeBuilder.addLayer(transitionSet.out.offsetYKeyframes);
		this.scaleKeyframeBuilder.addLayer(transitionSet.out.scaleKeyframes);
		this.opacityKeyframeBuilder.addLayer(transitionSet.out.opacityKeyframes);
		this.rotationKeyframeBuilder.addLayer(transitionSet.out.rotationKeyframes);

		// Mask keyframes (wipe/reveal effects) - still use KeyframeBuilder directly
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

		// Enable pointer events for click-to-select (handled by edit-session)
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
			// No wipe transition, ensure mask is removed
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
		// Apply to main container (not contentContainer) to avoid conflict with fixed dimensions mask
		if (!this.wipeMask) {
			this.wipeMask = new pixi.Graphics();
			this.getContainer().addChild(this.wipeMask);
			this.getContainer().mask = this.wipeMask;
		}

		// Update mask to create wipe effect
		// maskProgress 0 → 1 reveals content from left to right
		// maskProgress 1 → 0 hides content from right to left
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

	public getTimingIntent(): TimingIntent {
		return { ...this.timingIntent };
	}

	public setTimingIntent(intent: Partial<TimingIntent>): void {
		if (intent.start !== undefined) {
			this.timingIntent.start = intent.start;
		}
		if (intent.length !== undefined) {
			this.timingIntent.length = intent.length;
		}
	}

	public getResolvedTiming(): ResolvedTiming {
		return { ...this.resolvedTiming };
	}

	public setResolvedTiming(timing: ResolvedTiming): void {
		this.resolvedTiming = { ...timing };
	}

	public convertToFixedTiming(): void {
		// resolvedTiming is already in Seconds, just copy it
		this.timingIntent = {
			start: this.resolvedTiming.start,
			length: this.resolvedTiming.length
		};
	}

	// ─── Merge Field Binding Methods ─────────────────────────────────────────────

	/**
	 * Set a merge field binding for a property path.
	 * Called when a property is resolved from a merge field template.
	 */
	public setMergeFieldBinding(path: string, binding: MergeFieldBinding): void {
		this.mergeFieldBindings.set(path, binding);
	}

	/**
	 * Get the merge field binding for a property path, if any.
	 */
	public getMergeFieldBinding(path: string): MergeFieldBinding | undefined {
		return this.mergeFieldBindings.get(path);
	}

	/**
	 * Remove a merge field binding (e.g., when user changes the value).
	 */
	public removeMergeFieldBinding(path: string): void {
		this.mergeFieldBindings.delete(path);
	}

	/**
	 * Get all merge field bindings for this player.
	 */
	public getMergeFieldBindings(): Map<string, MergeFieldBinding> {
		return this.mergeFieldBindings;
	}

	/**
	 * Bulk set bindings during player initialization.
	 */
	public setInitialBindings(bindings: Map<string, MergeFieldBinding>): void {
		this.mergeFieldBindings = new Map(bindings);
	}

	/**
	 * Get the exportable clip configuration with merge field placeholders restored.
	 * For properties that haven't changed from their resolved value, the original
	 * placeholder (e.g., "{{ HERO_IMAGE }}") is restored for export.
	 */
	public getExportableClip(): Clip {
		const exported = structuredClone(this.clipConfiguration) as Record<string, unknown>;

		// Restore merge field placeholders for unchanged values
		for (const [path, { placeholder, resolvedValue }] of this.mergeFieldBindings) {
			const currentValue = getNestedValue(exported, path);
			if (currentValue === resolvedValue) {
				// Value unchanged - restore the placeholder for export
				setNestedValue(exported, path, placeholder);
			}
			// If value changed, leave current value (binding is broken)
		}

		// Apply timing intent (preserves "auto", "end" strings)
		const intent = this.getTimingIntent();
		exported["start"] = intent.start;
		exported["length"] = intent.length;

		return exported as Clip;
	}

	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Get the playback time relative to clip start, in seconds.
	 * Used for keyframe animation calculations.
	 */
	public getPlaybackTime(): number {
		// Convert edit.playbackTime (ms) to seconds for comparison with clip timing
		const playbackTimeSeconds = this.edit.playbackTime / 1000;
		const clipTime = playbackTimeSeconds - this.getStart();

		if (clipTime < 0) return 0;
		if (clipTime > this.getLength()) return this.getLength();

		return clipTime;
	}

	public abstract getSize(): Size;

	/**
	 * Returns the source content dimensions (before fit scaling).
	 * Override in subclasses that have different source vs output sizes.
	 * Default implementation returns getSize().
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
	 * Move the clip by a pixel delta. Used for keyboard arrow key positioning.
	 * @internal
	 */
	public moveBy(deltaX: number, deltaY: number): void {
		const currentPos = this.getPosition();
		const newAbsolutePos = { x: currentPos.x + deltaX, y: currentPos.y + deltaY };

		const relativePos = this.positionBuilder.absoluteToRelative(this.getSize(), this.clipConfiguration.position ?? "center", newAbsolutePos);

		if (!this.clipConfiguration.offset) {
			this.clipConfiguration.offset = { x: 0, y: 0 };
		}
		this.clipConfiguration.offset.x = relativePos.x;
		this.clipConfiguration.offset.y = relativePos.y;

		this.offsetXKeyframeBuilder = new ComposedKeyframeBuilder(relativePos.x, this.getLength(), "additive");
		this.offsetYKeyframeBuilder = new ComposedKeyframeBuilder(relativePos.y, this.getLength(), "additive");
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

	public isActive(): boolean {
		// Convert edit.playbackTime (ms) to seconds for comparison
		const playbackTimeSeconds = this.edit.playbackTime / 1000;
		return playbackTimeSeconds >= this.getStart() && playbackTimeSeconds < this.getEnd();
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
			this.clipConfiguration.offset?.x,
			this.clipConfiguration.offset?.y,
			this.clipConfiguration.transform?.rotate?.angle
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

		// Get or create the mask
		let clipMask = this.contentContainer.mask as pixi.Graphics;
		if (!clipMask) {
			clipMask = new pixi.Graphics();
			this.contentContainer.addChild(clipMask);
			this.contentContainer.mask = clipMask;
		}

		// Update mask to current dimensions
		clipMask.clear();
		clipMask.rect(0, 0, clipWidth, clipHeight);
		clipMask.fill(0xffffff);

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
