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

	private static readonly ScaleHandleRadius = 10;
	private static readonly RotationHandleRadius = 10;
	private static readonly RotationHandleOffset = 50;
	private static readonly OutlineWidth = 5;

	private static readonly MinScale = 0.1;
	private static readonly MaxScale = 5;

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
	private rotationHandle: pixi.Graphics | null;

	private isHovering: boolean;
	private isDragging: boolean;
	private dragOffset: Vector;

	private scaleDirection: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | null;
	private scaleStart: number | null;
	private scaleOffset: Vector;

	private isRotating: boolean;
	private rotationStart: number | null;
	private rotationOffset: Vector;

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
		this.rotationHandle = null;

		this.isHovering = false;

		this.isDragging = false;
		this.dragOffset = { x: 0, y: 0 };

		this.scaleDirection = null;
		this.scaleStart = null;
		this.scaleOffset = { x: 0, y: 0 };

		this.isRotating = false;
		this.rotationStart = null;
		this.rotationOffset = { x: 0, y: 0 };

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

		this.topLeftScaleHandle = new pixi.Graphics();
		this.topRightScaleHandle = new pixi.Graphics();
		this.bottomRightScaleHandle = new pixi.Graphics();
		this.bottomLeftScaleHandle = new pixi.Graphics();
		this.rotationHandle = new pixi.Graphics();

		this.topLeftScaleHandle.zIndex = 1000;
		this.topRightScaleHandle.zIndex = 1000;
		this.bottomRightScaleHandle.zIndex = 1000;
		this.bottomLeftScaleHandle.zIndex = 1000;
		this.rotationHandle.zIndex = 1000;

		this.getContainer().addChild(this.topLeftScaleHandle);
		this.getContainer().addChild(this.topRightScaleHandle);
		this.getContainer().addChild(this.bottomRightScaleHandle);
		this.getContainer().addChild(this.bottomLeftScaleHandle);
		this.getContainer().addChild(this.rotationHandle);

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
			this.rotationHandle?.clear();
			return;
		}

		const color = this.isHovering || this.isDragging ? 0x00ffff : 0xffffff;
		const size = this.getSize();

		const scale = this.getScale();

		this.outline.clear();
		this.outline.strokeStyle = { width: Player.OutlineWidth / scale, color };
		this.outline.rect(0, 0, size.width, size.height);
		this.outline.stroke();

		if (
			!this.topLeftScaleHandle ||
			!this.topRightScaleHandle ||
			!this.bottomRightScaleHandle ||
			!this.bottomLeftScaleHandle ||
			!this.isActive() ||
			!isSelected
		) {
			return;
		}

		this.topLeftScaleHandle.fillStyle = { color };
		this.topLeftScaleHandle.clear();
		const handleSize = (Player.ScaleHandleRadius * 2) / scale;
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

		if (!this.rotationHandle) {
			return;
		}

		const rotationHandleX = size.width / 2;
		const rotationHandleY = -Player.RotationHandleOffset / scale;

		this.rotationHandle.clear();
		this.rotationHandle.fillStyle = { color };
		this.rotationHandle.circle(rotationHandleX, rotationHandleY, Player.RotationHandleRadius / scale);
		this.rotationHandle.fill();

		this.outline.strokeStyle = { width: Player.OutlineWidth / scale, color };
		this.outline.moveTo(rotationHandleX, 0);
		this.outline.lineTo(rotationHandleX, rotationHandleY);
		this.outline.stroke();
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

		this.rotationHandle?.destroy();
		this.rotationHandle = null;

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
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			return 1;
		}

		switch (this.clipConfiguration.fit ?? "crop") {
			case "crop": {
				const ratioX = this.edit.size.width / this.getSize().width;
				const ratioY = this.edit.size.height / this.getSize().height;
				const isPortrait = this.edit.size.height >= this.edit.size.width;
				return isPortrait ? ratioY : ratioX;
			}
			case "cover":
				return Math.max(this.edit.size.width / this.getSize().width, this.edit.size.height / this.getSize().height);
			case "contain":
				return Math.min(this.edit.size.width / this.getSize().width, this.edit.size.height / this.getSize().height);
			case "none":
			default:
				return 1;
		}
	}

	public getScale(): number {
		return (this.scaleKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1) * this.getFitScale();
	}

	protected getContainerScale(): Vector {
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			return { x: 1, y: 1 };
		}

		const baseScale = this.scaleKeyframeBuilder?.getValue(this.getPlaybackTime()) ?? 1;
		const size = this.getSize();
		const fit = this.clipConfiguration.fit ?? "crop";

		if (size.width === 0 || size.height === 0) {
			return { x: baseScale, y: baseScale };
		}

		const ratioX = this.edit.size.width / size.width;
		const ratioY = this.edit.size.height / size.height;

		switch (fit) {
			case "contain": {
				const uniform = Math.min(ratioX, ratioY) * baseScale;
				return { x: uniform, y: uniform };
			}
			case "crop": {
				const isPortrait = this.edit.size.height >= this.edit.size.width;
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
			this.scaleStart = this.getScale() / this.getFitScale();

			const timelinePoint = event.getLocalPosition(this.edit.getContainer());
			this.scaleOffset = timelinePoint;

			return;
		}

		const isRotating = this.rotationHandle?.getBounds().containsPoint(event.globalX, event.globalY);
		if (isRotating) {
			this.isRotating = true;
			this.rotationStart = this.getRotation();

			const timelinePoint = event.getLocalPosition(this.edit.getContainer());
			this.rotationOffset = timelinePoint;

			return;
		}

		this.isDragging = true;

		const timelinePoint = event.getLocalPosition(this.edit.getContainer());
		this.dragOffset = {
			x: timelinePoint.x - this.getContainer().position.x,
			y: timelinePoint.y - this.getContainer().position.y
		};
	}

	private onPointerMove(event: pixi.FederatedPointerEvent): void {
		if (this.scaleDirection !== null && this.scaleStart !== null) {
			const timelinePoint = event.getLocalPosition(this.edit.getContainer());

			const position = this.getPosition();
			const pivot = this.getPivot();

			const center: Vector = { x: position.x + pivot.x, y: position.y + pivot.y };

			const initialDistance = Math.sqrt((this.scaleOffset.x - center.x) ** 2 + (this.scaleOffset.y - center.y) ** 2);
			const currentDistance = Math.sqrt((timelinePoint.x - center.x) ** 2 + (timelinePoint.y - center.y) ** 2);

			const scaleRatio = currentDistance / initialDistance;
			const targetScale = this.scaleStart * scaleRatio;

			this.clipConfiguration.scale = Math.max(Player.MinScale, Math.min(targetScale, Player.MaxScale));
			this.scaleKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.scale, this.getLength(), 1);

			return;
		}

		if (this.isRotating && this.rotationStart !== null) {
			const timelinePoint = event.getLocalPosition(this.edit.getContainer());

			const position = this.getPosition();
			const pivot = this.getPivot();

			const center: Vector = { x: position.x + pivot.x, y: position.y + pivot.y };

			const initialAngle = Math.atan2(this.rotationOffset.y - center.y, this.rotationOffset.x - center.x);
			const currentAngle = Math.atan2(timelinePoint.y - center.y, timelinePoint.x - center.x);

			const angleDelta = (currentAngle - initialAngle) * (180 / Math.PI);

			let targetAngle = this.rotationStart + angleDelta;
			const snapAngle = 45;
			const angleModulo = targetAngle % snapAngle;
			const snapThreshold = 2;

			if (Math.abs(angleModulo) < snapThreshold) {
				targetAngle = Math.floor(targetAngle / snapAngle) * snapAngle;
			} else if (Math.abs(angleModulo - snapAngle) < snapThreshold) {
				targetAngle = Math.ceil(targetAngle / snapAngle) * snapAngle;
			}

			if (!this.clipConfiguration.transform) {
				this.clipConfiguration.transform = { rotate: { angle: 0 } };
			}
			if (!this.clipConfiguration.transform.rotate) {
				this.clipConfiguration.transform.rotate = { angle: 0 };
			}
			this.clipConfiguration.transform.rotate.angle = targetAngle;
			this.rotationKeyframeBuilder = new KeyframeBuilder(this.clipConfiguration.transform.rotate.angle, this.getLength());

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
		}
	}

	private onPointerUp(): void {
		if ((this.isDragging || this.scaleDirection !== null || this.isRotating) && this.hasStateChanged()) {
			this.edit.setUpdatedClip(this, this.initialClipConfiguration, structuredClone(this.clipConfiguration));
		}

		this.isDragging = false;
		this.dragOffset = { x: 0, y: 0 };

		this.scaleDirection = null;
		this.scaleStart = null;
		this.scaleOffset = { x: 0, y: 0 };

		this.isRotating = false;
		this.rotationStart = null;
		this.rotationOffset = { x: 0, y: 0 };

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

		const initialOffsetX = this.initialClipConfiguration.offset?.x as number;
		const initialOffsetY = this.initialClipConfiguration.offset?.y as number;
		const initialScale = this.initialClipConfiguration.scale as number;
		const initialRotation = Number(this.initialClipConfiguration.transform?.rotate?.angle ?? 0);

		return (
			(initialOffsetX !== undefined && currentOffsetX !== initialOffsetX) ||
			(initialOffsetY !== undefined && currentOffsetY !== initialOffsetY) ||
			(initialScale !== undefined && currentScale !== initialScale) ||
			currentRotation !== initialRotation
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

		if (!this.contentContainer.mask) {
			const clipMask = new pixi.Graphics();
			clipMask.rect(0, 0, clipWidth, clipHeight);
			clipMask.fill(0xffffff);
			this.contentContainer.addChild(clipMask);
			this.contentContainer.mask = clipMask;
		}

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

			// 🟢 crop → uniform fill but never downscale (only upscale if smaller)
			case "crop": {
				// Viewport (output) dimensions — same concept as backend "canvas"
				const outW = this.edit.size.width;
				const outH = this.edit.size.height;

				// 1) Pre-downscale to fit the viewport if the source is larger (preserve AR)
				let prescale = 1;
				if (nativeWidth > outW || nativeHeight > outH) {
					prescale = Math.min(outW / nativeWidth, outH / nativeHeight);
				}

				// Adjusted (virtual) native after prescale
				const adjW = nativeWidth * prescale;
				const adjH = nativeHeight * prescale;

				// 2) Uniform fill to cover the clip box (may overflow → mask crops)
				const fill = Math.max(clipWidth / adjW, clipHeight / adjH);

				// 3) Effective scale to apply to the *original* texture:
				//    - Large images: prescale * fill (we normalized to viewport first)
				//    - Small images: never downscale below native => clamp to >= 1
				const effective = prescale < 1 ? prescale * fill : Math.max(1, fill);

				// Apply base fit (animation is applied separately via contentContainer in your code)
				sprite.scale.set(effective, effective);
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
}
