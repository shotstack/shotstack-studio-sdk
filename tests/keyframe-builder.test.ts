import { KeyframeBuilder } from "../src/core/animations/keyframe-builder";

describe("KeyframeBuilder", () => {
	describe("getValue", () => {
		it("returns constant value for numeric input", () => {
			const builder = new KeyframeBuilder(0.5, 10);

			expect(builder.getValue(0)).toBe(0.5);
			expect(builder.getValue(5)).toBe(0.5);
			expect(builder.getValue(10)).toBe(0.5);
		});

		it("interpolates between keyframe values", () => {
			const keyframes = [{ start: 0, length: 10, from: 0, to: 1 }];
			const builder = new KeyframeBuilder(keyframes, 10);

			expect(builder.getValue(0)).toBe(0);
			expect(builder.getValue(5)).toBe(0.5);
			expect(builder.getValue(10)).toBe(1); // At end, returns last keyframe's "to"
		});

		it("returns default when time is before first keyframe", () => {
			const builder = new KeyframeBuilder(1, 10);

			expect(builder.getValue(-1)).toBe(1);
		});

		it("returns last keyframe value when time exceeds length", () => {
			const builder = new KeyframeBuilder(0.8, 10);

			expect(builder.getValue(15)).toBe(0.8);
		});
	});

	describe("NaN length handling (regression test)", () => {
		/**
		 * Regression test for volume NaN bug.
		 *
		 * When clip length is "end" and not properly resolved, getLength() returns NaN.
		 * The KeyframeBuilder must handle this gracefully by returning a valid default (1)
		 * rather than returning NaN which causes HTMLMediaElement errors:
		 * "Failed to set the 'volume' property: The provided double value is non-finite."
		 *
		 * The original .find() handled this because `time < NaN` returns false.
		 * The optimized binary search must match this behavior.
		 */
		it("returns valid default when length is NaN", () => {
			const builder = new KeyframeBuilder(1, NaN);

			// Should return 1 (the default), not NaN
			const value = builder.getValue(0);

			expect(Number.isFinite(value)).toBe(true);
			expect(value).toBe(1);
		});

		it("returns valid default when length is Infinity", () => {
			const builder = new KeyframeBuilder(1, Infinity);

			const value = builder.getValue(0);

			expect(Number.isFinite(value)).toBe(true);
		});

		it("handles NaN length with keyframe array input", () => {
			// Simulates a keyframe with invalid length that slipped through validation
			const keyframes = [{ start: 0, length: NaN, from: 0.5, to: 0.5 }];
			const builder = new KeyframeBuilder(keyframes, NaN);

			const value = builder.getValue(0);

			// Should return fallback value, not NaN
			expect(Number.isFinite(value)).toBe(true);
		});

		it("never returns NaN for any reasonable time input", () => {
			const builder = new KeyframeBuilder(1, 10);

			// Test various time values including edge cases
			const times = [-1, 0, 0.001, 5, 9.999, 10, 11, 100];

			times.forEach(time => {
				const value = builder.getValue(time);
				expect(Number.isFinite(value)).toBe(true);
			});
		});
	});

	describe("temporal coherence caching", () => {
		it("handles sequential playback efficiently", () => {
			const keyframes = [
				{ start: 0, length: 5, from: 0, to: 0.5 },
				{ start: 5, length: 5, from: 0.5, to: 1 }
			];
			const builder = new KeyframeBuilder(keyframes, 10);

			// Simulate sequential playback - cache should provide O(1) lookups
			expect(builder.getValue(0)).toBe(0);
			expect(builder.getValue(1)).toBeCloseTo(0.1);
			expect(builder.getValue(4)).toBeCloseTo(0.4);
			expect(builder.getValue(5)).toBe(0.5);
			expect(builder.getValue(6)).toBeCloseTo(0.6);
			expect(builder.getValue(9)).toBeCloseTo(0.9);
		});

		it("handles scrubbing backward", () => {
			const keyframes = [
				{ start: 0, length: 5, from: 0, to: 0.5 },
				{ start: 5, length: 5, from: 0.5, to: 1 }
			];
			const builder = new KeyframeBuilder(keyframes, 10);

			// Forward then backward
			expect(builder.getValue(8)).toBeCloseTo(0.8);
			expect(builder.getValue(7)).toBeCloseTo(0.7);
			expect(builder.getValue(3)).toBeCloseTo(0.3);
			expect(builder.getValue(1)).toBeCloseTo(0.1);
		});

		it("handles random seeks via binary search", () => {
			const keyframes = [
				{ start: 0, length: 2, from: 0, to: 0.2 },
				{ start: 2, length: 2, from: 0.2, to: 0.4 },
				{ start: 4, length: 2, from: 0.4, to: 0.6 },
				{ start: 6, length: 2, from: 0.6, to: 0.8 },
				{ start: 8, length: 2, from: 0.8, to: 1 }
			];
			const builder = new KeyframeBuilder(keyframes, 10);

			// Random access pattern
			expect(builder.getValue(9)).toBeCloseTo(0.9);
			expect(builder.getValue(1)).toBeCloseTo(0.1);
			expect(builder.getValue(5)).toBeCloseTo(0.5);
			expect(builder.getValue(7)).toBeCloseTo(0.7);
			expect(builder.getValue(3)).toBeCloseTo(0.3);
		});
	});
});
