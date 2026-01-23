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
 * An alias reference to another clip's timing.
 */
export type AliasReference = `alias://${string}`;

/**
 * Check if a value is an alias reference string.
 */
export function isAliasReference(value: unknown): value is AliasReference {
	return typeof value === "string" && /^alias:\/\/[a-zA-Z0-9_-]+$/.test(value);
}

/**
 * Extract the alias name from an alias reference.
 */
export function parseAliasName(value: AliasReference): string {
	return value.replace(/^alias:\/\//, "");
}

/**
 * A timing value can be a numeric value (in seconds) or a special string.
 * - "auto" for start: position after previous clip on track
 * - "auto" for length: asset's intrinsic duration
 * - "end" for length: extend to timeline end
 * - "alias://x" for start/length: reference another clip's timing
 */
export type TimingValue = Seconds | "auto" | "end" | AliasReference;

/**
 * Stores the original timing intent as specified by the user.
 * This is preserved even after resolution to numeric values.
 * All numeric values are in seconds.
 */
export interface TimingIntent {
	start: Seconds | "auto" | AliasReference;
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

/**
 * Context required to resolve timing intent to concrete values.
 *
 * @see resolveTimingIntent - the pure function that uses this context
 */
export interface ResolutionContext {
	/** End time of previous clip on same track (for start: "auto") */
	readonly previousClipEnd: Seconds;
	/** Total duration of timeline excluding "end" clips (for length: "end") */
	readonly timelineEnd: Seconds;
	/** Intrinsic duration from asset metadata, null if not yet loaded (for length: "auto") */
	readonly intrinsicDuration: Seconds | null;
}
