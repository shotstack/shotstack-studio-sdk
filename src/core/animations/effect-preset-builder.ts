import { type ResolvedClip, type Keyframe } from "@schemas";

import { type Size } from "../layouts/geometry";

export type EffectKeyframeSet = {
	offsetXKeyframes: Keyframe[];
	offsetYKeyframes: Keyframe[];
	opacityKeyframes: Keyframe[];
	scaleKeyframes: Keyframe[];
	rotationKeyframes: Keyframe[];
};

export type RelativeEffectKeyframeSet = EffectKeyframeSet;

type ParsedEffect = { name: string; speed: string | undefined };

export class EffectPresetBuilder {
	private readonly clipConfiguration: ResolvedClip;
	private readonly effectPreset: ParsedEffect;

	constructor(clipConfiguration: ResolvedClip) {
		this.clipConfiguration = clipConfiguration;

		const [name, speed] = (clipConfiguration.effect ?? "").split(/(Slow|Fast)/);
		this.effectPreset = { name, speed };
	}

	public buildRelative(editSize: Size, clipSize: Size): RelativeEffectKeyframeSet {
		const offsetXKeyframes: Keyframe[] = [];
		const offsetYKeyframes: Keyframe[] = [];
		const opacityKeyframes: Keyframe[] = [];
		const scaleKeyframes: Keyframe[] = [];
		const rotationKeyframes: Keyframe[] = [];

		const { effect, length } = this.clipConfiguration;

		if (!effect) {
			return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes };
		}

		const start = 0;
		const effectName = this.getPresetName();

		switch (effectName) {
			case "zoomIn": {
				const zoomSpeed = this.getZoomSpeed();
				// Factor: starts at 1x, ends at zoomSpeed (e.g., 1.3x)
				scaleKeyframes.push({ from: 1, to: zoomSpeed, start, length, interpolation: "linear" });
				break;
			}
			case "zoomOut": {
				const zoomSpeed = this.getZoomSpeed();
				// Factor: starts at zoomSpeed (e.g., 1.3x), ends at 1x
				scaleKeyframes.push({ from: zoomSpeed, to: 1, start, length, interpolation: "linear" });
				break;
			}
			case "slideLeft":
			case "slideRight":
			case "slideUp":
			case "slideDown": {
				const isHorizontal = effectName === "slideLeft" || effectName === "slideRight";
				// Left and down start on the positive side of their axis (offset y points up).
				const startsPositive = effectName === "slideLeft" || effectName === "slideDown";

				// The render checks for overflow with the media fitted to the frame's other side, whatever the clip's fit.
				const editDimension = isHorizontal ? editSize.width : editSize.height;
				const fittedDimension = isHorizontal
					? (clipSize.width / clipSize.height) * editSize.height
					: (clipSize.height / clipSize.width) * editSize.width;

				let targetOffset = this.getSlideStart();
				const scaleFactor = 1 + targetOffset * 2;

				if (fittedDimension < editDimension * scaleFactor) {
					scaleKeyframes.push({ from: scaleFactor, to: scaleFactor, start, length, interpolation: "linear" });
				} else {
					targetOffset = (fittedDimension - editDimension) / 2 / editDimension;
				}

				const [from, to] = startsPositive ? [targetOffset, -targetOffset] : [-targetOffset, targetOffset];
				const targetKeyframes = isHorizontal ? offsetXKeyframes : offsetYKeyframes;
				targetKeyframes.push({ from, to, start, length });
				break;
			}
			default:
				break;
		}

		return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes };
	}

	private getPresetName(): string {
		return this.effectPreset.name;
	}

	private getZoomSpeed(): number {
		const { name, speed } = this.effectPreset;

		if (name.startsWith("zoom")) {
			switch (speed) {
				case "Slow":
					return 1.1;
				case "Fast":
					return 1.7;
				default:
					return 1.3;
			}
		}

		return 0;
	}

	private getSlideStart(): number {
		const { name, speed } = this.effectPreset;

		// Fractions of the frame, matching the render.
		if (name.startsWith("slide")) {
			switch (speed) {
				case "Slow":
					return 0.03;
				case "Fast":
					return 0.12;
				default:
					return 0.08;
			}
		}

		return 0;
	}
}
