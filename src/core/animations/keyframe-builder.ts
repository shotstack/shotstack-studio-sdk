import { type Keyframe, type NumericKeyframe } from "@schemas";

import { CurveInterpolator } from "./curve-interpolator";

/**
 * Builds interpolatable keyframe sequences from external Keyframe data.
 * Converts the external schema's optional/unknown typed keyframes into
 * a normalized internal representation with guaranteed numeric values.
 */
export class KeyframeBuilder {
	private readonly property: NumericKeyframe[];
	private readonly length: number;

	private readonly cubicBuilder: CurveInterpolator;

	constructor(value: Keyframe[] | number, length: number, initialValue = 0) {
		this.property = this.createKeyframes(value, length, initialValue);
		this.length = length;

		this.cubicBuilder = new CurveInterpolator();
	}

	public getValue(time: number): number {
		const keyframe = this.property.find(value => time >= value.start && time < value.start + value.length);
		if (!keyframe) {
			if (this.property.length > 0) {
				if (time >= this.length) return this.property[this.property.length - 1].to;
				if (time < 0) return this.property[0].from;
			}
			return 1;
		}

		const progress = (time - keyframe.start) / keyframe.length;
		switch (keyframe.interpolation) {
			case "bezier":
				return this.cubicBuilder.getValue(keyframe.from, keyframe.to, progress, keyframe.easing);
			case "constant":
				return keyframe.from;
			case "linear":
			default:
				return keyframe.from + (keyframe.to - keyframe.from) * progress;
		}
	}

	private createKeyframes(value: Keyframe[] | number, length: number, initialValue = 0): NumericKeyframe[] {
		if (typeof value === "number") {
			return [{ start: 0, length, from: value, to: value }];
		}

		if (!value.length) {
			throw new Error("Keyframes should have at least one value.");
		}

		const normalizedKeyframes = this.createNormalizedKeyframes(value);

		try {
			this.validateKeyframes(normalizedKeyframes);
		} catch (error) {
			console.warn("Keyframe configuration issues detected:", error);
		}

		return this.insertFillerKeyframes(normalizedKeyframes, length, initialValue);
	}

	/**
	 * Converts external Keyframe[] to internal NumericKeyframe[].
	 * - Filters out keyframes without required start/length
	 * - Coerces from/to to numbers (defaults to 0 if not numeric)
	 * - Timing values are kept in seconds (consistent with getPlaybackTime())
	 */
	private createNormalizedKeyframes(keyframes: Keyframe[]): NumericKeyframe[] {
		return keyframes
			.filter((kf): kf is Keyframe & { start: number; length: number } => typeof kf.start === "number" && typeof kf.length === "number")
			.toSorted((a, b) => a.start - b.start)
			.map(keyframe => ({
				start: keyframe.start,
				length: keyframe.length,
				from: typeof keyframe.from === "number" ? keyframe.from : 0,
				to: typeof keyframe.to === "number" ? keyframe.to : 0,
				interpolation: keyframe.interpolation,
				easing: keyframe.easing
			}));
	}

	private validateKeyframes(keyframes: NumericKeyframe[]): void {
		for (let i = 0; i < keyframes.length; i += 1) {
			const current = keyframes[i];
			const next = keyframes[i + 1];

			if (!next) {
				if (current.start + current.length > this.length) {
					throw new Error("Last keyframe exceeds the maximum duration.");
				}

				break;
			}

			if (current.start + current.length > next.start) {
				throw new Error("Overlapping keyframes detected.");
			}
		}
	}

	private insertFillerKeyframes(keyframes: NumericKeyframe[], length: number, initialValue = 0): NumericKeyframe[] {
		const updatedKeyframes: NumericKeyframe[] = [];

		for (let i = 0; i < keyframes.length; i += 1) {
			const current = keyframes[i];
			const next = keyframes[i + 1];

			const shouldFillStart = i === 0 && current.start !== 0;
			if (shouldFillStart) {
				const fillerKeyframe: NumericKeyframe = { start: 0, length: current.start, from: initialValue, to: current.from };
				updatedKeyframes.push(fillerKeyframe);
			}

			updatedKeyframes.push(current);

			if (!next) {
				const shouldFillEnd = current.start + current.length < length;
				if (shouldFillEnd) {
					const currentStart = current.start + current.length;
					const fillerKeyframe: NumericKeyframe = { start: currentStart, length: length - currentStart, from: current.to, to: current.to };

					updatedKeyframes.push(fillerKeyframe);
				}

				break;
			}

			const shouldFillMiddle = current.start + current.length !== next.start;
			if (shouldFillMiddle) {
				const fillerStart = current.start + current.length;
				const fillerLength = next.start - fillerStart;
				const fillerKeyframe: NumericKeyframe = { start: fillerStart, length: fillerLength, from: current.to, to: next.from };
				updatedKeyframes.push(fillerKeyframe);
			}
		}

		return updatedKeyframes;
	}
}
