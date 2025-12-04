import { EffectPresetBuilder } from "@animations/effect-preset-builder";
import { KeyframeBuilder } from "@animations/keyframe-builder";
import { TransitionPresetBuilder } from "@animations/transition-preset-builder";
import { type Edit } from "@core/edit";
import { type ResolvedTiming, type TimingIntent } from "@core/timing/types";
import { Pointer } from "@inputs/pointer";
import { type Size, type Vector } from "@layouts/geometry";
import { PositionBuilder } from "@layouts/position-builder";
import { type Clip, type ResolvedClipConfig } from "@schemas/clip";
import { type Keyframe } from "@schemas/keyframe";
import * as pixi from "pixi.js";

import { Entity } from "../../../core/shared/entity";

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

	private static readonly DiscardedFrameCount = Math.ceil((1 / 30) * 1000);

	private static readonly ScaleHandleRadius = 4;
	private static readonly OutlineWidth = 1;

	private static readonly MinScale = 0.1;
	private static readonly MaxScale = 5;

	private static readonly EdgeHitZone = 8;
	private static readonly MinDimension = 50;
	private static readonly MaxDimension = 3840;

	public layer: number;
	public shouldDispose: boolean;

	protected edit: Edit;
	public clipConfiguration: Clip;

	private timingIntent: TimingIntent;
	private resolvedTiming: ResolvedTiming;

	private positionBuilder: PositionBuilder;
	private offsetXKeyframeBuilder?: KeyframeBuilder;
	private offsetYKeyframeBuilder?: KeyframeBuilder;
	private scaleKeyframeBuilder?: KeyframeBuilder;
	private opacityKeyframeBuilder?: KeyframeBuilder;
	private rotationKeyframeBuilder?: KeyframeBuilder;

	private outline: pixi.Graphics | null;
	private topLeftScaleHandle: pixi.Graphics | null;
	private topRightScaleHandle: pixi.Graphics | null;
	private bottomLeftScaleHandle: pixi.Graphics | null;
	private bottomRightScaleHandle: pixi.Graphics | null;

	private isHovering: boolean;
	private isDragging: boolean;
	private dragOffset: Vector;

	private scaleDirection: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | null;
	private scaleStart: number | null;
	private scaleOffset: Vector;

	private edgeDragDirection: "left" | "right" | "top" | "bottom" | null;
	private edgeDragStart: Vector;
	private originalDimensions: { width: number; height: number; offsetX: number; offsetY: number } | null;

	private initialClipConfiguration: Clip | null;
	protected contentContainer: pixi.Container;

	constructor(edit: Edit, clipConfiguration: Clip) {
		super();

		this.edit = edit;
		this.layer = 0;
		this.shouldDispose = false;

		this.clipConfiguration = clipConfiguration;
		this.positionBuilder = new PositionBuilder(edit.size);

		this.timingIntent = {
			start: clipConfiguration.start,
			length: clipConfiguration.length
		};

		const startValue = typeof clipConfiguration.start === "number" ? clipConfiguration.start * 1000 : 0;
		const lengthValue = typeof clipConfiguration.length === "number" ? clipConfiguration.length * 1000 : 3000;
		this.resolvedTiming = { start: startValue, length: lengthValue };

		this.outline = null;
		this.topLeftScaleHandle = null;
		this.topRightScaleHandle = null;
		this.bottomRightScaleHandle = null;
		this.bottomLeftScaleHandle = null;

		this.isHovering = false;

		this.isDragging = false;
		this.dragOffset = { x: 0, y: 0 };

		this.scaleDirection = null;
		this.scaleStart = null;
		this.scaleOffset = { x: 0, y: 0 };

		this.edgeDragDirection = null;
		this.edgeDragStart = { x: 0, y: 0 };
		this.originalDimensions = null;

		this.initialClipConfiguration = null;

		this.contentContainer = new pixi.Container();
		this.getContainer().addChild(this.contentContainer);
	}

	public reconfigureAfterRestore(): void {
		this.configureKeyframes();
	}

	protected configureKeyframes() {
		this.offsetXKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.offset?.x ?? 0, this.getLength());
		this.offsetYKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.offset?.y ?? 0, this.getLength());
		this.scaleKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.scale ?? 1, this.getLength(), 1);
		this.opacityKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.opacity ?? 1, this.getLength(), 1);
		this.rotationKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.transform?.rotate?.angle ?? 0, this.getLength());

		if (this.clipHasKeyframes()) {
			return;
		}

		const offsetXKeyframes: Keyframe[] = [];
		const offsetYKeyframes: Keyframe[] = [];
		const opacityKeyframes: Keyframe[] = [];
		const scaleKeyframes: Keyframe[] = [];
		const rotationKeyframes: Keyframe[] = [];

		const resolvedClipConfig: ResolvedClipConfig = {
			...this.clipConfiguration,
			start: this.getStart() / 1000,
			length: this.getLength() / 1000
		};

		const effectKeyframeSet = new EffectPresetBuilder(resolvedClipConfig).build(this.edit.size, this.getSize());
		offsetXKeyframes.push(...effectKeyframeSet.offsetXKeyframes);
		offsetYKeyframes.push(...effectKeyframeSet.offsetYKeyframes);
		opacityKeyframes.push(...effectKeyframeSet.opacityKeyframes);
		scaleKeyframes.push(...effectKeyframeSet.scaleKeyframes);
		rotationKeyframes.push(...effectKeyframeSet.rotationKeyframes);

		const transitionKeyframeSet = new TransitionPresetBuilder(resolvedClipConfig).build();
		offsetXKeyframes.push(...transitionKeyframeSet.offsetXKeyframes);
		offsetYKeyframes.push(...transitionKeyframeSet.offsetYKeyframes);
		opacityKeyframes.push(...transitionKeyframeSet.opacityKeyframes);
		scaleKeyframes.push(...transitionKeyframeSet.scaleKeyframes);
		rotationKeyframes.push(...transitionKeyframeSet.rotationKeyframes);

		if (offsetXKeyframes.length) {
			this.offsetXKeyframeBuilder = new KeyframeBuilder(offsetXKeyframes, this.getLength());
		}

		if (offsetYKeyframes.length) {
			this.offsetYKeyframeBuilder = new KeyframeBuilder(offsetYKeyframes, this.getLength());
		}

		if (opacityKeyframes.length) {
			this.opacityKeyframeBuilder = new KeyframeBuilder(opacityKeyframes, this.getLength(), 1);
		}

		if (scaleKeyframes.length) {
			this.scaleKeyframeBuilder = new KeyframeBuilder(scaleKeyframes, this.getLength(), 1);
		}

		if (rotationKeyframes.length) {
			this.rotationKeyframeBuilder = new KeyframeBuilder(rotationKeyframes, this.getLength());
		}
	}

	public override async load(): Promise<void> {
		if (this.contentContainer?.destroyed) {
			this.contentContainer = new pixi.Container();
			this.getContainer().addChild(this.contentContainer);
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

			// Set resize cursors for corner handles
			this.topLeftScaleHandle.eventMode = "static";
			this.topLeftScaleHandle.cursor = "nwse-resize";
			this.topRightScaleHandle.eventMode = "static";
			this.topRightScaleHandle.cursor = "nesw-resize";
			this.bottomRightScaleHandle.eventMode = "static";
			this.bottomRightScaleHandle.cursor = "nwse-resize";
			this.bottomLeftScaleHandle.eventMode = "static";
			this.bottomLeftScaleHandle.cursor = "nesw-resize";

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

		if (this.shouldDiscardFrame()) {
			this.contentContainer.alpha = 0;
		}
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

		this.contentContainer?.destroy();
	}

	public getStart(): number {
		return this.resolvedTiming.start;
	}

	public getLength(): number {
		return this.resolvedTiming.length;
	}

	public getEnd(): number {
		return this.resolvedTiming.start + this.resolvedTiming.length;
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
			start: this.resolvedTiming.start / 1000,
			length: this.resolvedTiming.length / 1000
		};
	}

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

	protected getFitScale(): number {
		const targetWidth = this.clipConfiguration.width ?? this.edit.size.width;
		const targetHeight = this.clipConfiguration.height ?? this.edit.size.height;
		const contentSize = this.getContentSize();

		switch (this.clipConfiguration.fit ?? "crop") {
			case "crop": {
				const ratioX = targetWidth / contentSize.width;
				const ratioY = targetHeight / contentSize.height;
				const isPortrait = targetHeight >= targetWidth;
				return isPortrait ? ratioY : ratioX;
			}
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
				const isPortrait = targetHeight >= targetWidth;
				const uniform = (isPortrait ? ratioY : ratioX) * baseScale;
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

	private onPointerStart(event: pixi.FederatedPointerEvent): void {
		if (event.button !== Pointer.ButtonLeftClick) {
			return;
		}

		this.edit.events.emit("canvas:clip:clicked", { player: this });

		this.initialClipConfiguration = structuredClone(this.clipConfiguration);

		if (this.clipHasKeyframes()) {
			return;
		}

		this.scaleDirection = null;

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
					this.scaleKeyframeBuilder = new KeyframeBuilder(1, this.getLength(), 1);
				}
			}

			this.originalDimensions = {
				width,
				height,
				offsetX: currentOffsetX,
				offsetY: currentOffsetY
			};

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
						this.scaleKeyframeBuilder = new KeyframeBuilder(1, this.getLength(), 1);
					}
				}

				this.originalDimensions = {
					width,
					height,
					offsetX: currentOffsetX,
					offsetY: currentOffsetY
				};

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
					newOffsetY = this.originalDimensions.offsetY + deltaY / 2 / this.edit.size.height;
					break;
				case "bottomRight":
					// Increase width, increase height, shift offset to keep top-left fixed
					newWidth = this.originalDimensions.width + deltaX;
					newHeight = this.originalDimensions.height + deltaY;
					newOffsetX = this.originalDimensions.offsetX + deltaX / 2 / this.edit.size.width;
					newOffsetY = this.originalDimensions.offsetY + deltaY / 2 / this.edit.size.height;
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
			this.offsetXKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.offset.x, this.getLength());
			this.offsetYKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.offset.y, this.getLength());

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
			this.offsetXKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.offset.x, this.getLength());
			this.offsetYKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.offset.y, this.getLength());

			// Notify subclass about dimension change for re-rendering
			this.onDimensionsChanged();

			return;
		}

		if (this.isDragging) {
			const timelinePoint = event.getLocalPosition(this.edit.getContainer());

			const pivot = this.getPivot();

			const cursorPosition: Vector = { x: timelinePoint.x - this.dragOffset.x, y: timelinePoint.y - this.dragOffset.y };
			const updatedPosition: Vector = { x: cursorPosition.x - pivot.x, y: cursorPosition.y - pivot.y };

			const timelineCorners = [
				{ x: 0, y: 0 },
				{ x: this.edit.size.width, y: 0 },
				{ x: 0, y: this.edit.size.height },
				{ x: this.edit.size.width, y: this.edit.size.height }
			];
			const timelineCenter = { x: this.edit.size.width / 2, y: this.edit.size.height / 2 };
			const timelineSnapPositions: Vector[] = [...timelineCorners, timelineCenter];

			const clipCorners = [
				{ x: updatedPosition.x, y: updatedPosition.y },
				{ x: updatedPosition.x + this.getSize().width, y: updatedPosition.y },
				{ x: updatedPosition.x, y: updatedPosition.y + this.getSize().height },
				{ x: updatedPosition.x + this.getSize().width, y: updatedPosition.y + this.getSize().height }
			];
			const clipCenter = { x: updatedPosition.x + this.getSize().width / 2, y: updatedPosition.y + this.getSize().height / 2 };
			const clipSnapPositions: Vector[] = [...clipCorners, clipCenter];

			let closestDistanceX = Player.SnapThreshold;
			let closestDistanceY = Player.SnapThreshold;

			let snapPositionX: number | null = null;
			let snapPositionY: number | null = null;

			for (const clipSnapPosition of clipSnapPositions) {
				for (const timelineSnapPosition of timelineSnapPositions) {
					const distanceX = Math.abs(clipSnapPosition.x - timelineSnapPosition.x);
					if (distanceX < closestDistanceX) {
						closestDistanceX = distanceX;
						snapPositionX = updatedPosition.x + (timelineSnapPosition.x - clipSnapPosition.x);
					}

					const distanceY = Math.abs(clipSnapPosition.y - timelineSnapPosition.y);
					if (distanceY < closestDistanceY) {
						closestDistanceY = distanceY;
						snapPositionY = updatedPosition.y + (timelineSnapPosition.y - clipSnapPosition.y);
					}
				}
			}

			if (snapPositionX !== null) {
				updatedPosition.x = snapPositionX;
			}

			if (snapPositionY !== null) {
				updatedPosition.y = snapPositionY;
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

			this.offsetXKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.offset.x, this.getLength());
			this.offsetYKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.offset.y, this.getLength());
			return;
		}

		// Update cursor based on edge proximity when not dragging (for edge resize)
		if (this.supportsEdgeResize() && !this.isDragging && !this.scaleDirection && !this.edgeDragDirection) {
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
				this.getContainer().cursor = "ew-resize";
			} else if ((nearTop || nearBottom) && withinHorizontalRange) {
				this.getContainer().cursor = "ns-resize";
			} else {
				this.getContainer().cursor = "pointer";
			}
		}
	}

	private onPointerUp(): void {
		if ((this.isDragging || this.scaleDirection !== null || this.edgeDragDirection !== null) && this.hasStateChanged()) {
			this.edit.setUpdatedClip(this, this.initialClipConfiguration, structuredClone(this.clipConfiguration));
		}

		this.isDragging = false;
		this.dragOffset = { x: 0, y: 0 };

		this.scaleDirection = null;
		this.scaleStart = null;
		this.scaleOffset = { x: 0, y: 0 };

		this.edgeDragDirection = null;
		this.edgeDragStart = { x: 0, y: 0 };
		this.originalDimensions = null;

		this.initialClipConfiguration = null;
	}

	private onPointerOver(): void {
		this.isHovering = true;
	}

	private onPointerOut(): void {
		this.isHovering = false;
	}

	private clipHasPresets(): boolean {
		return (
			Boolean(this.clipConfiguration.effect) || Boolean(this.clipConfiguration.transition?.in) || Boolean(this.clipConfiguration.transition?.out)
		);
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

		const sprite = this.contentContainer.children[0] as pixi.Sprite;
		if (!sprite || !sprite.texture) return;

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
