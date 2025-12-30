import { type ResolvedClip, type Keyframe } from "@schemas";

import { type Size } from "../layouts/geometry";

export type EffectKeyframeSet = {
	offsetXKeyframes: Keyframe[];
	offsetYKeyframes: Keyframe[];
	opacityKeyframes: Keyframe[];
	scaleKeyframes: Keyframe[];
	rotationKeyframes: Keyframe[];
};

/**
 * Relative keyframe set for composition with other animation layers.
 * - Offset keyframes are deltas (added to base position)
 * - Scale keyframes are factors (multiplied with base scale)
 * - Opacity keyframes are factors (multiplied with base opacity)
 */
export type RelativeEffectKeyframeSet = EffectKeyframeSet;

export class EffectPresetBuilder {
	private clipConfiguration: ResolvedClip;

	constructor(clipConfiguration: ResolvedClip) {
		this.clipConfiguration = clipConfiguration;
	}

	/**
	 * Build keyframes with relative values for composition.
	 * - Scale values are factors (e.g., 1.0 → 1.3 means "multiply base by 1.0, then by 1.3")
	 * - Offset values are deltas (e.g., 0.12 → -0.12 means "add 0.12 to base, then add -0.12")
	 * These can be composed with transition keyframes without conflicts.
	 */
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
			case "slideLeft": {
				const fittedSize = this.getFittedSize(editSize, clipSize);
				let targetOffsetX = this.getSlideStart();
				const minScaleWidth = editSize.width + editSize.width * targetOffsetX * 2;

				if (fittedSize.width < minScaleWidth) {
					const scaleFactorWidth = minScaleWidth / fittedSize.width;
					// Scale factor (constant) to ensure content fills during slide
					scaleKeyframes.push({ from: scaleFactorWidth, to: scaleFactorWidth, start, length, interpolation: "linear" });
				} else {
					targetOffsetX = (fittedSize.width - editSize.width) / 2 / editSize.width;
				}
				// Offset delta: slides from right (+) to left (-)
				offsetXKeyframes.push({ from: targetOffsetX, to: -targetOffsetX, start, length });
				break;
			}
			case "slideRight": {
				const fittedSize = this.getFittedSize(editSize, clipSize);
				let targetOffsetX = this.getSlideStart();
				const minScaleWidth = editSize.width + editSize.width * targetOffsetX * 2;

				if (fittedSize.width < minScaleWidth) {
					const scaleFactorWidth = minScaleWidth / fittedSize.width;
					scaleKeyframes.push({ from: scaleFactorWidth, to: scaleFactorWidth, start, length, interpolation: "linear" });
				} else {
					targetOffsetX = (fittedSize.width - editSize.width) / 2 / editSize.width;
				}
				// Offset delta: slides from left (-) to right (+)
				offsetXKeyframes.push({ from: -targetOffsetX, to: targetOffsetX, start, length });
				break;
			}
			case "slideUp": {
				const fittedSize = this.getFittedSize(editSize, clipSize);
				let targetOffsetY = this.getSlideStart();
				const minScaleHeight = editSize.height + editSize.height * targetOffsetY * 2;

				if (fittedSize.height < minScaleHeight) {
					const scaleFactorHeight = minScaleHeight / fittedSize.height;
					scaleKeyframes.push({ from: scaleFactorHeight, to: scaleFactorHeight, start, length, interpolation: "linear" });
				} else {
					targetOffsetY = (fittedSize.height - editSize.height) / 2 / editSize.height;
				}
				// Offset delta: slides from bottom (+) to top (-)
				offsetYKeyframes.push({ from: targetOffsetY, to: -targetOffsetY, start, length });
				break;
			}
			case "slideDown": {
				const fittedSize = this.getFittedSize(editSize, clipSize);
				let targetOffsetY = this.getSlideStart();
				const minScaleHeight = editSize.height + editSize.height * targetOffsetY * 2;

				if (fittedSize.height < minScaleHeight) {
					const scaleFactorHeight = minScaleHeight / fittedSize.height;
					scaleKeyframes.push({ from: scaleFactorHeight, to: scaleFactorHeight, start, length, interpolation: "linear" });
				} else {
					targetOffsetY = (fittedSize.height - editSize.height) / 2 / editSize.height;
				}
				// Offset delta: slides from top (-) to bottom (+)
				offsetYKeyframes.push({ from: -targetOffsetY, to: targetOffsetY, start, length });
				break;
			}
			default:
				break;
		}

		return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes };
	}

	private getPresetName(): string {
		const [effectName] = (this.clipConfiguration.effect ?? "").split(/(Slow|Fast)/);
		return effectName;
	}

	private getZoomSpeed(): number {
		const [effectName, effectSpeed] = (this.clipConfiguration.effect ?? "").split(/(Slow|Fast)/);

		if (effectName.startsWith("zoom")) {
			switch (effectSpeed) {
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
		const [effectName, effectSpeed] = (this.clipConfiguration.effect ?? "").split(/(Slow|Fast)/);

		if (effectName.startsWith("slide")) {
			switch (effectSpeed) {
				case "Slow":
					return 0.03;
				case "Fast":
					return 0.2;
				default:
					return 0.12;
			}
		}

		return 0;
	}

	private getFittedSize(editSize: Size, clipSize: Size): Size {
		const fit = this.clipConfiguration.fit ?? "crop";

		switch (fit) {
			case "cover":
			case "crop": {
				const scale = Math.max(editSize.width / clipSize.width, editSize.height / clipSize.height);
				return { width: clipSize.width * scale, height: clipSize.height * scale };
			}
			case "contain": {
				const scale = Math.min(editSize.width / clipSize.width, editSize.height / clipSize.height);
				return { width: clipSize.width * scale, height: clipSize.height * scale };
			}
			case "none":
			default:
				return clipSize;
		}
	}
}
