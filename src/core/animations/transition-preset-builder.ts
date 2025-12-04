import { type ResolvedClipConfig } from "../schemas/clip";
import { type Keyframe } from "../schemas/keyframe";

export type TransitionKeyframeSet = {
	offsetXKeyframes: Keyframe[];
	offsetYKeyframes: Keyframe[];
	opacityKeyframes: Keyframe[];
	scaleKeyframes: Keyframe[];
	rotationKeyframes: Keyframe[];
};

export class TransitionPresetBuilder {
	private clipConfiguration: ResolvedClipConfig;

	constructor(clipConfiguration: ResolvedClipConfig) {
		this.clipConfiguration = clipConfiguration;
	}

	public build(): TransitionKeyframeSet {
		const offsetXKeyframes: Keyframe[] = [];
		const offsetYKeyframes: Keyframe[] = [];
		const opacityKeyframes: Keyframe[] = [];
		const scaleKeyframes: Keyframe[] = [];
		const rotationKeyframes: Keyframe[] = [];

		const inPresetKeyframeSet = this.buildInPreset();
		offsetXKeyframes.push(...inPresetKeyframeSet.offsetXKeyframes);
		offsetYKeyframes.push(...inPresetKeyframeSet.offsetYKeyframes);
		opacityKeyframes.push(...inPresetKeyframeSet.opacityKeyframes);
		scaleKeyframes.push(...inPresetKeyframeSet.scaleKeyframes);
		rotationKeyframes.push(...inPresetKeyframeSet.rotationKeyframes);

		const outPresetKeyframeSet = this.buildOutPreset();

		offsetXKeyframes.push(...outPresetKeyframeSet.offsetXKeyframes);
		offsetYKeyframes.push(...outPresetKeyframeSet.offsetYKeyframes);
		opacityKeyframes.push(...outPresetKeyframeSet.opacityKeyframes);
		scaleKeyframes.push(...outPresetKeyframeSet.scaleKeyframes);
		rotationKeyframes.push(...outPresetKeyframeSet.rotationKeyframes);

		return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes };
	}

	private buildInPreset(): TransitionKeyframeSet {
		const offsetXKeyframes: Keyframe[] = [];
		const offsetYKeyframes: Keyframe[] = [];
		const opacityKeyframes: Keyframe[] = [];
		const scaleKeyframes: Keyframe[] = [];
		const rotationKeyframes: Keyframe[] = [];

		if (!this.clipConfiguration.transition?.in) {
			return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes };
		}

		const start = 0;
		const length = this.getInPresetLength();
		const transitionName = this.getInPresetName();

		switch (transitionName) {
			case "fade": {
				const initialOpacity = 0;
				const targetOpacity = Math.max(0, Math.min((this.clipConfiguration.opacity as number) ?? 1, 1));
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "zoom": {
				const zoomScaleDistance = 9;
				const rawScale = this.clipConfiguration.scale;
				const scale = typeof rawScale === "number" ? rawScale : 1;

				const initialScale = scale + zoomScaleDistance;
				const targetScale = scale;
				scaleKeyframes.push({ from: initialScale, to: targetScale, start, length, interpolation: "bezier", easing: "easeIn" });

				const initialOpacity = 0;
				const targetOpacity = 1;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "easeIn" });

				break;
			}
			case "slideLeft": {
				const rawOffsetX = this.clipConfiguration.offset?.x;
				const offsetX = typeof rawOffsetX === "number" ? rawOffsetX : 0;
				const initialOffsetX = offsetX + 0.025;
				const targetOffsetX = offsetX;
				offsetXKeyframes.push({ from: initialOffsetX, to: targetOffsetX, start, length, interpolation: "linear" });

				const initialOpacity = 0;
				const targetOpacity = 1;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "slideRight": {
				const rawOffsetX = this.clipConfiguration.offset?.x;
				const offsetX = typeof rawOffsetX === "number" ? rawOffsetX : 0;
				const initialOffsetX = offsetX - 0.025;
				const targetOffsetX = offsetX;
				offsetXKeyframes.push({ from: initialOffsetX, to: targetOffsetX, start, length, interpolation: "linear" });

				const initialOpacity = 0;
				const targetOpacity = 1;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "slideUp": {
				const rawOffsetY = this.clipConfiguration.offset?.y;
				const offsetY = typeof rawOffsetY === "number" ? rawOffsetY : 0;
				const initialOffsetY = offsetY + 0.025;
				const targetOffsetY = offsetY;
				offsetYKeyframes.push({ from: initialOffsetY, to: targetOffsetY, start, length, interpolation: "linear" });

				const initialOpacity = 0;
				const targetOpacity = 1;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "slideDown": {
				const rawOffsetY = this.clipConfiguration.offset?.y;
				const offsetY = typeof rawOffsetY === "number" ? rawOffsetY : 0;
				const initialOffsetY = offsetY - 0.025;
				const targetOffsetY = offsetY;
				offsetYKeyframes.push({ from: initialOffsetY, to: targetOffsetY, start, length, interpolation: "linear" });

				const initialOpacity = 0;
				const targetOpacity = 1;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "carouselLeft": {
				const rawOffsetX = this.clipConfiguration.offset?.x;
				const offsetX = typeof rawOffsetX === "number" ? rawOffsetX : 0;
				const initialOffsetX = offsetX + 1;
				const targetOffsetX = offsetX;
				offsetXKeyframes.push({ from: initialOffsetX, to: targetOffsetX, start, length, interpolation: "linear" });

				break;
			}
			case "carouselRight": {
				const rawOffsetX = this.clipConfiguration.offset?.x;
				const offsetX = typeof rawOffsetX === "number" ? rawOffsetX : 0;
				const initialOffsetX = offsetX - 1;
				const targetOffsetX = offsetX;
				offsetXKeyframes.push({ from: initialOffsetX, to: targetOffsetX, start, length, interpolation: "linear" });

				break;
			}
			case "carouselUp": {
				const rawOffsetY = this.clipConfiguration.offset?.y;
				const offsetY = typeof rawOffsetY === "number" ? rawOffsetY : 0;
				const initialOffsetY = offsetY - 1.05;
				const targetOffsetY = offsetY;
				offsetYKeyframes.push({ from: initialOffsetY, to: targetOffsetY, start, length, interpolation: "linear" });

				break;
			}
			case "carouselDown": {
				const rawOffsetY = this.clipConfiguration.offset?.y;
				const offsetY = typeof rawOffsetY === "number" ? rawOffsetY : 0;
				const initialOffsetY = offsetY + 1.05;
				const targetOffsetY = offsetY;
				offsetYKeyframes.push({ from: initialOffsetY, to: targetOffsetY, start, length, interpolation: "linear" });

				break;
			}
			case "shuffleTopRight":
			case "shuffleRightTop":
			case "shuffleRightBottom":
			case "shuffleBottomRight":
			case "shuffleBottomLeft":
			case "shuffleLeftBottom":
			case "shuffleLeftTop":
			case "shuffleTopLeft":
			default:
				console.warn(`Unimplemented transition:in preset "${this.clipConfiguration.transition.in}"`);
				break;
		}

		return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes };
	}

	private buildOutPreset(): TransitionKeyframeSet {
		const offsetXKeyframes: Keyframe[] = [];
		const offsetYKeyframes: Keyframe[] = [];
		const opacityKeyframes: Keyframe[] = [];
		const scaleKeyframes: Keyframe[] = [];
		const rotationKeyframes: Keyframe[] = [];

		if (!this.clipConfiguration.transition?.out) {
			return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes };
		}

		const length = this.getOutPresetLength();
		const start = this.clipConfiguration.length - length;
		const transitionName = this.getOutPresetName();

		switch (transitionName) {
			case "fade": {
				const initialOpacity = Math.max(0, Math.min((this.clipConfiguration.opacity as number) ?? 1, 1));
				const targetOpacity = 0;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "zoom": {
				const zoomScaleDistance = 9;
				const rawScale = this.clipConfiguration.scale;
				const scale = typeof rawScale === "number" ? rawScale : 1;

				const initialScale = scale;
				const targetScale = scale + zoomScaleDistance;
				scaleKeyframes.push({ from: initialScale, to: targetScale, start, length, interpolation: "bezier", easing: "easeOut" });

				const initialOpacity = 1;
				const targetOpacity = 0;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "easeOut" });

				break;
			}
			case "slideLeft": {
				const rawOffsetX = this.clipConfiguration.offset?.x;
				const offsetX = typeof rawOffsetX === "number" ? rawOffsetX : 0;
				const initialOffsetX = offsetX;
				const targetOffsetX = offsetX - 0.025;
				offsetXKeyframes.push({ from: initialOffsetX, to: targetOffsetX, start, length, interpolation: "bezier", easing: "smooth" });

				const initialOpacity = 1;
				const targetOpacity = 0;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "slideRight": {
				const rawOffsetX = this.clipConfiguration.offset?.x;
				const offsetX = typeof rawOffsetX === "number" ? rawOffsetX : 0;
				const initialOffsetX = offsetX;
				const targetOffsetX = offsetX + 0.025;
				offsetXKeyframes.push({ from: initialOffsetX, to: targetOffsetX, start, length, interpolation: "bezier", easing: "smooth" });

				const initialOpacity = 1;
				const targetOpacity = 0;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "slideUp": {
				const rawOffsetY = this.clipConfiguration.offset?.y;
				const offsetY = typeof rawOffsetY === "number" ? rawOffsetY : 0;
				const initialOffsetY = offsetY;
				const targetOffsetY = offsetY - 0.025;
				offsetYKeyframes.push({ from: initialOffsetY, to: targetOffsetY, start, length, interpolation: "bezier", easing: "smooth" });

				const initialOpacity = 1;
				const targetOpacity = 0;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "slideDown": {
				const rawOffsetY = this.clipConfiguration.offset?.y;
				const offsetY = typeof rawOffsetY === "number" ? rawOffsetY : 0;
				const initialOffsetY = offsetY;
				const targetOffsetY = offsetY + 0.025;
				offsetYKeyframes.push({ from: initialOffsetY, to: targetOffsetY, start, length, interpolation: "bezier", easing: "smooth" });

				const initialOpacity = 1;
				const targetOpacity = 0;
				opacityKeyframes.push({ from: initialOpacity, to: targetOpacity, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "carouselLeft": {
				const rawOffsetX = this.clipConfiguration.offset?.x;
				const offsetX = typeof rawOffsetX === "number" ? rawOffsetX : 0;
				const initialOffsetX = offsetX;
				const targetOffsetX = offsetX - 1;
				offsetXKeyframes.push({ from: initialOffsetX, to: targetOffsetX, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "carouselRight": {
				const rawOffsetX = this.clipConfiguration.offset?.x;
				const offsetX = typeof rawOffsetX === "number" ? rawOffsetX : 0;
				const initialOffsetX = offsetX;
				const targetOffsetX = offsetX + 1;
				offsetXKeyframes.push({ from: initialOffsetX, to: targetOffsetX, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "carouselUp": {
				const rawOffsetY = this.clipConfiguration.offset?.y;
				const offsetY = typeof rawOffsetY === "number" ? rawOffsetY : 0;
				const initialOffsetY = offsetY;
				const targetOffsetY = offsetY + 1.1;
				offsetYKeyframes.push({ from: initialOffsetY, to: targetOffsetY, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "carouselDown": {
				const rawOffsetY = this.clipConfiguration.offset?.y;
				const offsetY = typeof rawOffsetY === "number" ? rawOffsetY : 0;
				const initialOffsetY = offsetY;
				const targetOffsetY = offsetY - 1.1;
				offsetYKeyframes.push({ from: initialOffsetY, to: targetOffsetY, start, length, interpolation: "bezier", easing: "smooth" });

				break;
			}
			case "shuffleTopRight":
			case "shuffleRightTop":
			case "shuffleRightBottom":
			case "shuffleBottomRight":
			case "shuffleBottomLeft":
			case "shuffleLeftBottom":
			case "shuffleLeftTop":
			case "shuffleTopLeft":
			default:
				console.warn(`Unimplemented transition:out preset "${this.clipConfiguration.transition.out}"`);
				break;
		}

		return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes };
	}

	private getInPresetName(): string {
		const [transitionName] = (this.clipConfiguration.transition?.in ?? "").split(/(Slow|Fast|VeryFast)/);
		return transitionName;
	}

	private getOutPresetName(): string {
		const [transitionName] = (this.clipConfiguration.transition?.out ?? "").split(/(Slow|Fast|VeryFast)/);
		return transitionName;
	}

	private getInPresetLength(): number {
		const transitionIn = this.clipConfiguration.transition?.in ?? "";
		const [transitionName, transitionSpeed] = transitionIn.split(/(Slow|Fast|VeryFast)/);
		const isCarousel = transitionName.startsWith("carousel");
		const isSlide = transitionName.startsWith("slide");
		const isZoom = transitionName === "zoom";

		if (isZoom) return 0.4;

		switch (transitionSpeed) {
			case "Slow":
				return 2;
			case "Fast":
				return isCarousel || isSlide ? 0.25 : 0.5;
			case "VeryFast":
				return 0.25;
			default:
				return isCarousel || isSlide ? 0.5 : 1;
		}
	}

	private getOutPresetLength(): number {
		const transitionOut = this.clipConfiguration.transition?.out ?? "";
		const [transitionName, transitionSpeed] = transitionOut.split(/(Slow|Fast|VeryFast)/);
		const isCarousel = transitionName.startsWith("carousel");
		const isSlide = transitionName.startsWith("slide");
		const isZoom = transitionName === "zoom";

		if (isZoom) return 0.4;

		switch (transitionSpeed) {
			case "Slow":
				return 2;
			case "Fast":
				return isCarousel || isSlide ? 0.25 : 0.5;
			case "VeryFast":
				return 0.25;
			default:
				return isCarousel || isSlide ? 0.5 : 1;
		}
	}
}
