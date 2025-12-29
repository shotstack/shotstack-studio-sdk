// ─── Branded Types ───────────────────────────────────────────────────────────
// These provide compile-time safety to prevent mixing seconds and milliseconds.
// The brands are erased at runtime - zero overhead.

declare const SecondsSymbol: unique symbol;
declare const MillisecondsSymbol: unique symbol;

/**
 * A number representing time in seconds.
 * Used at API/configuration boundaries where users specify timing.
 */
export type Seconds = number & { readonly [SecondsSymbol]: typeof SecondsSymbol };

/**
 * A number representing time in milliseconds.
 * Used internally for rendering and playback calculations.
 */
export type Milliseconds = number & { readonly [MillisecondsSymbol]: typeof MillisecondsSymbol };

// ─── Conversion Functions ────────────────────────────────────────────────────

/**
 * Convert seconds to milliseconds.
 * @example toMs(sec(2.5)) // 2500
 */
export function toMs(seconds: Seconds): Milliseconds {
	return (seconds * 1000) as Milliseconds;
}

/**
 * Convert milliseconds to seconds.
 * @example toSec(ms(2500)) // 2.5
 */
export function toSec(milliseconds: Milliseconds): Seconds {
	return (milliseconds / 1000) as Seconds;
}

/**
 * Create a typed Seconds value from an untyped number.
 * Use at API boundaries where we receive user input.
 * @example sec(2.5)
 */
export function sec(value: number): Seconds {
	return value as Seconds;
}

/**
 * Create a typed Milliseconds value from an untyped number.
 * Use at internal boundaries where we have raw ms values.
 * @example ms(2500)
 */
export function ms(value: number): Milliseconds {
	return value as Milliseconds;
}

// ─── Timing Types ────────────────────────────────────────────────────────────

/**
 * A timing value can be a numeric value (in seconds) or a special string.
 * - "auto" for start: position after previous clip on track
 * - "auto" for length: asset's intrinsic duration
 * - "end" for length: extend to timeline end
 */
export type TimingValue = Seconds | "auto" | "end";

/**
 * Stores the original timing intent as specified by the user.
 * This is preserved even after resolution to numeric values.
 * All numeric values are in seconds.
 */
export interface TimingIntent {
	start: Seconds | "auto";
	length: TimingValue;
}

/**
 * Resolved timing values in seconds.
 * Matches the external @shotstack/schemas unit convention.
 * Conversion to milliseconds happens only in the Player layer for pixi rendering.
 */
export interface ResolvedTiming {
	start: Seconds;
	length: Seconds;
}
