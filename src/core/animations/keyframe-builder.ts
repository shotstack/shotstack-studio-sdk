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

	/**
	 * Cached index for temporal coherence optimization.
	 * During sequential playback, time increases monotonically,
	 * so checking the last-used index first is O(1) for ~99% of calls.
	 */
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

	/**
	 * Find keyframe containing the given time using temporal coherence + binary search.
	 * Optimized for sequential playback (O(1)) with binary search fallback (O(log n)).
	 */
	private findKeyframe(time: number): NumericKeyframe | undefined {
		const props = this.property;
		if (props.length === 0) return undefined;

		// Fast path: check cached index first (O(1) for sequential playback)
		const cached = props[this.cachedIndex];
		if (cached) {
			const cachedEnd = cached.start + cached.length;
			// Guard against NaN: must be finite to be a valid match
			if (Number.isFinite(cachedEnd) && time >= cached.start && time < cachedEnd) {
				return cached;
			}
		}

		// Check next index (time moved forward slightly)
		const nextIdx = this.cachedIndex + 1;
		if (nextIdx < props.length) {
			const next = props[nextIdx];
			const nextEnd = next.start + next.length;
			if (Number.isFinite(nextEnd) && time >= next.start && time < nextEnd) {
				this.cachedIndex = nextIdx;
				return next;
			}
		}

		// Check previous index (scrubbing backward)
		const prevIdx = this.cachedIndex - 1;
		if (prevIdx >= 0) {
			const prev = props[prevIdx];
			const prevEnd = prev.start + prev.length;
			if (Number.isFinite(prevEnd) && time >= prev.start && time < prevEnd) {
				this.cachedIndex = prevIdx;
				return prev;
			}
		}

		// Fallback: binary search (O(log n) for random seeks)
		const idx = this.binarySearchKeyframe(time);
		if (idx !== -1) {
			this.cachedIndex = idx;
			return props[idx];
		}

		return undefined;
	}

	/**
	 * Binary search for keyframe containing the given time.
	 * Returns index or -1 if not found.
	 * Handles NaN lengths by skipping invalid keyframes (matching original .find() behavior).
	 */
	private binarySearchKeyframe(time: number): number {
		const props = this.property;
		let low = 0;
		let high = props.length - 1;

		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const kf = props[mid];
			const end = kf.start + kf.length;

			// Guard against NaN: if end is not finite, skip this keyframe
			// This matches original .find() behavior where `time < NaN` returns false
			if (!Number.isFinite(end)) {
				low = mid + 1;
				continue;
			}

			if (time < kf.start) {
				high = mid - 1;
			} else if (time >= end) {
				low = mid + 1;
			} else {
				// Found: time >= kf.start && time < end
				return mid;
			}
		}

		return -1; // Not found
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
