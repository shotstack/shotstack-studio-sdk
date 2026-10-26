import { KeyframeBuilder } from "../src/core/animations/keyframe-builder";

describe("KeyframeBuilder", () => {
	describe("getValue", () => {
		it("returns constant value for numeric input", () => {
			const builder = new KeyframeBuilder(0.5);

			expect(builder.getValue(0)).toBe(0.5);
			expect(builder.getValue(5)).toBe(0.5);
			expect(builder.getValue(10)).toBe(0.5);
		});

		it("interpolates between keyframe values", () => {
			const keyframes = [{ start: 0, length: 10, from: 0, to: 1 }];
			const builder = new KeyframeBuilder(keyframes);

			expect(builder.getValue(0)).toBe(0);
			expect(builder.getValue(5)).toBe(0.5);
			expect(builder.getValue(10)).toBe(1); // At end, returns last keyframe's "to"
		});

		it("returns default when time is before first keyframe", () => {
			const builder = new KeyframeBuilder(1);

			expect(builder.getValue(-1)).toBe(1);
		});

		it("returns last keyframe value when time exceeds length", () => {
			const builder = new KeyframeBuilder(0.8);

			expect(builder.getValue(15)).toBe(0.8);
		});
	});

	describe("the render's tween semantics", () => {
		it("holds the first tween's from value before it starts", () => {
			const builder = new KeyframeBuilder([{ start: 2, length: 1, from: 0.5, to: 1 }]);

			expect(builder.getValue(0)).toBe(0.5);
			expect(builder.getValue(1.5)).toBe(0.5);
		});

		it("bridges a gap with the next tween's interpolation", () => {
			const builder = new KeyframeBuilder([
				{ start: 0, length: 1, from: 0, to: 0.2, interpolation: "linear" },
				{ start: 2, length: 1, from: 0.6, to: 1, interpolation: "linear" }
			]);

			expect(builder.getValue(1.5)).toBeCloseTo(0.4);
		});

		it("eases a gap into a Bezier tween along the default curve, whatever the tween's easing", () => {
			const builder = new KeyframeBuilder([
				{ start: 0, length: 1, from: 0, to: 0, interpolation: "linear" },
				{ start: 2, length: 1, from: 1, to: 1, interpolation: "bezier", easing: "easeIn" }
			]);

			// cubic-bezier(0.5, 0, 0.5, 1) a quarter of the way through
			expect(builder.getValue(1.25)).toBeCloseTo(0.1059, 3);
		});

		it("holds the previous value through a gap before a constant tween", () => {
			const builder = new KeyframeBuilder([
				{ start: 0, length: 1, from: 0, to: 0.2, interpolation: "linear" },
				{ start: 2, length: 1, from: 0.8, to: 0.8, interpolation: "constant" }
			]);

			expect(builder.getValue(1.9)).toBe(0.2);
			expect(builder.getValue(2)).toBe(0.8);
		});
	});

	describe("non-finite input (regression test)", () => {
		// A NaN value reaching HTMLMediaElement.volume throws, so a broken tween must still give a finite value.
		it("handles NaN length with keyframe array input", () => {
			// Simulates a keyframe with invalid length that slipped through validation
			const keyframes = [{ start: 0, length: NaN, from: 0.5, to: 0.5 }];
			const builder = new KeyframeBuilder(keyframes);

			const value = builder.getValue(0);

			// Should return fallback value, not NaN
			expect(Number.isFinite(value)).toBe(true);
		});

		it("never returns NaN for any reasonable time input", () => {
			const builder = new KeyframeBuilder(1);

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
			const builder = new KeyframeBuilder(keyframes);

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
			const builder = new KeyframeBuilder(keyframes);

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
			const builder = new KeyframeBuilder(keyframes);

			// Random access pattern
			expect(builder.getValue(9)).toBeCloseTo(0.9);
			expect(builder.getValue(1)).toBeCloseTo(0.1);
			expect(builder.getValue(5)).toBeCloseTo(0.5);
			expect(builder.getValue(7)).toBeCloseTo(0.7);
			expect(builder.getValue(3)).toBeCloseTo(0.3);
		});
	});

	describe("timeline boundary safety", () => {
		it("plays adjacent decimal segments whose normalised end still rounds past the next start", () => {
			const builder = new KeyframeBuilder([
				{ start: 0, length: 0.7, from: 0, to: 1 },
				{ start: 0.7, length: 3.2, from: 1, to: 1 },
				{ start: 3.9, length: 0.35, from: 1, to: 0 }
			]);

			expect(builder.getValue(0.35)).toBeCloseTo(0.5);
			expect(builder.getValue(2)).toBe(1);
			expect(builder.getValue(4.075)).toBeCloseTo(0.5);
			expect(builder.getValue(4.25)).toBe(0);
		});

		it("preserves and evaluates a keyframe that extends beyond a shortened clip", () => {
			const builder = new KeyframeBuilder([{ start: 0, length: 10, from: 0, to: 1, interpolation: "linear" }]);

			expect(builder.getValue(5)).toBe(0.5);
		});

		it("tolerates floating-point noise between adjacent frame-derived segments", () => {
			const boundary = 2 / 29.97;
			const builder = new KeyframeBuilder([
				{ start: 0, length: boundary + 1e-10, from: 0, to: 0.5, interpolation: "linear" },
				{ start: boundary, length: 1, from: 0.5, to: 1, interpolation: "linear" }
			]);

			expect(builder.getValue(boundary)).toBeCloseTo(0.5);
		});

		it("normalises tolerated overlaps so seek order cannot change the value", () => {
			const overlap = 5e-7;
			const overlapTime = 1 + overlap / 2;
			const builder = new KeyframeBuilder([
				{ start: 0, length: 1 + overlap, from: 0, to: 0, interpolation: "linear" },
				{ start: 1, length: 1, from: 1, to: 1, interpolation: "linear" }
			]);

			builder.getValue(0.5);
			const valueAfterEarlierSeek = builder.getValue(overlapTime);
			builder.getValue(1.5);
			const valueAfterLaterSeek = builder.getValue(overlapTime);

			expect(valueAfterEarlierSeek).toBe(1);
			expect(valueAfterLaterSeek).toBe(valueAfterEarlierSeek);
		});

		it("fills a tiny positive gap from the tweens either side", () => {
			const builder = new KeyframeBuilder([
				{ start: 0, length: 1, from: 0, to: 0.2, interpolation: "linear" },
				{ start: 1 + 1e-10, length: 1, from: 0.4, to: 0.6, interpolation: "linear" }
			]);

			expect(builder.getValue(1 + 5e-11)).toBeLessThan(0.5);
		});

		it("still rejects material overlaps", () => {
			expect(
				() =>
					new KeyframeBuilder([
						{ start: 0, length: 1.01, from: 0, to: 0.5, interpolation: "linear" },
						{ start: 1, length: 1, from: 0.5, to: 1, interpolation: "linear" }
					])
			).toThrow("Overlapping keyframes detected.");
		});
	});
});
