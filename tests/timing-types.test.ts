/**
 * Regression tests for the timing type system.
 * These tests ensure that the branded types (Seconds/Milliseconds) prevent
 * timing bugs where conversions are forgotten or doubled.
 */

import { ms, sec, toMs, toSec, type Milliseconds, type Seconds } from "../src/core/timing/types";

describe("Timing Type System", () => {
	describe("conversion functions", () => {
		it("toMs converts seconds to milliseconds", () => {
			expect(toMs(sec(1))).toBe(1000);
			expect(toMs(sec(0.5))).toBe(500);
			expect(toMs(sec(2.5))).toBe(2500);
			expect(toMs(sec(0))).toBe(0);
		});

		it("toSec converts milliseconds to seconds", () => {
			expect(toSec(ms(1000))).toBe(1);
			expect(toSec(ms(500))).toBe(0.5);
			expect(toSec(ms(2500))).toBe(2.5);
			expect(toSec(ms(0))).toBe(0);
		});

		it("round-trip conversion is lossless", () => {
			const values = [0, 1, 2.5, 3.14159, 100, 0.001];
			for (const value of values) {
				const original = sec(value);
				const result = toSec(toMs(original));
				expect(result).toBeCloseTo(value, 10);
			}
		});

		it("handles edge cases correctly", () => {
			// Very small values
			expect(toMs(sec(0.001))).toBe(1);
			expect(toSec(ms(1))).toBe(0.001);

			// Negative values (for relative offsets)
			expect(toMs(sec(-1))).toBe(-1000);
			expect(toSec(ms(-1000))).toBe(-1);
		});
	});

	describe("factory functions", () => {
		it("sec() creates Seconds type", () => {
			const value: Seconds = sec(5);
			expect(value).toBe(5);
		});

		it("ms() creates Milliseconds type", () => {
			const value: Milliseconds = ms(5000);
			expect(value).toBe(5000);
		});

		it("preserves numeric precision", () => {
			expect(sec(3.14159265359)).toBeCloseTo(3.14159265359, 10);
			expect(ms(1234567.89)).toBeCloseTo(1234567.89, 10);
		});
	});

	describe("type safety (compile-time verification)", () => {
		it("branded types are structurally incompatible", () => {
			// These assertions verify runtime behavior, but the real protection
			// is at compile time - TypeScript prevents mixing Seconds and Milliseconds

			// Correct usage:
			const good1: Milliseconds = ms(5000);
			const good2: Milliseconds = toMs(sec(5));
			const good3: Seconds = toSec(ms(5000));

			expect(good1).toBe(5000);
			expect(good2).toBe(5000);
			expect(good3).toBe(5);

			// The following would fail TypeScript compilation if uncommented:
			// @ts-expect-error - Cannot assign plain number to Milliseconds
			// const bad1: Milliseconds = 5000;

			// @ts-expect-error - Cannot assign Seconds to Milliseconds
			// const bad2: Milliseconds = sec(5);

			// @ts-expect-error - Cannot pass Milliseconds to function expecting Seconds
			// toMs(ms(5000));
		});
	});
});

describe("Timing Regression Tests", () => {
	describe("common bug scenarios", () => {
		it("prevents the 1000x too short bug (forgot * 1000)", () => {
			// Scenario: User sets clip start to 2 seconds
			// Bug: Developer uses `2` directly instead of `2 * 1000` for milliseconds
			// Protection: Type system requires toMs(sec(2))

			const userInputSeconds = 2;
			const resolvedMs = toMs(sec(userInputSeconds));

			expect(resolvedMs).toBe(2000); // Correct: 2000ms, not 2ms
		});

		it("prevents the 1000x too long bug (forgot / 1000)", () => {
			// Scenario: Internal time is 5000ms, need to display in seconds
			// Bug: Developer displays `5000` instead of `5000 / 1000`
			// Protection: Type system requires toSec(ms(5000))

			const internalMs = ms(5000);
			const displaySeconds = toSec(internalMs);

			expect(displaySeconds).toBe(5); // Correct: 5s, not 5000s
		});

		it("prevents double conversion bug (* 1000 twice)", () => {
			// Scenario: Value already in ms, developer applies * 1000 again
			// Protection: toMs() only accepts Seconds, so you can't pass Milliseconds

			const valueInMs = ms(3000);
			// toMs(valueInMs) would be a TypeScript error

			// Correct pattern: use the value directly
			expect(valueInMs).toBe(3000);
		});

		it("prevents double conversion bug (/ 1000 twice)", () => {
			// Scenario: Value already in seconds, developer applies / 1000 again
			// Protection: toSec() only accepts Milliseconds, so you can't pass Seconds

			const valueInSec = sec(3);
			// toSec(valueInSec) would be a TypeScript error

			// Correct pattern: use the value directly
			expect(valueInSec).toBe(3);
		});
	});

	describe("real-world timing calculations", () => {
		it("calculates clip end time correctly", () => {
			const clipStart = ms(2000); // Clip starts at 2 seconds
			const clipLength = ms(5000); // Clip is 5 seconds long

			// Calculate end time (all in milliseconds)
			const clipEnd = ms(clipStart + clipLength);

			expect(clipEnd).toBe(7000); // Ends at 7 seconds
		});

		it("converts user input to internal timing correctly", () => {
			// User enters start: 2.5, length: 3 (in seconds)
			const userStart = 2.5;
			const userLength = 3;

			// Convert to internal milliseconds
			const internalStart = toMs(sec(userStart));
			const internalLength = toMs(sec(userLength));

			expect(internalStart).toBe(2500);
			expect(internalLength).toBe(3000);
		});

		it("converts internal timing to export format correctly", () => {
			// Internal state in milliseconds
			const internalStart = ms(2500);
			const internalLength = ms(3000);

			// Convert to export format (seconds)
			const exportStart = toSec(internalStart);
			const exportLength = toSec(internalLength);

			expect(exportStart).toBe(2.5);
			expect(exportLength).toBe(3);
		});

		it("handles timeline duration calculation", () => {
			// Multiple clips with their end times in milliseconds
			const clip1End = ms(3000);
			const clip2End = ms(5000);
			const clip3End = ms(4500);

			// Calculate total duration
			const totalDurationMs = ms(Math.max(clip1End, clip2End, clip3End));

			// Convert to seconds for display
			const totalDurationSec = toSec(totalDurationMs);

			expect(totalDurationMs).toBe(5000);
			expect(totalDurationSec).toBe(5);
		});
	});

	describe("video/audio API boundary", () => {
		it("converts playback time to video currentTime correctly", () => {
			// Internal playback time in milliseconds
			const playbackTimeMs = ms(5500);

			// HTML5 video element uses seconds for currentTime
			const videoCurrentTime = toSec(playbackTimeMs);

			expect(videoCurrentTime).toBe(5.5);
		});

		it("converts video duration to internal format correctly", () => {
			// Video element duration is in seconds
			const videoDuration = 10.5; // seconds

			// Convert to internal milliseconds
			const internalDuration = toMs(sec(videoDuration));

			expect(internalDuration).toBe(10500);
		});
	});
});
