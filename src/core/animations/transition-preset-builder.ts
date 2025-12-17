import { type ResolvedClip } from "../schemas/clip";
import { type Keyframe } from "../schemas/keyframe";

export type TransitionKeyframeSet = {
	offsetXKeyframes: Keyframe[];
	offsetYKeyframes: Keyframe[];
	opacityKeyframes: Keyframe[];
	scaleKeyframes: Keyframe[];
	rotationKeyframes: Keyframe[];
	maskXKeyframes: Keyframe[];
};

/**
 * Relative keyframe sets for composition with effects.
 * Separates in/out transitions so they can be added as independent layers.
 * - Offset keyframes are deltas (added to base position)
 * - Scale keyframes are factors (multiplied with base scale)
 * - Opacity keyframes are factors (multiplied with base opacity)
 */
export type RelativeTransitionKeyframeSet = {
	in: TransitionKeyframeSet;
	out: TransitionKeyframeSet;
};

export class TransitionPresetBuilder {
	private clipConfiguration: ResolvedClip;

	constructor(clipConfiguration: ResolvedClip) {
		this.clipConfiguration = clipConfiguration;
	}

	/**
	 * Build keyframes with relative values for composition.
	 * Returns separate in/out keyframe sets that can be added as independent layers.
	 * - Offset values are deltas (e.g., 0.025 → 0 means "start 0.025 right of base, end at base")
	 * - Scale values are factors (e.g., 10 → 1 means "start at 10x base, end at 1x base")
	 * - Opacity values are factors (e.g., 0 → 1 means "fade from invisible to full opacity")
	 */
	public buildRelative(): RelativeTransitionKeyframeSet {
		return {
			in: this.buildInPresetRelative(),
			out: this.buildOutPresetRelative()
		};
	}

	private buildInPresetRelative(): TransitionKeyframeSet {
		const offsetXKeyframes: Keyframe[] = [];
		const offsetYKeyframes: Keyframe[] = [];
		const opacityKeyframes: Keyframe[] = [];
		const scaleKeyframes: Keyframe[] = [];
		const rotationKeyframes: Keyframe[] = [];
		const maskXKeyframes: Keyframe[] = [];

		if (!this.clipConfiguration.transition?.in) {
			return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes, maskXKeyframes };
		}

		const start = 0;
		const length = this.getInPresetLength();
		const transitionName = this.getInPresetName();

		switch (transitionName) {
			case "fade": {
				// Opacity factor: 0 (invisible) → 1 (fully visible)
				opacityKeyframes.push({ from: 0, to: 1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "zoom": {
				// Scale factor: 10x → 1x (zooms from very large to normal)
				scaleKeyframes.push({ from: 10, to: 1, start, length, interpolation: "bezier", easing: "easeIn" });
				// Opacity factor: 0 → 1
				opacityKeyframes.push({ from: 0, to: 1, start, length, interpolation: "bezier", easing: "easeIn" });
				break;
			}
			case "slideLeft": {
				// Offset delta: +0.025 → 0 (slides from right to center)
				offsetXKeyframes.push({ from: 0.025, to: 0, start, length, interpolation: "linear" });
				opacityKeyframes.push({ from: 0, to: 1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "slideRight": {
				// Offset delta: -0.025 → 0 (slides from left to center)
				offsetXKeyframes.push({ from: -0.025, to: 0, start, length, interpolation: "linear" });
				opacityKeyframes.push({ from: 0, to: 1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "slideUp": {
				// Offset delta: +0.025 → 0 (slides from bottom to center)
				offsetYKeyframes.push({ from: 0.025, to: 0, start, length, interpolation: "linear" });
				opacityKeyframes.push({ from: 0, to: 1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "slideDown": {
				// Offset delta: -0.025 → 0 (slides from top to center)
				offsetYKeyframes.push({ from: -0.025, to: 0, start, length, interpolation: "linear" });
				opacityKeyframes.push({ from: 0, to: 1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "carouselLeft": {
				// Offset delta: +1 → 0 (slides from far right to center)
				offsetXKeyframes.push({ from: 1, to: 0, start, length, interpolation: "linear" });
				break;
			}
			case "carouselRight": {
				// Offset delta: -1 → 0 (slides from far left to center)
				offsetXKeyframes.push({ from: -1, to: 0, start, length, interpolation: "linear" });
				break;
			}
			case "carouselUp": {
				// Offset delta: -1.05 → 0 (slides from top to center)
				offsetYKeyframes.push({ from: -1.05, to: 0, start, length, interpolation: "linear" });
				break;
			}
			case "carouselDown": {
				// Offset delta: +1.05 → 0 (slides from bottom to center)
				offsetYKeyframes.push({ from: 1.05, to: 0, start, length, interpolation: "linear" });
				break;
			}
			case "reveal":
			case "wipeRight": {
				maskXKeyframes.push({ from: 0, to: 1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "wipeLeft": {
				maskXKeyframes.push({ from: 1, to: 0, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			default:
				break;
		}

		return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes, maskXKeyframes };
	}

	private buildOutPresetRelative(): TransitionKeyframeSet {
		const offsetXKeyframes: Keyframe[] = [];
		const offsetYKeyframes: Keyframe[] = [];
		const opacityKeyframes: Keyframe[] = [];
		const scaleKeyframes: Keyframe[] = [];
		const rotationKeyframes: Keyframe[] = [];
		const maskXKeyframes: Keyframe[] = [];

		if (!this.clipConfiguration.transition?.out) {
			return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes, maskXKeyframes };
		}

		const length = this.getOutPresetLength();
		const start = this.clipConfiguration.length - length;
		const transitionName = this.getOutPresetName();

		switch (transitionName) {
			case "fade": {
				// Opacity factor: 1 (visible) → 0 (invisible)
				opacityKeyframes.push({ from: 1, to: 0, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "zoom": {
				// Scale factor: 1x → 10x (zooms from normal to very large)
				scaleKeyframes.push({ from: 1, to: 10, start, length, interpolation: "bezier", easing: "easeOut" });
				// Opacity factor: 1 → 0
				opacityKeyframes.push({ from: 1, to: 0, start, length, interpolation: "bezier", easing: "easeOut" });
				break;
			}
			case "slideLeft": {
				// Offset delta: 0 → -0.025 (slides from center to left)
				offsetXKeyframes.push({ from: 0, to: -0.025, start, length, interpolation: "bezier", easing: "smooth" });
				opacityKeyframes.push({ from: 1, to: 0, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "slideRight": {
				// Offset delta: 0 → +0.025 (slides from center to right)
				offsetXKeyframes.push({ from: 0, to: 0.025, start, length, interpolation: "bezier", easing: "smooth" });
				opacityKeyframes.push({ from: 1, to: 0, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "slideUp": {
				// Offset delta: 0 → -0.025 (slides from center to top)
				offsetYKeyframes.push({ from: 0, to: -0.025, start, length, interpolation: "bezier", easing: "smooth" });
				opacityKeyframes.push({ from: 1, to: 0, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "slideDown": {
				// Offset delta: 0 → +0.025 (slides from center to bottom)
				offsetYKeyframes.push({ from: 0, to: 0.025, start, length, interpolation: "bezier", easing: "smooth" });
				opacityKeyframes.push({ from: 1, to: 0, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "carouselLeft": {
				// Offset delta: 0 → -1 (slides from center to far left)
				offsetXKeyframes.push({ from: 0, to: -1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "carouselRight": {
				// Offset delta: 0 → +1 (slides from center to far right)
				offsetXKeyframes.push({ from: 0, to: 1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "carouselUp": {
				// Offset delta: 0 → +1.1 (slides from center to bottom)
				offsetYKeyframes.push({ from: 0, to: 1.1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "carouselDown": {
				// Offset delta: 0 → -1.1 (slides from center to top)
				offsetYKeyframes.push({ from: 0, to: -1.1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "reveal":
			case "wipeRight": {
				maskXKeyframes.push({ from: 1, to: 0, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			case "wipeLeft": {
				maskXKeyframes.push({ from: 0, to: 1, start, length, interpolation: "bezier", easing: "smooth" });
				break;
			}
			default:
				break;
		}

		return { offsetXKeyframes, offsetYKeyframes, opacityKeyframes, scaleKeyframes, rotationKeyframes, maskXKeyframes };
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

		if (transitionName === "zoom") return 0.4;

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

		if (transitionName === "zoom") return 0.4;

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
