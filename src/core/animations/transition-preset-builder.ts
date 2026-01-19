import { type ResolvedClip, type Keyframe } from "@schemas";

export type TransitionKeyframeSet = {
	offsetXKeyframes: Keyframe[];
	offsetYKeyframes: Keyframe[];
	opacityKeyframes: Keyframe[];
	scaleKeyframes: Keyframe[];
	rotationKeyframes: Keyframe[];
	maskXKeyframes: Keyframe[];
};

export type RelativeTransitionKeyframeSet = {
	in: TransitionKeyframeSet;
	out: TransitionKeyframeSet;
};

type ParsedTransition = { name: string; speed: string | undefined };

export class TransitionPresetBuilder {
	private readonly clipConfiguration: ResolvedClip;
	private readonly inPreset: ParsedTransition;
	private readonly outPreset: ParsedTransition;

	constructor(clipConfiguration: ResolvedClip) {
		this.clipConfiguration = clipConfiguration;

		this.inPreset = this.parseTransition(clipConfiguration.transition?.in);
		this.outPreset = this.parseTransition(clipConfiguration.transition?.out);
	}

	private parseTransition(value: string | undefined): ParsedTransition {
		const [name, speed] = (value ?? "").split(/(Slow|Fast|VeryFast)/);
		return { name, speed };
	}

	public buildRelative(): RelativeTransitionKeyframeSet {
		return {
			in: this.buildTransitionKeyframes("in"),
			out: this.buildTransitionKeyframes("out")
		};
	}

	private createEmptyKeyframeSet(): TransitionKeyframeSet {
		return {
			offsetXKeyframes: [],
			offsetYKeyframes: [],
			opacityKeyframes: [],
			scaleKeyframes: [],
			rotationKeyframes: [],
			maskXKeyframes: []
		};
	}

	private buildTransitionKeyframes(direction: "in" | "out"): TransitionKeyframeSet {
		const keyframes = this.createEmptyKeyframeSet();
		const transitionValue = direction === "in" ? this.clipConfiguration.transition?.in : this.clipConfiguration.transition?.out;

		if (!transitionValue) return keyframes;

		const length = this.getPresetLength(direction);
		const start = direction === "in" ? 0 : this.clipConfiguration.length - length;
		const transitionName = this.getPresetName(direction);
		const isIn = direction === "in";

		switch (transitionName) {
			case "fade": {
				const [from, to] = isIn ? [0, 1] : [1, 0];
				keyframes.opacityKeyframes.push({ from, to, start, length, interpolation: "bezier", easing: "ease" });
				break;
			}
			case "zoom": {
				const [scaleFrom, scaleTo] = isIn ? [10, 1] : [1, 10];
				const [opacityFrom, opacityTo] = isIn ? [0, 1] : [1, 0];
				const easing = isIn ? "easeIn" : "easeOut";
				keyframes.scaleKeyframes.push({ from: scaleFrom, to: scaleTo, start, length, interpolation: "bezier", easing });
				keyframes.opacityKeyframes.push({ from: opacityFrom, to: opacityTo, start, length, interpolation: "bezier", easing });
				break;
			}
			case "slideLeft":
			case "slideRight":
			case "slideUp":
			case "slideDown": {
				const isHorizontal = transitionName === "slideLeft" || transitionName === "slideRight";
				const isNegative = transitionName === "slideLeft" || transitionName === "slideUp";
				const offset = 0.025;

				const [offsetFrom, offsetTo] = isIn ? [isNegative ? offset : -offset, 0] : [0, isNegative ? -offset : offset];
				const interpolation = isIn ? "linear" : "bezier";
				const [opacityFrom, opacityTo] = isIn ? [0, 1] : [1, 0];

				const targetKeyframes = isHorizontal ? keyframes.offsetXKeyframes : keyframes.offsetYKeyframes;
				targetKeyframes.push(
					isIn
						? { from: offsetFrom, to: offsetTo, start, length, interpolation }
						: { from: offsetFrom, to: offsetTo, start, length, interpolation, easing: "ease" }
				);
				keyframes.opacityKeyframes.push({ from: opacityFrom, to: opacityTo, start, length, interpolation: "bezier", easing: "ease" });
				break;
			}
			case "carouselLeft":
			case "carouselRight":
			case "carouselUp":
			case "carouselDown": {
				const isHorizontal = transitionName === "carouselLeft" || transitionName === "carouselRight";
				const isNegative = transitionName === "carouselLeft" || transitionName === "carouselUp";

				// Carousel uses different offsets for in vs out, and different interpolation
				const baseOffset = (isHorizontal && 1) || (isIn ? 1.05 : 1.1);
				const [offsetFrom, offsetTo] = isIn ? [isNegative ? baseOffset : -baseOffset, 0] : [0, isNegative ? -baseOffset : baseOffset];

				const targetKeyframes = isHorizontal ? keyframes.offsetXKeyframes : keyframes.offsetYKeyframes;
				targetKeyframes.push(
					isIn
						? { from: offsetFrom, to: offsetTo, start, length, interpolation: "linear" }
						: { from: offsetFrom, to: offsetTo, start, length, interpolation: "bezier", easing: "ease" }
				);
				break;
			}
			case "reveal":
			case "wipeRight": {
				const [from, to] = isIn ? [0, 1] : [1, 0];
				keyframes.maskXKeyframes.push({ from, to, start, length, interpolation: "bezier", easing: "ease" });
				break;
			}
			case "wipeLeft": {
				const [from, to] = isIn ? [1, 0] : [0, 1];
				keyframes.maskXKeyframes.push({ from, to, start, length, interpolation: "bezier", easing: "ease" });
				break;
			}
			default:
				break;
		}

		return keyframes;
	}

	private getPresetName(direction: "in" | "out"): string {
		return direction === "in" ? this.inPreset.name : this.outPreset.name;
	}

	private getPresetLength(direction: "in" | "out"): number {
		const { name, speed } = direction === "in" ? this.inPreset : this.outPreset;
		const isCarousel = name.startsWith("carousel");
		const isSlide = name.startsWith("slide");

		if (name === "zoom") return 0.4;

		switch (speed) {
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
