import { type Vector } from "@layouts/geometry";
import { type ResolvedClip, type AnimationKeyframe } from "@schemas";

export type TransitionKeyframeSet = {
	offsetXKeyframes: AnimationKeyframe[];
	offsetYKeyframes: AnimationKeyframe[];
	opacityKeyframes: AnimationKeyframe[];
	scaleKeyframes: AnimationKeyframe[];
	rotationKeyframes: AnimationKeyframe[];
	maskXKeyframes: AnimationKeyframe[];
	/** Wipe brightness sweep (+1 hidden → −1 revealed), applied through WipeFilter. */
	brightnessKeyframes: AnimationKeyframe[];
	/** Zoom blur radius, in pixels of the clip before its scale applies. */
	blurKeyframes: AnimationKeyframe[];
	/** Wipe reveal direction for this phase: true = from the right edge inward, false = from the left. */
	wipeFromRight: boolean;
	/** The point the clip rotates about, as a fraction of its size from the top left; the centre when unset. */
	origin?: Vector;
};

export type RelativeTransitionKeyframeSet = {
	in: TransitionKeyframeSet;
	out: TransitionKeyframeSet;
};

type ParsedTransition = { name: string; speed: string | undefined };

// The render's presets use its default Bezier handles, cubic-bezier(0.5, 0, 0.5, 1).
const SMOOTH = { interpolation: "bezier", easing: "smooth" } as const;
const LINEAR = { interpolation: "linear" } as const;
type Curve = typeof SMOOTH | typeof LINEAR;

// The render's shuffles swing the clip about a point well outside it: [degrees, origin x, origin y].
const SHUFFLES: Record<string, [number, number, number]> = {
	shuffleBottomLeft: [17, -1.6, 0.5],
	shuffleBottomRight: [-17, 2.6, 0.5],
	shuffleTopLeft: [-17, -1.6, 0.5],
	shuffleTopRight: [17, 2.6, 0.5],
	shuffleLeftBottom: [-25, 0.5, 3.6],
	shuffleLeftTop: [25, 0.5, -2.6],
	shuffleRightBottom: [25, 0.5, 3.6],
	shuffleRightTop: [-25, 0.5, -2.6]
};

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
		const [name, speed] = (value ?? "").split(/(Slow|Fast)/);
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
			maskXKeyframes: [],
			brightnessKeyframes: [],
			blurKeyframes: [],
			wipeFromRight: false
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

		// The render eases between a point at the clip's edge and one where the transition meets the clip, and each
		// segment takes its later point's curve: an in transition follows the inner point, an out transition the edge.
		const ramp = (edge: number, rest: number, edgeCurve: Curve, innerCurve: Curve): AnimationKeyframe =>
			isIn ? { from: edge, to: rest, start, length, ...innerCurve } : { from: rest, to: edge, start, length, ...edgeCurve };
		const fade = ramp(0, 1, SMOOTH, SMOOTH);

		switch (transitionName) {
			case "fade": {
				keyframes.opacityKeyframes.push(fade);
				break;
			}
			case "zoom": {
				keyframes.scaleKeyframes.push(ramp(10, 1, SMOOTH, LINEAR));
				keyframes.opacityKeyframes.push(fade);
				keyframes.blurKeyframes.push(ramp(5, 0, SMOOTH, SMOOTH));
				break;
			}
			case "slideLeft":
			case "slideRight":
			case "slideUp":
			case "slideDown":
			case "carouselLeft":
			case "carouselRight":
			case "carouselUp":
			case "carouselDown": {
				const isSlide = transitionName.startsWith("slide");
				const isHorizontal = transitionName.endsWith("Left") || transitionName.endsWith("Right");
				// Fractions of the frame, matching the render; vertical carousels travel further to clear the edge.
				let distance = isSlide ? 0.025 : 1;
				if (!isSlide && !isHorizontal) distance = isIn ? 1.05 : 1.1;
				// Left and down enter from the positive side of their axis (offset y points up) and leave by the other.
				const entersFromPositive = transitionName.endsWith("Left") || transitionName.endsWith("Down");
				const edge = (isIn === entersFromPositive ? 1 : -1) * distance;

				const targetKeyframes = isHorizontal ? keyframes.offsetXKeyframes : keyframes.offsetYKeyframes;
				targetKeyframes.push(ramp(edge, 0, SMOOTH, LINEAR));
				if (isSlide) keyframes.opacityKeyframes.push(fade);
				break;
			}
			case "reveal": {
				keyframes.maskXKeyframes.push(ramp(0, 1, SMOOTH, SMOOTH));
				break;
			}
			case "wipeLeft":
			case "wipeRight": {
				// Brightness sweeps +1 (hidden) → −1 (revealed) in, and back out, applied via WipeFilter.
				// wipeLeft reveals from the right edge inward; wipeRight from the left.
				keyframes.brightnessKeyframes.push(ramp(1, -1, SMOOTH, SMOOTH));
				keyframes.wipeFromRight = transitionName === "wipeLeft" ? isIn : !isIn;
				break;
			}
			default: {
				const shuffle = SHUFFLES[transitionName];
				if (!shuffle) break;
				const [angle, x, y] = shuffle;
				keyframes.rotationKeyframes.push(ramp(angle, 0, SMOOTH, SMOOTH));
				keyframes.scaleKeyframes.push(ramp(1.5, 1, SMOOTH, SMOOTH));
				keyframes.origin = { x, y };
				break;
			}
		}

		return keyframes;
	}

	private getPresetName(direction: "in" | "out"): string {
		return direction === "in" ? this.inPreset.name : this.outPreset.name;
	}

	private getPresetLength(direction: "in" | "out"): number {
		const { name, speed } = direction === "in" ? this.inPreset : this.outPreset;

		if (name === "zoom") return 0.4;

		// Matches the render: slides and carousels take half as long as other transitions at every speed.
		const base = name.startsWith("slide") || name.startsWith("carousel") ? 0.5 : 1;
		switch (speed) {
			case "Slow":
				return base * 2;
			case "Fast":
				return base / 2;
			default:
				return base;
		}
	}
}
