import { ComposedKeyframeBuilder } from "@animations/composed-keyframe-builder";
import { EffectPresetBuilder } from "@animations/effect-preset-builder";
import { KeyframeBuilder } from "@animations/keyframe-builder";
import { TransitionPresetBuilder } from "@animations/transition-preset-builder";
import { type Edit } from "@core/edit";
import { InternalEvent } from "@core/events/edit-events";
import { getNestedValue, setNestedValue } from "@core/shared/utils";
import { type Milliseconds, type ResolvedTiming, type TimingIntent, ms, sec, toSec } from "@core/timing/types";
import { Pointer } from "@inputs/pointer";
import { type Size, type Vector } from "@layouts/geometry";
import { PositionBuilder } from "@layouts/position-builder";
import { type Clip, type ResolvedClip } from "@schemas/clip";
import { type Keyframe } from "@schemas/keyframe";
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
 * TODO: Move handles on UI level (screen space)
 * TODO: Handle overlapping frames - ex: length of a clip is 1.5s but there's an in (1s) and out (1s) transition
 * TODO: Scale X and Y needs to be implemented separately for getFitScale cover
 * TODO: Move animation effects and transitions out of player
 * TODO: On pointer down and custom keyframe, add a keyframe at the current time. Get current and time and push a keyframe into the state, and then reconfigure the keyframes.
 * TODO: Move bounding box to a separate entity
 */

export abstract class Player extends Entity {
	private static readonly SnapThreshold = 20;
	private static readonly RotationSnapThreshold = 5; // degrees
	private static readonly RotationSnapAngles = [0, 45, 90, 135, 180, 225, 270, 315];

	private static readonly DiscardedFrameCount = 0;

	private static readonly ScaleHandleRadius = 4;
	private static readonly OutlineWidth = 1;

	private static readonly EdgeHitZone = 8;
	private static readonly RotationHitZone = 15;
	private static readonly ExpandedHitArea = 10000;
	private static readonly CornerNames = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;

	// Curved arrow for rotation cursor
	private static readonly RotationCursorPath =
		"M1113.142,1956.331C1008.608,1982.71 887.611,2049.487 836.035,2213.487" +
		"L891.955,2219.403L779,2396L705.496,2199.678L772.745,2206.792" +
		"C832.051,1999.958 984.143,1921.272 1110.63,1892.641L1107.952,1824.711" +
		"L1299,1911L1115.34,2012.065L1113.142,1956.331Z";

	// Double-headed arrow for resize cursor
	private static readonly ResizeCursorPath =
		"M1320,2186L1085,2421L1120,2457L975,2496L1014,2351L1050,2386L1285,2151L1250,2115L1396,2075L1356,2221L1320,2186Z";
	private static readonly ResizeCursorMatrix = "matrix(0.807871,0.707107,-0.807871,0.707107,2111.872433,-206.020386)";

	// Base angles for cursors (before clip rotation is applied)
	private static readonly CursorBaseAngles: Record<string, number> = {
		// Rotation cursor angles
		topLeft: 0,
		topRight: 90,
		bottomRight: 180,
		bottomLeft: 270,
		// Resize cursor angles (NW-SE diagonal = 45°, NE-SW = -45°, horizontal = 0°, vertical = 90°)
		topLeftResize: 45,
		topRightResize: -45,
		bottomRightResize: 45,
		bottomLeftResize: -45,
		left: 0,
		right: 0,
		top: 90,
		bottom: 90
	};

	private static buildRotationCursor(angleDeg: number): string {
		const path = Player.RotationCursorPath;
		const transform = angleDeg === 0 ? "" : `<g transform='translate(1002 2110) rotate(${angleDeg}) translate(-1002 -2110)'>`;
		const closeTag = angleDeg === 0 ? "" : "</g>";
		const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='680 1800 640 620'>${transform}<path d='${path}' fill='black' stroke='white' stroke-width='33.33'/>${closeTag}</svg>`;
		return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
	}

	private static buildResizeCursor(angleDeg: number): string {
		const path = Player.ResizeCursorPath;
		const matrix = Player.ResizeCursorMatrix;
		const svg =
			`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='905 1940 640 620'>` +
			`<g transform='rotate(${angleDeg} 1225 2250)'>` +
			`<g transform='${matrix}'><path d='${path}' fill='black' stroke='white' stroke-width='33.33'/></g></g></svg>`;
		return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
	}

	private static readonly MinDimension = 50;
	private static readonly MaxDimension = 3840;

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
	private maskXKeyframeBuilder?: KeyframeBuilder; // maskX doesn't need composition

	private wipeMask: pixi.Graphics | null;

	private outline: pixi.Graphics | null;
	private topLeftScaleHandle: pixi.Graphics | null;
	private topRightScaleHandle: pixi.Graphics | null;
	private bottomLeftScaleHandle: pixi.Graphics | null;
	private bottomRightScaleHandle: pixi.Graphics | null;

	private isHovering: boolean;
	private isDragging: boolean;
	private dragOffset: Vector;

	private scaleDirection: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | null;

	private edgeDragDirection: "left" | "right" | "top" | "bottom" | null;
	private edgeDragStart: Vector;
	private originalDimensions: { width: number; height: number; offsetX: number; offsetY: number } | null;

	private isRotating: boolean;
	private rotationStart: number | null;
	private initialRotation: number;
	private rotationCorner: (typeof Player.CornerNames)[number] | null;

	private initialClipConfiguration: ResolvedClip | null;
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
			start: sec(clipConfiguration.start),
			length: sec(clipConfiguration.length)
		};

		const startValue = typeof clipConfiguration.start === "number" ? ms(clipConfiguration.start * 1000) : ms(0);
		const lengthValue = typeof clipConfiguration.length === "number" ? ms(clipConfiguration.length * 1000) : ms(3000);
		this.resolvedTiming = { start: startValue, length: lengthValue };

		this.wipeMask = null;

		this.outline = null;
		this.topLeftScaleHandle = null;
		this.topRightScaleHandle = null;
		this.bottomRightScaleHandle = null;
		this.bottomLeftScaleHandle = null;

		this.isHovering = false;

		this.isDragging = false;
		this.dragOffset = { x: 0, y: 0 };

		this.scaleDirection = null;

		this.edgeDragDirection = null;
		this.edgeDragStart = { x: 0, y: 0 };
		this.originalDimensions = null;

		this.isRotating = false;
		this.rotationStart = null;
		this.initialRotation = 0;
		this.rotationCorner = null;

		this.initialClipConfiguration = null;

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
		const resolvedClipConfig: ResolvedClip = {
			...config,
			start: this.getStart() / 1000,
			length: length / 1000
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

		if (this.outline) {
			this.outline.destroy();
			this.outline = null;
		}
		if (this.topLeftScaleHandle) {
			this.topLeftScaleHandle.destroy();
			this.topLeftScaleHandle = null;
		}
		if (this.topRightScaleHandle) {
			this.topRightScaleHandle.destroy();
			this.topRightScaleHandle = null;
		}
		if (this.bottomRightScaleHandle) {
			this.bottomRightScaleHandle.destroy();
			this.bottomRightScaleHandle = null;
		}
		if (this.bottomLeftScaleHandle) {
			this.bottomLeftScaleHandle.destroy();
			this.bottomLeftScaleHandle = null;
		}

		this.outline = new pixi.Graphics();
		this.getContainer().addChild(this.outline);

		// Create corner resize handles for assets that support edge resize
		if (this.supportsEdgeResize()) {
			this.topLeftScaleHandle = new pixi.Graphics();
			this.topRightScaleHandle = new pixi.Graphics();
			this.bottomRightScaleHandle = new pixi.Graphics();
			this.bottomLeftScaleHandle = new pixi.Graphics();

			this.topLeftScaleHandle.zIndex = 1000;
			this.topRightScaleHandle.zIndex = 1000;
			this.bottomRightScaleHandle.zIndex = 1000;
			this.bottomLeftScaleHandle.zIndex = 1000;

			// Set resize cursors for corner handles (dynamic based on rotation)
			this.topLeftScaleHandle.eventMode = "static";
			this.topLeftScaleHandle.cursor = this.getCornerResizeCursor("topLeft");
			this.topRightScaleHandle.eventMode = "static";
			this.topRightScaleHandle.cursor = this.getCornerResizeCursor("topRight");
			this.bottomRightScaleHandle.eventMode = "static";
			this.bottomRightScaleHandle.cursor = this.getCornerResizeCursor("bottomRight");
			this.bottomLeftScaleHandle.eventMode = "static";
			this.bottomLeftScaleHandle.cursor = this.getCornerResizeCursor("bottomLeft");

			this.getContainer().addChild(this.topLeftScaleHandle);
			this.getContainer().addChild(this.topRightScaleHandle);
			this.getContainer().addChild(this.bottomRightScaleHandle);
			this.getContainer().addChild(this.bottomLeftScaleHandle);
		}

		this.getContainer().sortableChildren = true;

		this.getContainer().cursor = "pointer";
		this.getContainer().eventMode = "static";

		this.getContainer().on("pointerdown", this.onPointerStart.bind(this));
		this.getContainer().on("pointermove", this.onPointerMove.bind(this));
		this.getContainer().on("globalpointermove", this.onPointerMove.bind(this));
		this.getContainer().on("pointerup", this.onPointerUp.bind(this));
		this.getContainer().on("pointerupoutside", this.onPointerUp.bind(this));

		this.getContainer().on("pointerover", this.onPointerOver.bind(this));
		this.getContainer().on("pointerout", this.onPointerOut.bind(this));
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
		if (!this.outline) {
			return;
		}

		const isSelected = this.edit.isPlayerSelected(this);

		const isExporting = this.edit.isInExportMode();

		if (((!this.isActive() || !isSelected) && !this.isHovering) || isExporting) {
			this.outline.clear();
			this.topLeftScaleHandle?.clear();
			this.topRightScaleHandle?.clear();
			this.bottomRightScaleHandle?.clear();
			this.bottomLeftScaleHandle?.clear();
			return;
		}

		const color = this.isHovering || this.isDragging ? 0x00ffff : 0x0d99ff;
		const size = this.getSize();

		const uiScale = this.getUIScale();

		// Expand hit area to include rotation zones outside corners
		// During drag operations, keep the expanded hit area to capture mouse events anywhere
		const isDraggingHandle = this.isRotating || this.scaleDirection !== null || this.edgeDragDirection !== null;
		if (!isDraggingHandle) {
			const hitMargin = (Player.RotationHitZone + Player.ScaleHandleRadius) / uiScale;
			this.getContainer().hitArea = new pixi.Rectangle(-hitMargin, -hitMargin, size.width + hitMargin * 2, size.height + hitMargin * 2);
		}

		this.outline.clear();
		this.outline.strokeStyle = { width: Player.OutlineWidth / uiScale, color };
		this.outline.rect(0, 0, size.width, size.height);
		this.outline.stroke();

		if (!this.isActive() || !isSelected) {
			return;
		}

		// Draw corner scale handles (only for assets that don't support edge resize)
		if (this.topLeftScaleHandle && this.topRightScaleHandle && this.bottomRightScaleHandle && this.bottomLeftScaleHandle) {
			const handleSize = (Player.ScaleHandleRadius * 2) / uiScale;

			this.topLeftScaleHandle.fillStyle = { color };
			this.topLeftScaleHandle.clear();
			this.topLeftScaleHandle.rect(-handleSize / 2, -handleSize / 2, handleSize, handleSize);
			this.topLeftScaleHandle.fill();

			this.topRightScaleHandle.fillStyle = { color };
			this.topRightScaleHandle.clear();
			this.topRightScaleHandle.rect(size.width - handleSize / 2, -handleSize / 2, handleSize, handleSize);
			this.topRightScaleHandle.fill();

			this.bottomRightScaleHandle.fillStyle = { color };
			this.bottomRightScaleHandle.clear();
			this.bottomRightScaleHandle.rect(size.width - handleSize / 2, size.height - handleSize / 2, handleSize, handleSize);
			this.bottomRightScaleHandle.fill();

			this.bottomLeftScaleHandle.fillStyle = { color };
			this.bottomLeftScaleHandle.clear();
			this.bottomLeftScaleHandle.rect(-handleSize / 2, size.height - handleSize / 2, handleSize, handleSize);
			this.bottomLeftScaleHandle.fill();
		}
	}

	public override dispose(): void {
		this.outline?.destroy();
		this.outline = null;

		this.topLeftScaleHandle?.destroy();
		this.topLeftScaleHandle = null;

		this.topRightScaleHandle?.destroy();
		this.topRightScaleHandle = null;

		this.bottomLeftScaleHandle?.destroy();
		this.bottomLeftScaleHandle = null;

		this.bottomRightScaleHandle?.destroy();
		this.bottomRightScaleHandle = null;

		this.wipeMask?.destroy();
		this.wipeMask = null;

		this.contentContainer?.destroy();
	}

	public getStart(): Milliseconds {
		return this.resolvedTiming.start;
	}

	public getLength(): Milliseconds {
		return this.resolvedTiming.length;
	}

	public getEnd(): Milliseconds {
		return ms(this.resolvedTiming.start + this.resolvedTiming.length);
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
		this.timingIntent = {
			start: toSec(this.resolvedTiming.start),
			length: toSec(this.resolvedTiming.length)
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

	public getPlaybackTime(): number {
		const clipTime = this.edit.playbackTime - this.getStart();

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
		const targetWidth = this.clipConfiguration.width ?? this.edit.size.width;
		const targetHeight = this.clipConfiguration.height ?? this.edit.size.height;
		const contentSize = this.getContentSize();

		switch (this.clipConfiguration.fit ?? "crop") {
			case "crop":
			case "cover":
				return Math.max(targetWidth / contentSize.width, targetHeight / contentSize.height);
			case "contain":
				return Math.min(targetWidth / contentSize.width, targetHeight / contentSize.height);
			case "none":
			default:
				return 1;
		}
	}

	public getScale(): number {
		return (this.scaleKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1) * this.getFitScale();
	}

	private getUIScale(): number {
		return this.getScale() * this.edit.getCanvasZoom();
	}

	protected getContainerScale(): Vector {
		const baseScale = this.scaleKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1;

		// When explicit dimensions are set, applyFixedDimensions() handles fit scaling internally
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			return { x: baseScale, y: baseScale };
		}

		const contentSize = this.getContentSize();
		const fit = this.clipConfiguration.fit ?? "crop";

		if (contentSize.width === 0 || contentSize.height === 0) {
			return { x: baseScale, y: baseScale };
		}

		const targetWidth = this.edit.size.width;
		const targetHeight = this.edit.size.height;
		const ratioX = targetWidth / contentSize.width;
		const ratioY = targetHeight / contentSize.height;

		switch (fit) {
			case "contain": {
				const uniform = Math.min(ratioX, ratioY) * baseScale;
				return { x: uniform, y: uniform };
			}
			case "crop": {
				const uniform = Math.max(ratioX, ratioY) * baseScale;
				return { x: uniform, y: uniform };
			}
			case "cover": {
				return { x: ratioX * baseScale, y: ratioY * baseScale };
			}
			case "none":
			default:
				return { x: baseScale, y: baseScale };
		}
	}

	public getRotation(): number {
		return this.rotationKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0;
	}

	public isActive(): boolean {
		return this.edit.playbackTime >= this.getStart() && this.edit.playbackTime < this.getEnd();
	}

	public shouldDiscardFrame(): boolean {
		return this.getPlaybackTime() < Player.DiscardedFrameCount;
	}

	private getRotationCorner(event: pixi.FederatedPointerEvent): (typeof Player.CornerNames)[number] | null {
		const localPoint = event.getLocalPosition(this.getContainer());
		const size = this.getSize();
		const uiScale = this.getUIScale();
		const handleRadius = Player.ScaleHandleRadius / uiScale;
		const rotationZone = Player.RotationHitZone / uiScale;

		const cornerCoords = [
			{ x: 0, y: 0 },
			{ x: size.width, y: 0 },
			{ x: size.width, y: size.height },
			{ x: 0, y: size.height }
		];

		const isOutsideContent = localPoint.x < 0 || localPoint.x > size.width || localPoint.y < 0 || localPoint.y > size.height;
		if (!isOutsideContent) return null;

		for (let i = 0; i < cornerCoords.length; i += 1) {
			const corner = cornerCoords[i];
			const dx = localPoint.x - corner.x;
			const dy = localPoint.y - corner.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance > handleRadius && distance < handleRadius + rotationZone) {
				return Player.CornerNames[i];
			}
		}
		return null;
	}

	private getContentCenter(): Vector {
		const bounds = this.contentContainer.getBounds();
		return {
			x: bounds.x + bounds.width / 2,
			y: bounds.y + bounds.height / 2
		};
	}

	private getRotationCursor(corner: string): string {
		const baseAngle = Player.CursorBaseAngles[corner] ?? 0;
		return Player.buildRotationCursor(baseAngle + this.getRotation());
	}

	private getCornerResizeCursor(corner: string): string {
		const baseAngle = Player.CursorBaseAngles[`${corner}Resize`] ?? 45;
		return Player.buildResizeCursor(baseAngle + this.getRotation());
	}

	private getEdgeResizeCursor(edge: "left" | "right" | "top" | "bottom"): string {
		const baseAngle = Player.CursorBaseAngles[edge] ?? 0;
		return Player.buildResizeCursor(baseAngle + this.getRotation());
	}

	private onPointerStart(event: pixi.FederatedPointerEvent): void {
		if (event.button !== Pointer.ButtonLeftClick) {
			return;
		}

		this.edit.events.emit(InternalEvent.CanvasClipClicked, { player: this });

		this.initialClipConfiguration = structuredClone(this.clipConfiguration);

		if (this.clipHasKeyframes()) {
			return;
		}

		this.scaleDirection = null;

		// Check for rotation zone click (outside corners)
		const rotationCorner = this.getRotationCorner(event);
		if (rotationCorner) {
			this.isRotating = true;
			this.rotationCorner = rotationCorner;
			const center = this.getContentCenter();
			this.rotationStart = Math.atan2(event.globalY - center.y, event.globalX - center.x);
			this.initialRotation = this.getRotation();

			// Expand hit area to capture pointer events anywhere during rotation drag
			const size = Player.ExpandedHitArea;
			this.getContainer().hitArea = new pixi.Rectangle(-size, -size, size * 2, size * 2);
			return;
		}

		const isTopLeftScaling = this.topLeftScaleHandle?.getBounds().containsPoint(event.globalX, event.globalY);
		if (isTopLeftScaling) {
			this.scaleDirection = "topLeft";
		}

		const isTopRightScaling = this.topRightScaleHandle?.getBounds().containsPoint(event.globalX, event.globalY);
		if (isTopRightScaling) {
			this.scaleDirection = "topRight";
		}

		const isBottomRightScaling = this.bottomRightScaleHandle?.getBounds().containsPoint(event.globalX, event.globalY);
		if (isBottomRightScaling) {
			this.scaleDirection = "bottomRight";
		}

		const isBottomLeftScaling = this.bottomLeftScaleHandle?.getBounds().containsPoint(event.globalX, event.globalY);
		if (isBottomLeftScaling) {
			this.scaleDirection = "bottomLeft";
		}

		if (this.scaleDirection !== null) {
			const timelinePoint = event.getLocalPosition(this.edit.getContainer());
			this.edgeDragStart = timelinePoint;

			// Get current offset values
			const currentOffsetX = this.offsetXKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0;
			const currentOffsetY = this.offsetYKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0;

			// Use existing dimensions if set, otherwise calculate visual size
			let width: number;
			let height: number;
			if (this.clipConfiguration.width && this.clipConfiguration.height) {
				width = this.clipConfiguration.width;
				height = this.clipConfiguration.height;
			} else {
				const contentSize = this.getContentSize();
				const fitScale = this.getFitScale();
				const userScale = this.scaleKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1;
				width = contentSize.width * fitScale * userScale;
				height = contentSize.height * fitScale * userScale;

				if (this.clipConfiguration.scale !== undefined) {
					this.clipConfiguration.width = width;
					this.clipConfiguration.height = height;
					delete this.clipConfiguration.scale;
					this.scaleKeyframeBuilder = new ComposedKeyframeBuilder(1, this.getLength(), "multiplicative");
				}
			}

			this.originalDimensions = {
				width,
				height,
				offsetX: currentOffsetX,
				offsetY: currentOffsetY
			};

			// Expand hit area to capture pointer events anywhere during resize drag
			const hitSize = Player.ExpandedHitArea;
			this.getContainer().hitArea = new pixi.Rectangle(-hitSize, -hitSize, hitSize * 2, hitSize * 2);
			return;
		}

		// Check for edge resize interactions (for assets that support edge resize)
		if (this.supportsEdgeResize()) {
			this.edgeDragDirection = null;

			// Get local position within the container
			const localPoint = event.getLocalPosition(this.getContainer());
			const size = this.getSize();
			const hitZone = Player.EdgeHitZone / this.getUIScale();

			// Check if pointer is near any edge (within hit zone)
			const nearLeft = localPoint.x >= -hitZone && localPoint.x <= hitZone;
			const nearRight = localPoint.x >= size.width - hitZone && localPoint.x <= size.width + hitZone;
			const nearTop = localPoint.y >= -hitZone && localPoint.y <= hitZone;
			const nearBottom = localPoint.y >= size.height - hitZone && localPoint.y <= size.height + hitZone;

			// Determine which edge (prioritize horizontal/vertical edges, not corners)
			const withinVerticalRange = localPoint.y > hitZone && localPoint.y < size.height - hitZone;
			const withinHorizontalRange = localPoint.x > hitZone && localPoint.x < size.width - hitZone;

			if (nearLeft && withinVerticalRange) {
				this.edgeDragDirection = "left";
			} else if (nearRight && withinVerticalRange) {
				this.edgeDragDirection = "right";
			} else if (nearTop && withinHorizontalRange) {
				this.edgeDragDirection = "top";
			} else if (nearBottom && withinHorizontalRange) {
				this.edgeDragDirection = "bottom";
			}

			if (this.edgeDragDirection !== null) {
				const timelinePoint = event.getLocalPosition(this.edit.getContainer());
				this.edgeDragStart = timelinePoint;

				// Get current offset values from keyframe builders (handles both numeric and keyframe array cases)
				const currentOffsetX = this.offsetXKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0;
				const currentOffsetY = this.offsetYKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 0;

				// Use existing dimensions if set, otherwise calculate visual size from content + fit scaling
				let width: number;
				let height: number;
				if (this.clipConfiguration.width && this.clipConfiguration.height) {
					width = this.clipConfiguration.width;
					height = this.clipConfiguration.height;
				} else {
					const contentSize = this.getContentSize();
					const fitScale = this.getFitScale();
					const userScale = this.scaleKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1;
					width = contentSize.width * fitScale * userScale;
					height = contentSize.height * fitScale * userScale;

					if (this.clipConfiguration.scale !== undefined) {
						this.clipConfiguration.width = width;
						this.clipConfiguration.height = height;
						delete this.clipConfiguration.scale;
						this.scaleKeyframeBuilder = new ComposedKeyframeBuilder(1, this.getLength(), "multiplicative");
					}
				}

				this.originalDimensions = {
					width,
					height,
					offsetX: currentOffsetX,
					offsetY: currentOffsetY
				};

				// Expand hit area to capture pointer events anywhere during resize drag
				const hitSize = Player.ExpandedHitArea;
				this.getContainer().hitArea = new pixi.Rectangle(-hitSize, -hitSize, hitSize * 2, hitSize * 2);
				return;
			}
		}

		this.isDragging = true;

		const timelinePoint = event.getLocalPosition(this.edit.getContainer());
		this.dragOffset = {
			x: timelinePoint.x - this.getContainer().position.x,
			y: timelinePoint.y - this.getContainer().position.y
		};
	}

	private onPointerMove(event: pixi.FederatedPointerEvent): void {
		// Handle corner resize dragging (two-axis resize)
		if (this.scaleDirection !== null && this.originalDimensions !== null) {
			const timelinePoint = event.getLocalPosition(this.edit.getContainer());

			const deltaX = timelinePoint.x - this.edgeDragStart.x;
			const deltaY = timelinePoint.y - this.edgeDragStart.y;

			let newWidth = this.originalDimensions.width;
			let newHeight = this.originalDimensions.height;
			let newOffsetX = this.originalDimensions.offsetX;
			let newOffsetY = this.originalDimensions.offsetY;

			switch (this.scaleDirection) {
				case "topLeft":
					// Decrease width, decrease height, shift offset to keep bottom-right fixed
					newWidth = this.originalDimensions.width - deltaX;
					newHeight = this.originalDimensions.height - deltaY;
					newOffsetX = this.originalDimensions.offsetX + deltaX / 2 / this.edit.size.width;
					newOffsetY = this.originalDimensions.offsetY - deltaY / 2 / this.edit.size.height;
					break;
				case "topRight":
					// Increase width, decrease height, shift offset to keep bottom-left fixed
					newWidth = this.originalDimensions.width + deltaX;
					newHeight = this.originalDimensions.height - deltaY;
					newOffsetX = this.originalDimensions.offsetX + deltaX / 2 / this.edit.size.width;
					newOffsetY = this.originalDimensions.offsetY - deltaY / 2 / this.edit.size.height;
					break;
				case "bottomLeft":
					// Decrease width, increase height, shift offset to keep top-right fixed
					newWidth = this.originalDimensions.width - deltaX;
					newHeight = this.originalDimensions.height + deltaY;
					newOffsetX = this.originalDimensions.offsetX + deltaX / 2 / this.edit.size.width;
					newOffsetY = this.originalDimensions.offsetY - deltaY / 2 / this.edit.size.height;
					break;
				case "bottomRight":
					// Increase width, increase height, shift offset to keep top-left fixed
					newWidth = this.originalDimensions.width + deltaX;
					newHeight = this.originalDimensions.height + deltaY;
					newOffsetX = this.originalDimensions.offsetX + deltaX / 2 / this.edit.size.width;
					newOffsetY = this.originalDimensions.offsetY - deltaY / 2 / this.edit.size.height;
					break;
				default:
					break;
			}

			// Clamp dimensions
			newWidth = Math.max(Player.MinDimension, Math.min(newWidth, Player.MaxDimension));
			newHeight = Math.max(Player.MinDimension, Math.min(newHeight, Player.MaxDimension));

			// Apply dimensions
			this.clipConfiguration.width = newWidth;
			this.clipConfiguration.height = newHeight;

			// Apply offset
			if (!this.clipConfiguration.offset) {
				this.clipConfiguration.offset = { x: 0, y: 0 };
			}
			this.clipConfiguration.offset.x = newOffsetX;
			this.clipConfiguration.offset.y = newOffsetY;

			// Update keyframe builders
			this.offsetXKeyframeBuilder = new ComposedKeyframeBuilder(this.clipConfiguration.offset.x, this.getLength(), "additive");
			this.offsetYKeyframeBuilder = new ComposedKeyframeBuilder(this.clipConfiguration.offset.y, this.getLength(), "additive");

			// Notify subclass about dimension change
			this.onDimensionsChanged();

			return;
		}

		// Handle edge resize dragging
		if (this.edgeDragDirection !== null && this.originalDimensions !== null) {
			const timelinePoint = event.getLocalPosition(this.edit.getContainer());

			const deltaX = timelinePoint.x - this.edgeDragStart.x;
			const deltaY = timelinePoint.y - this.edgeDragStart.y;

			let newWidth = this.originalDimensions.width;
			let newHeight = this.originalDimensions.height;
			let newOffsetX = this.originalDimensions.offsetX;
			let newOffsetY = this.originalDimensions.offsetY;

			switch (this.edgeDragDirection) {
				case "left":
					// Dragging left edge: width decreases, offset shifts right to keep right edge fixed
					newWidth = this.originalDimensions.width - deltaX;
					newOffsetX = this.originalDimensions.offsetX + deltaX / 2 / this.edit.size.width;
					break;
				case "right":
					// Dragging right edge: width increases, offset shifts right to keep left edge fixed
					newWidth = this.originalDimensions.width + deltaX;
					newOffsetX = this.originalDimensions.offsetX + deltaX / 2 / this.edit.size.width;
					break;
				case "top":
					// Dragging top edge: height decreases, offset shifts up to keep bottom edge fixed
					newHeight = this.originalDimensions.height - deltaY;
					newOffsetY = this.originalDimensions.offsetY - deltaY / 2 / this.edit.size.height;
					break;
				case "bottom":
					// Dragging bottom edge: height increases, offset shifts down to keep top edge fixed
					newHeight = this.originalDimensions.height + deltaY;
					newOffsetY = this.originalDimensions.offsetY - deltaY / 2 / this.edit.size.height;
					break;
				default:
					break;
			}

			// Clamp dimensions to valid bounds
			newWidth = Math.max(Player.MinDimension, Math.min(newWidth, Player.MaxDimension));
			newHeight = Math.max(Player.MinDimension, Math.min(newHeight, Player.MaxDimension));

			// Update clip configuration
			this.clipConfiguration.width = Math.round(newWidth);
			this.clipConfiguration.height = Math.round(newHeight);

			if (!this.clipConfiguration.offset) {
				this.clipConfiguration.offset = { x: 0, y: 0 };
			}
			this.clipConfiguration.offset.x = newOffsetX;
			this.clipConfiguration.offset.y = newOffsetY;

			// Update keyframe builders for position
			this.offsetXKeyframeBuilder = new ComposedKeyframeBuilder(this.clipConfiguration.offset.x, this.getLength(), "additive");
			this.offsetYKeyframeBuilder = new ComposedKeyframeBuilder(this.clipConfiguration.offset.y, this.getLength(), "additive");

			// Notify subclass about dimension change for re-rendering
			this.onDimensionsChanged();

			return;
		}

		// Handle rotation dragging
		if (this.isRotating && this.rotationStart !== null) {
			const center = this.getContentCenter();
			const currentAngle = Math.atan2(event.globalY - center.y, event.globalX - center.x);
			const deltaAngle = (currentAngle - this.rotationStart) * (180 / Math.PI);

			let newRotation = this.initialRotation + deltaAngle;

			// Snap to fixed angles
			const normalizedRotation = ((newRotation % 360) + 360) % 360;
			for (const snapAngle of Player.RotationSnapAngles) {
				const distance = Math.abs(normalizedRotation - snapAngle);
				const wrappedDistance = Math.min(distance, 360 - distance);
				if (wrappedDistance < Player.RotationSnapThreshold) {
					const fullRotations = Math.round(newRotation / 360) * 360;
					newRotation = fullRotations + snapAngle;
					break;
				}
			}

			this.clipConfiguration.transform = {
				...this.clipConfiguration.transform,
				rotate: { angle: newRotation }
			};

			this.rotationKeyframeBuilder = new ComposedKeyframeBuilder(newRotation, this.getLength(), "additive");

			// Update cursor to follow the rotation
			if (this.rotationCorner) {
				this.getContainer().cursor = this.getRotationCursor(this.rotationCorner);
			}
			return;
		}

		if (this.isDragging) {
			const timelinePoint = event.getLocalPosition(this.edit.getContainer());

			const pivot = this.getPivot();

			const cursorPosition: Vector = { x: timelinePoint.x - this.dragOffset.x, y: timelinePoint.y - this.dragOffset.y };
			const updatedPosition: Vector = { x: cursorPosition.x - pivot.x, y: cursorPosition.y - pivot.y };

			// Clear guides before drawing new ones
			this.edit.clearAlignmentGuides();

			// Canvas snap positions (corners + center + edges)
			const canvasSnapPositionsX = [0, this.edit.size.width / 2, this.edit.size.width];
			const canvasSnapPositionsY = [0, this.edit.size.height / 2, this.edit.size.height];

			// Current clip snap positions (corners + center + edges)
			const mySize = this.getSize();
			const myLeft = updatedPosition.x;
			const myRight = updatedPosition.x + mySize.width;
			const myCenterX = updatedPosition.x + mySize.width / 2;
			const myTop = updatedPosition.y;
			const myBottom = updatedPosition.y + mySize.height;
			const myCenterY = updatedPosition.y + mySize.height / 2;

			const clipSnapPositionsX = [myLeft, myCenterX, myRight];
			const clipSnapPositionsY = [myTop, myCenterY, myBottom];

			let closestDistanceX = Player.SnapThreshold;
			let closestDistanceY = Player.SnapThreshold;
			let snapPositionX: number | null = null;
			let snapPositionY: number | null = null;
			let snapTypeX: "canvas" | "clip" | null = null;
			let snapTypeY: "canvas" | "clip" | null = null;
			let snapTargetX: number | null = null;
			let snapTargetY: number | null = null;
			let clipBoundsX: { start: number; end: number } | null = null;
			let clipBoundsY: { start: number; end: number } | null = null;

			// Check canvas snapping
			for (const clipX of clipSnapPositionsX) {
				for (const canvasX of canvasSnapPositionsX) {
					const distance = Math.abs(clipX - canvasX);
					if (distance < closestDistanceX) {
						closestDistanceX = distance;
						snapPositionX = updatedPosition.x + (canvasX - clipX);
						snapTypeX = "canvas";
						snapTargetX = canvasX;
					}
				}
			}

			for (const clipY of clipSnapPositionsY) {
				for (const canvasY of canvasSnapPositionsY) {
					const distance = Math.abs(clipY - canvasY);
					if (distance < closestDistanceY) {
						closestDistanceY = distance;
						snapPositionY = updatedPosition.y + (canvasY - clipY);
						snapTypeY = "canvas";
						snapTargetY = canvasY;
					}
				}
			}

			// Check clip-to-clip snapping
			const otherPlayers = this.edit.getActivePlayersExcept(this);
			for (const other of otherPlayers) {
				const otherPos = other.getContainer().position;
				const otherSize = other.getSize();
				const otherLeft = otherPos.x;
				const otherRight = otherPos.x + otherSize.width;
				const otherCenterX = otherPos.x + otherSize.width / 2;
				const otherTop = otherPos.y;
				const otherBottom = otherPos.y + otherSize.height;
				const otherCenterY = otherPos.y + otherSize.height / 2;

				const otherSnapX = [otherLeft, otherCenterX, otherRight];
				const otherSnapY = [otherTop, otherCenterY, otherBottom];

				for (const clipX of clipSnapPositionsX) {
					for (const targetX of otherSnapX) {
						const distance = Math.abs(clipX - targetX);
						if (distance < closestDistanceX) {
							closestDistanceX = distance;
							snapPositionX = updatedPosition.x + (targetX - clipX);
							snapTypeX = "clip";
							snapTargetX = targetX;
							// Bounds for the dotted line: from top of higher clip to bottom of lower
							const minY = Math.min(myTop, otherTop);
							const maxY = Math.max(myBottom, otherBottom);
							clipBoundsX = { start: minY, end: maxY };
						}
					}
				}

				for (const clipY of clipSnapPositionsY) {
					for (const targetY of otherSnapY) {
						const distance = Math.abs(clipY - targetY);
						if (distance < closestDistanceY) {
							closestDistanceY = distance;
							snapPositionY = updatedPosition.y + (targetY - clipY);
							snapTypeY = "clip";
							snapTargetY = targetY;
							// Bounds for the dotted line: from left of leftmost clip to right of rightmost
							const minX = Math.min(myLeft, otherLeft);
							const maxX = Math.max(myRight, otherRight);
							clipBoundsY = { start: minX, end: maxX };
						}
					}
				}
			}

			// Apply snaps
			if (snapPositionX !== null) {
				updatedPosition.x = snapPositionX;
			}
			if (snapPositionY !== null) {
				updatedPosition.y = snapPositionY;
			}

			// Draw alignment guides for active snaps
			if (snapTypeX !== null && snapTargetX !== null) {
				if (snapTypeX === "canvas") {
					this.edit.showAlignmentGuide("canvas", "x", snapTargetX);
				} else if (clipBoundsX) {
					this.edit.showAlignmentGuide("clip", "x", snapTargetX, clipBoundsX);
				}
			}
			if (snapTypeY !== null && snapTargetY !== null) {
				if (snapTypeY === "canvas") {
					this.edit.showAlignmentGuide("canvas", "y", snapTargetY);
				} else if (clipBoundsY) {
					this.edit.showAlignmentGuide("clip", "y", snapTargetY, clipBoundsY);
				}
			}

			const updatedRelativePosition = this.positionBuilder.absoluteToRelative(
				this.getSize(),
				this.clipConfiguration.position ?? "center",
				updatedPosition
			);

			if (!this.clipConfiguration.offset) {
				this.clipConfiguration.offset = { x: 0, y: 0 };
			}
			this.clipConfiguration.offset.x = updatedRelativePosition.x;
			this.clipConfiguration.offset.y = updatedRelativePosition.y;

			this.offsetXKeyframeBuilder = new ComposedKeyframeBuilder(this.clipConfiguration.offset.x, this.getLength(), "additive");
			this.offsetYKeyframeBuilder = new ComposedKeyframeBuilder(this.clipConfiguration.offset.y, this.getLength(), "additive");
			return;
		}

		// Update cursor based on proximity when not dragging
		if (!this.isDragging && !this.scaleDirection && !this.edgeDragDirection && !this.isRotating) {
			// Check for rotation cursor (outside corners)
			const rotationCorner = this.getRotationCorner(event);
			if (rotationCorner) {
				this.getContainer().cursor = this.getRotationCursor(rotationCorner);
				return;
			}

			// Check for edge resize cursor
			if (this.supportsEdgeResize()) {
				const localPoint = event.getLocalPosition(this.getContainer());
				const size = this.getSize();
				const hitZone = Player.EdgeHitZone / this.getUIScale();

				const nearLeft = localPoint.x >= -hitZone && localPoint.x <= hitZone;
				const nearRight = localPoint.x >= size.width - hitZone && localPoint.x <= size.width + hitZone;
				const nearTop = localPoint.y >= -hitZone && localPoint.y <= hitZone;
				const nearBottom = localPoint.y >= size.height - hitZone && localPoint.y <= size.height + hitZone;

				const withinVerticalRange = localPoint.y > hitZone && localPoint.y < size.height - hitZone;
				const withinHorizontalRange = localPoint.x > hitZone && localPoint.x < size.width - hitZone;

				if ((nearLeft || nearRight) && withinVerticalRange) {
					this.getContainer().cursor = this.getEdgeResizeCursor(nearLeft ? "left" : "right");
				} else if ((nearTop || nearBottom) && withinHorizontalRange) {
					this.getContainer().cursor = this.getEdgeResizeCursor(nearTop ? "top" : "bottom");
				} else {
					this.getContainer().cursor = "pointer";
				}
			} else {
				this.getContainer().cursor = "pointer";
			}
		}
	}

	private onPointerUp(): void {
		if ((this.isDragging || this.scaleDirection !== null || this.edgeDragDirection !== null || this.isRotating) && this.hasStateChanged()) {
			this.edit.setUpdatedClip(this, this.initialClipConfiguration, structuredClone(this.clipConfiguration));
		}

		this.isDragging = false;
		this.dragOffset = { x: 0, y: 0 };
		this.edit.clearAlignmentGuides();

		this.scaleDirection = null;

		this.edgeDragDirection = null;
		this.edgeDragStart = { x: 0, y: 0 };
		this.originalDimensions = null;

		this.isRotating = false;
		this.rotationStart = null;
		this.rotationCorner = null;

		this.initialClipConfiguration = null;
	}

	private onPointerOver(): void {
		this.isHovering = true;
	}

	private onPointerOut(): void {
		this.isHovering = false;
	}

	private clipHasKeyframes(): boolean {
		return [
			this.clipConfiguration.scale,
			this.clipConfiguration.offset?.x,
			this.clipConfiguration.offset?.y,
			this.clipConfiguration.transform?.rotate?.angle
		].some(property => property && typeof property !== "number");
	}

	private hasStateChanged(): boolean {
		if (!this.initialClipConfiguration) return false;

		const currentOffsetX = this.clipConfiguration.offset?.x as number;
		const currentOffsetY = this.clipConfiguration.offset?.y as number;
		const currentScale = this.clipConfiguration.scale as number;
		const currentRotation = Number(this.clipConfiguration.transform?.rotate?.angle ?? 0);
		const currentWidth = this.clipConfiguration.width;
		const currentHeight = this.clipConfiguration.height;

		const initialOffsetX = this.initialClipConfiguration.offset?.x as number;
		const initialOffsetY = this.initialClipConfiguration.offset?.y as number;
		const initialScale = this.initialClipConfiguration.scale as number;
		const initialRotation = Number(this.initialClipConfiguration.transform?.rotate?.angle ?? 0);
		const initialWidth = this.initialClipConfiguration.width;
		const initialHeight = this.initialClipConfiguration.height;

		return (
			(initialOffsetX !== undefined && currentOffsetX !== initialOffsetX) ||
			(initialOffsetY !== undefined && currentOffsetY !== initialOffsetY) ||
			(initialScale !== undefined && currentScale !== initialScale) ||
			currentRotation !== initialRotation ||
			currentWidth !== initialWidth ||
			currentHeight !== initialHeight
		);
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

		switch (fit) {
			// 🟢 cover → non-uniform stretch to exactly fill (distort)
			case "cover": {
				const scaleX = clipWidth / nativeWidth;
				const scaleY = clipHeight / nativeHeight;

				// backend “cover” stretches image to fill without cropping
				sprite.scale.set(scaleX, scaleY);
				sprite.position.set(clipWidth / 2, clipHeight / 2);
				break;
			}

			// 🟢 crop → uniform fill using max scale (overflow is masked/cropped)
			case "crop": {
				const cropScale = Math.max(clipWidth / nativeWidth, clipHeight / nativeHeight);
				sprite.scale.set(cropScale, cropScale);
				sprite.anchor.set(0.5, 0.5);
				sprite.position.set(clipWidth / 2, clipHeight / 2);
				break;
			}

			// 🟢 contain → uniform fit fully inside (may letterbox)
			case "contain": {
				const sx = clipWidth / nativeWidth;
				const sy = clipHeight / nativeHeight;

				const baseScale = Math.min(sx, sy);

				sprite.scale.set(baseScale, baseScale);
				sprite.position.set(clipWidth / 2, clipHeight / 2);
				break;
			}

			// 🟢 none → no fitting, use native size, cropped by mask
			case "none":
			default: {
				sprite.scale.set(1, 1);
				sprite.position.set(clipWidth / 2, clipHeight / 2);
				break;
			}
		}

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
	protected supportsEdgeResize(): boolean {
		return false;
	}

	/**
	 * Called when dimensions change via edge resize. Override in subclasses to handle re-rendering.
	 */
	protected onDimensionsChanged(): void {
		// Default implementation does nothing - subclasses override this
	}
}
