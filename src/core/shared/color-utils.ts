/**
 * Color helpers for Pixi text/style construction.
 */

/** Matches Pixi Color HEX_PATTERN: exactly 3, 4, 6, or 8 hex digits (optional # or 0x). */
const HEX_PATTERN = /^(#|0x)?([a-f0-9]{3}|[a-f0-9]{4}|[a-f0-9]{6}|[a-f0-9]{8})$/i;
const FUNCTIONAL_COLOR = /^(rgb|rgba|hsl|hsla)\(/i;
const CSS_COLOR_NAME = /^[a-z]+$/i;

/**
 * Return a Pixi-safe color string, or `fallback` when the value is missing/invalid.
 * Incomplete hex (e.g. `#00`, `#00000`), unsubstituted merge tokens (e.g. `{{ BG_COLOR }}`),
 * and empty strings fall back instead of throwing in TextStyle / Graphics fillStyle.
 * @internal
 */
export function sanitizeColor(color: string | undefined | null, fallback = "#ffffff"): string {
	if (typeof color !== "string") {
		return fallback;
	}

	const value = color.trim();
	if (!value) {
		return fallback;
	}

	if (HEX_PATTERN.test(value) || FUNCTIONAL_COLOR.test(value) || CSS_COLOR_NAME.test(value)) {
		return value;
	}

	return fallback;
}
