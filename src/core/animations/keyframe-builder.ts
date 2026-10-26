import { type AnimationKeyframe, type NumericKeyframe } from "@schemas";

import { CurveInterpolator } from "./curve-interpolator";

/**
 * Tolerance for comparing frame-derived times, which are stored as seconds and so
 * are not exactly representable (least of all at 23.976 / 29.97 / 59.94). Far above
 * real accumulated drift (~1e-13) and far below one frame at the highest supported
 * rate (~1.7e-2 at 60fps).
 */
export const TIME_EPSILON = 1e-6;

/** A curve point as the render keeps them: a segment takes its right point's interpolation and the handles facing into it. */
type Point = { time: number; value: number; interpolation: NumericKeyframe["interpolation"]; handleLeft: number[]; handleRight: number[] };

const curves = new CurveInterpolator();
// The render gives every point its default curve's handles unless a tween sets them.
const [DEFAULT_RIGHT, DEFAULT_LEFT] = curves.getHandles("smooth");

export class KeyframeBuilder {
	private readonly points: Point[];

	constructor(value: AnimationKeyframe[] | number) {
		this.points = this.createPoints(value);
	}

	public getValue(time: number): number {
		const index = this.points.findLastIndex(point => point.time <= time);
		const left = this.points[index];
		const right = this.points[index + 1];
		// Before the first point and after the last the curve holds that point's value; with no usable tween it reads 1.
		if (!left || !right) return (left ?? right)?.value ?? 1;

		const progress = (time - left.time) / (right.time - left.time);
		switch (right.interpolation) {
			case "bezier":
				return curves.getValue(left.value, right.value, progress, [left.handleRight, right.handleLeft]);
			case "constant":
				return left.value;
			case "linear":
			default:
				return left.value + (right.value - left.value) * progress;
		}
	}

	private createPoints(value: AnimationKeyframe[] | number): Point[] {
		if (typeof value === "number") {
			return [{ time: 0, value, interpolation: "constant", handleLeft: DEFAULT_LEFT, handleRight: DEFAULT_RIGHT }];
		}

		if (!value.length) {
			throw new Error("Keyframes should have at least one value.");
		}

		const normalizedKeyframes = this.createNormalizedKeyframes(value);

		this.normaliseAdjacentBoundaries(normalizedKeyframes);
		this.validateKeyframes(normalizedKeyframes);

		// Adjacent tweens each keep a point at their shared time, so each keeps its own curve.
		return normalizedKeyframes.flatMap(({ start, length, from, to, interpolation, easing }) => {
			const [handleRight, handleLeft] = interpolation === "bezier" ? curves.getHandles(easing) : [DEFAULT_RIGHT, DEFAULT_LEFT];
			return [
				{ time: start, value: from, interpolation, handleLeft: DEFAULT_LEFT, handleRight },
				{ time: start + length, value: to, interpolation, handleLeft, handleRight: DEFAULT_RIGHT }
			];
		});
	}

	private createNormalizedKeyframes(keyframes: AnimationKeyframe[]): NumericKeyframe[] {
		return keyframes
			.filter((kf): kf is AnimationKeyframe & { start: number; length: number } => Number.isFinite(kf.start) && Number.isFinite(kf.length))
			.sort((a, b) => a.start - b.start)
			.map(keyframe => ({
				start: keyframe.start,
				length: keyframe.length,
				from: typeof keyframe.from === "number" ? keyframe.from : 0,
				to: typeof keyframe.to === "number" ? keyframe.to : 0,
				interpolation: keyframe.interpolation,
				easing: keyframe.easing
			}));
	}

	private normaliseAdjacentBoundaries(keyframes: NumericKeyframe[]): void {
		for (let i = 0; i < keyframes.length - 1; i += 1) {
			const current = keyframes[i];
			const next = keyframes[i + 1];
			const boundaryDelta = current.start + current.length - next.start;
			const canonicalLength = next.start - current.start;

			if (Math.abs(boundaryDelta) <= TIME_EPSILON && canonicalLength > 0) {
				current.length = canonicalLength;
			}
		}
	}

	private validateKeyframes(keyframes: NumericKeyframe[]): void {
		for (let i = 0; i < keyframes.length; i += 1) {
			const current = keyframes[i];
			const next = keyframes[i + 1];

			if (!next) break;

			if (current.start + current.length - next.start > TIME_EPSILON) {
				throw new Error("Overlapping keyframes detected.");
			}
		}
	}
}
