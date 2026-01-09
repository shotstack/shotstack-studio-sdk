/**
 * Debug assertions for state consistency verification.
 * These run in development builds to catch invariant violations early.
 *
 * @internal
 */

import { resolveTimingIntent } from "@core/timing/resolver";
import type { ResolutionContext, ResolvedTiming, Seconds, TimingIntent } from "@core/timing/types";

/**
 * Check if we're in a development/debug build.
 * Tree-shaken in production builds.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention, no-underscore-dangle
export const __DEV__ = process.env["NODE_ENV"] !== "production";

/**
 * Maximum acceptable difference between expected and actual timing values.
 * Floating point arithmetic may introduce tiny errors.
 */
const TIMING_EPSILON = 0.001;

/**
 * Format a timing value for error messages.
 */
function formatTimingValue(value: Seconds | "auto" | "end"): string {
	if (typeof value === "string") return `"${value}"`;
	return `${value}s`;
}

/**
 * Assert that resolved timing matches what the pure resolution function would produce.
 *
 * INVARIANT: resolved = resolveTimingIntent(intent, context)
 *
 * Call this after any timing mutation to verify state consistency.
 * Only runs in development builds.
 *
 * @param intent - The timing intent that was resolved
 * @param actual - The actual resolved timing values on the player
 * @param context - The resolution context used
 * @throws Error if the invariant is violated (only in dev builds)
 */
export function assertTimingConsistency(intent: TimingIntent, actual: ResolvedTiming, context: Readonly<ResolutionContext>): void {
	if (!__DEV__) return;

	const expected = resolveTimingIntent(intent, context);

	const startDiff = Math.abs(expected.start - actual.start);
	const lengthDiff = Math.abs(expected.length - actual.length);

	if (startDiff > TIMING_EPSILON) {
		throw new Error(
			`INVARIANT VIOLATION: Start mismatch\n` +
				`  Intent: ${formatTimingValue(intent.start)}\n` +
				`  Context: previousClipEnd=${context.previousClipEnd}\n` +
				`  Expected: ${expected.start}\n` +
				`  Actual: ${actual.start}\n` +
				`  Diff: ${startDiff}`
		);
	}

	if (lengthDiff > TIMING_EPSILON) {
		throw new Error(
			`INVARIANT VIOLATION: Length mismatch\n` +
				`  Intent: ${formatTimingValue(intent.length)}\n` +
				`  Context: timelineEnd=${context.timelineEnd}, intrinsicDuration=${context.intrinsicDuration}\n` +
				`  Expected: ${expected.length}\n` +
				`  Actual: ${actual.length}\n` +
				`  Diff: ${lengthDiff}`
		);
	}
}

/**
 * Assert that a condition is true. Throws with the provided message if not.
 * Only runs in development builds.
 */
export function assertDev(condition: boolean, message: string): asserts condition {
	if (!__DEV__) return;

	if (!condition) {
		throw new Error(`ASSERTION FAILED: ${message}`);
	}
}

/**
 * Assert that a value is not null or undefined.
 * Returns the value with narrowed type.
 * Only throws in development builds; in production returns the value (may be undefined).
 */
export function assertExists<T>(value: T | null | undefined, name: string): T {
	if (!__DEV__) return value as T;

	if (value === null || value === undefined) {
		throw new Error(`ASSERTION FAILED: ${name} is ${value === null ? "null" : "undefined"}`);
	}
	return value;
}
