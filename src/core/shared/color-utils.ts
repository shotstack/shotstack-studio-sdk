/**
 * Color helpers for Pixi text/style construction.
 */

/** Matches Pixi Color HEX_PATTERN (3/4/6/8 hex digits, optional # or 0x). */
const HEX_PATTERN = /^(#|0x)?(([a-f0-9]{3}){1,2}([a-f0-9]{2})?)$/i;
const FUNCTIONAL_COLOR = /^(rgb|rgba|hsl|hsla)\(/i;
const CSS_COLOR_NAME = /^[a-z]+$/i;

/**
 * Return a Pixi-safe color string, or `fallback` when the value is missing/invalid.
 * Incomplete hex (e.g. `#00`, `#0`) and empty strings fall back instead of throwing in TextStyle.
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
