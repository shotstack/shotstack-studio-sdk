/**
 * A timing value can be a numeric value (in seconds) or a special string.
 * - "auto" for start: position after previous clip on track
 * - "auto" for length: asset's intrinsic duration
 * - "end" for length: extend to timeline end
 */
export type TimingValue = number | "auto" | "end";

/**
 * Stores the original timing intent as specified by the user.
 * This is preserved even after resolution to numeric values.
 */
export interface TimingIntent {
	start: number | "auto";
	length: TimingValue;
}

/**
 * Resolved timing values in milliseconds.
 * Used for rendering and playback.
 */
export interface ResolvedTiming {
	start: number;
	length: number;
}
