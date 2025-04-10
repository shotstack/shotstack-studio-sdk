import { type Size } from "../layouts/geometry";
import { type Clip } from "../schemas/clip";
import { type Keyframe } from "../schemas/keyframe";

export type EffectKeyframeSet = {
	offsetXKeyframes: Keyframe[];
	offsetYKeyframes: Keyframe[];
	opacityKeyframes: Keyframe[];
	scaleKeyframes: Keyframe[];
	rotationKeyframes: Keyframe[];
};

export class EffectPresetBuilder {
	private clipConfiguration: Clip;

	constructor(clipConfiguration: Clip) {
		this.clipConfiguration = clipConfiguration;
	}

	public build(editSize: Size, clipSize: Size): EffectKeyframeSet {
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

				const initialScale = 1 * (this.clipConfiguration.scale as number);
				const targetScale = zoomSpeed * (this.clipConfiguration.scale as number);

				scaleKeyframes.push({ from: initialScale, to: targetScale, start, length, interpolation: "linear" });

				break;
			}
			case "zoomOut": {
				const zoomSpeed = this.getZoomSpeed();

				const initialScale = zoomSpeed * (this.clipConfiguration.scale as number);
				const targetScale = 1 * (this.clipConfiguration.scale as number);

				scaleKeyframes.push({ from: initialScale, to: targetScale, start, length, interpolation: "linear" });

				break;
			}
			case "slideLeft": {
				let targetOffsetX = this.getSlideStart();

				const minScaleWidth = editSize.width + editSize.width * targetOffsetX * 2;
				const fitWidth = (clipSize.height / clipSize.width) * editSize.height;

				if (fitWidth < minScaleWidth) {
					const scaleFactorWidth = Math.abs(minScaleWidth / editSize.width);
					scaleKeyframes.push({ from: scaleFactorWidth, to: scaleFactorWidth, start, length, interpolation: "linear" });
				} else {
					targetOffsetX = (fitWidth - editSize.width) / 2 / editSize.width;
				}

				offsetXKeyframes.push({ from: targetOffsetX, to: -targetOffsetX, start, length });

				break;
			}
			case "slideRight": {
				let targetOffsetX = this.getSlideStart();

				const minScaleWidth = editSize.width + editSize.width * targetOffsetX * 2;
				const fitWidth = (clipSize.height / clipSize.width) * editSize.height;

				if (fitWidth < minScaleWidth) {
					const scaleFactorWidth = Math.abs(minScaleWidth / editSize.width);
					scaleKeyframes.push({ from: scaleFactorWidth, to: scaleFactorWidth, start, length, interpolation: "linear" });
				} else {
					targetOffsetX = (fitWidth - editSize.width) / 2 / editSize.width;
				}

				offsetXKeyframes.push({ from: -targetOffsetX, to: targetOffsetX, start, length });

				break;
			}
			case "slideUp": {
				let targetOffsetY = this.getSlideStart();

				const minScaleHeight = editSize.height + editSize.height * targetOffsetY * 2;
				const fitHeight = (clipSize.height / clipSize.width) * editSize.width;

				if (fitHeight < minScaleHeight) {
					const scaleFactorHeight = Math.abs(minScaleHeight / editSize.height);
					scaleKeyframes.push({ from: scaleFactorHeight, to: scaleFactorHeight, start, length, interpolation: "linear" });
				} else {
					targetOffsetY = (fitHeight - editSize.height) / 2 / editSize.height;
				}

				offsetYKeyframes.push({ from: targetOffsetY, to: -targetOffsetY, start, length });

				break;
			}
			case "slideDown": {
				let targetOffsetY = this.getSlideStart();

				const minScaleHeight = editSize.height + editSize.height * targetOffsetY * 2;
				const fitHeight = (clipSize.height / clipSize.width) * editSize.width;

				if (fitHeight < minScaleHeight) {
					const scaleFactorHeight = Math.abs(minScaleHeight / editSize.height);
					scaleKeyframes.push({ from: scaleFactorHeight, to: scaleFactorHeight, start, length, interpolation: "linear" });
				} else {
					targetOffsetY = (fitHeight - editSize.height) / 2 / editSize.height;
				}

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
					return 1.7;
				default:
					return 0.12;
			}
		}

		return 0;
	}
}
