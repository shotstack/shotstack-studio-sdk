import { type Keyframe, type NumericKeyframe } from "@schemas";

import { CurveInterpolator } from "./curve-interpolator";

export class KeyframeBuilder {
	private readonly property: NumericKeyframe[];
	private readonly length: number;

	private readonly cubicBuilder: CurveInterpolator;

	private cachedIndex = 0;

	constructor(value: Keyframe[] | number, length: number, initialValue = 0) {
		this.property = this.createKeyframes(value, length, initialValue);
		this.length = length;

		this.cubicBuilder = new CurveInterpolator();
	}

	public getValue(time: number): number {
		const keyframe = this.findKeyframe(time);
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

	private findKeyframe(time: number): NumericKeyframe | undefined {
		const props = this.property;
		if (props.length === 0) return undefined;

		const cached = props[this.cachedIndex];
		if (cached) {
			const cachedEnd = cached.start + cached.length;
			if (Number.isFinite(cachedEnd) && time >= cached.start && time < cachedEnd) {
				return cached;
			}
		}

		const nextIdx = this.cachedIndex + 1;
		if (nextIdx < props.length) {
			const next = props[nextIdx];
			const nextEnd = next.start + next.length;
			if (Number.isFinite(nextEnd) && time >= next.start && time < nextEnd) {
				this.cachedIndex = nextIdx;
				return next;
			}
		}

		const prevIdx = this.cachedIndex - 1;
		if (prevIdx >= 0) {
			const prev = props[prevIdx];
			const prevEnd = prev.start + prev.length;
			if (Number.isFinite(prevEnd) && time >= prev.start && time < prevEnd) {
				this.cachedIndex = prevIdx;
				return prev;
			}
		}

		const idx = this.binarySearchKeyframe(time);
		if (idx !== -1) {
			this.cachedIndex = idx;
			return props[idx];
		}

		return undefined;
	}

	private binarySearchKeyframe(time: number): number {
		const props = this.property;
		let low = 0;
		let high = props.length - 1;

		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const kf = props[mid];
			const end = kf.start + kf.length;

			if (!Number.isFinite(end) || time >= end) {
				low = mid + 1;
			} else if (time < kf.start) {
				high = mid - 1;
			} else {
				return mid;
			}
		}

		return -1;
	}

	private createKeyframes(value: Keyframe[] | number, length: number, initialValue = 0): NumericKeyframe[] {
		if (typeof value === "number") {
			return [{ start: 0, length, from: value, to: value }];
		}

		if (!value.length) {
			throw new Error("Keyframes should have at least one value.");
		}

		const normalizedKeyframes = this.createNormalizedKeyframes(value);

		this.validateKeyframes(normalizedKeyframes);

		return this.insertFillerKeyframes(normalizedKeyframes, length, initialValue);
	}

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
