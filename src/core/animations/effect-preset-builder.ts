import { type ResolvedClip } from "@schemas";

import { type Size } from "../layouts/geometry";

import { type PresetPoint } from "./keyframe-builder";

export type EffectKeyframeSet = {
	offsetXKeyframes: PresetPoint[];
	offsetYKeyframes: PresetPoint[];
	opacityKeyframes: PresetPoint[];
	scaleKeyframes: PresetPoint[];
	rotationKeyframes: PresetPoint[];
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
		const offsetXKeyframes: PresetPoint[] = [];
		const offsetYKeyframes: PresetPoint[] = [];
		const opacityKeyframes: PresetPoint[] = [];
		const scaleKeyframes: PresetPoint[] = [];
		const rotationKeyframes: PresetPoint[] = [];

		const { effect, length } = this.clipConfiguration;

		if (!effect) {
			return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes };
		}

		const start = 0;
		const effectName = this.getPresetName();

		switch (effectName) {
			case "zoomIn": {
				// The render adds the zoom to the scale it reads at the clip's start.
				const amount = this.getZoomSpeed() - 1;
				scaleKeyframes.push(
					{ time: start, value: 0, at: start, interpolation: "linear" },
					{ time: length, value: amount, at: start, interpolation: "linear" }
				);
				break;
			}
			case "zoomOut": {
				const amount = this.getZoomSpeed() - 1;
				scaleKeyframes.push(
					{ time: start, value: amount, at: start, interpolation: "linear" },
					{ time: length, value: 0, at: start, interpolation: "linear" }
				);
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

				// Like the render's, a slide sets the offset on its axis outright, and the scale too when it enlarges the clip.
				if (fittedDimension < editDimension * scaleFactor) {
					scaleKeyframes.push({ time: start, value: scaleFactor, interpolation: "constant" });
				} else {
					targetOffset = (fittedDimension - editDimension) / 2 / editDimension;
				}

				const [from, to] = startsPositive ? [targetOffset, -targetOffset] : [-targetOffset, targetOffset];
				const targetKeyframes = isHorizontal ? offsetXKeyframes : offsetYKeyframes;
				targetKeyframes.push({ time: start, value: from, interpolation: "linear" }, { time: length, value: to, interpolation: "linear" });
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
