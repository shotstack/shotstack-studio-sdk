import { type Size } from "../layouts/geometry";
import { type ResolvedClipConfig } from "../schemas/clip";
import { type Keyframe } from "../schemas/keyframe";

export type EffectKeyframeSet = {
	offsetXKeyframes: Keyframe[];
	offsetYKeyframes: Keyframe[];
	opacityKeyframes: Keyframe[];
	scaleKeyframes: Keyframe[];
	rotationKeyframes: Keyframe[];
};

export class EffectPresetBuilder {
	private clipConfiguration: ResolvedClipConfig;

	constructor(clipConfiguration: ResolvedClipConfig) {
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
				const rawScale = this.clipConfiguration.scale;
				const scale = typeof rawScale === "number" ? rawScale : 1;

				const initialScale = 1 * scale;
				const targetScale = zoomSpeed * scale;

				scaleKeyframes.push({ from: initialScale, to: targetScale, start, length, interpolation: "linear" });

				break;
			}
			case "zoomOut": {
				const zoomSpeed = this.getZoomSpeed();
				const rawScale = this.clipConfiguration.scale;
				const scale = typeof rawScale === "number" ? rawScale : 1;

				const initialScale = zoomSpeed * scale;
				const targetScale = 1 * scale;

				scaleKeyframes.push({ from: initialScale, to: targetScale, start, length, interpolation: "linear" });

				break;
			}
			case "slideLeft": {
				const fittedSize = this.getFittedSize(editSize, clipSize);
				let targetOffsetX = this.getSlideStart();

				const minScaleWidth = editSize.width + editSize.width * targetOffsetX * 2;

				if (fittedSize.width < minScaleWidth) {
					const scaleFactorWidth = minScaleWidth / fittedSize.width;
					scaleKeyframes.push({ from: scaleFactorWidth, to: scaleFactorWidth, start, length, interpolation: "linear" });
				} else {
					targetOffsetX = (fittedSize.width - editSize.width) / 2 / editSize.width;
				}

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
