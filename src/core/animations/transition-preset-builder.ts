import { type ResolvedClip } from "@schemas";

import { type PresetPoint } from "./keyframe-builder";

export type TransitionKeyframeSet = {
	offsetXKeyframes: PresetPoint[];
	offsetYKeyframes: PresetPoint[];
	opacityKeyframes: PresetPoint[];
	scaleKeyframes: PresetPoint[];
	rotationKeyframes: PresetPoint[];
	maskXKeyframes: PresetPoint[];
	/** Wipe brightness sweep (+1 hidden → −1 revealed), applied through WipeFilter. */
	brightnessKeyframes: PresetPoint[];
	/** Zoom blur radius, in pixels of the clip before its scale applies. */
	blurKeyframes: PresetPoint[];
	/** The point the clip rotates about, as a fraction of its size from the top left. */
	originXKeyframes: PresetPoint[];
	originYKeyframes: PresetPoint[];
	/** Wipe reveal direction for this phase: true = from the right edge inward, false = from the left. */
	wipeFromRight: boolean;
};

export type RelativeTransitionKeyframeSet = {
	in: TransitionKeyframeSet;
	out: TransitionKeyframeSet;
};

type ParsedTransition = { name: string; speed: string | undefined };
type Curve = PresetPoint["interpolation"];

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
			originXKeyframes: [],
			originYKeyframes: [],
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
		const edgeTime = isIn ? 0 : this.clipConfiguration.length;
		const innerTime = isIn ? length : start;

		// Like the render, a transition reads the property at both its ends, then adds a point at each: the clip's edge
		// takes `edge` (added to the value read at `edgeAt`, if given) and the inner end keeps the value read there.
		const ramp = (edge: number, edgeAt: number | undefined, edgeCurve: Curve, innerCurve: Curve): PresetPoint[] => {
			const edgePoint = { time: edgeTime, value: edge, at: edgeAt, interpolation: edgeCurve };
			const innerPoint = { time: innerTime, value: 0, at: innerTime, interpolation: innerCurve };
			return isIn ? [edgePoint, innerPoint] : [innerPoint, edgePoint];
		};
		const fade = ramp(0, undefined, "bezier", "bezier");

		switch (transitionName) {
			case "fade": {
				keyframes.opacityKeyframes.push(...fade);
				break;
			}
			case "zoom": {
				keyframes.scaleKeyframes.push(...ramp(9, edgeTime, "bezier", "linear"));
				keyframes.opacityKeyframes.push(...fade);
				keyframes.blurKeyframes.push(...ramp(5, undefined, "bezier", "bezier"));
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
				targetKeyframes.push(...ramp(edge, edgeTime, "bezier", "linear"));
				if (isSlide) keyframes.opacityKeyframes.push(...fade);
				break;
			}
			case "reveal": {
				keyframes.maskXKeyframes.push(...ramp(0, undefined, "bezier", "bezier"));
				break;
			}
			case "wipeLeft":
			case "wipeRight": {
				// Brightness sweeps +1 (hidden) → −1 (revealed) in, and back out, applied via WipeFilter.
				// wipeLeft reveals from the right edge inward; wipeRight from the left.
				keyframes.brightnessKeyframes.push(...ramp(1, undefined, "bezier", "bezier"));
				keyframes.wipeFromRight = transitionName === "wipeLeft" ? isIn : !isIn;
				break;
			}
			default: {
				const shuffle = SHUFFLES[transitionName];
				if (!shuffle) break;
				const [angle, x, y] = shuffle;
				// The render measures both ends of the swing from the rotation where it meets the clip.
				keyframes.rotationKeyframes.push(...ramp(angle, innerTime, "bezier", "bezier"));
				keyframes.scaleKeyframes.push(...ramp(0.5, edgeTime, "bezier", "bezier"));
				keyframes.originXKeyframes.push({ time: start, value: x, interpolation: "bezier" });
				keyframes.originYKeyframes.push({ time: start, value: y, interpolation: "bezier" });
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
