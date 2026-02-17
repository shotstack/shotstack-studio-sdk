/**
 * Shared font configuration for text and rich-text players
 */

import { GOOGLE_FONTS_BY_FILENAME, GOOGLE_FONTS_BY_NAME } from "./google-fonts";

const FONT_CDN = "https://templates.shotstack.io/basic/asset/font";

/** Font family name to file path mapping */
export const FONT_PATHS: Record<string, string> = {
	Arapey: `${FONT_CDN}/arapey-regular.ttf`,
	"Clear Sans": `${FONT_CDN}/clearsans-regular.ttf`,
	"Clear Sans Bold": `${FONT_CDN}/clearsans-bold.ttf`,
	"Didact Gothic": `${FONT_CDN}/didactgothic-regular.ttf`,
	Montserrat: `${FONT_CDN}/montserrat-regular.ttf`,
	"Montserrat Bold": `${FONT_CDN}/montserrat-bold.ttf`,
	"Montserrat ExtraBold": `${FONT_CDN}/montserrat-extrabold.ttf`,
	"Montserrat SemiBold": `${FONT_CDN}/montserrat-semibold.ttf`,
	"Montserrat Light": `${FONT_CDN}/montserrat-light.ttf`,
	"Montserrat Medium": `${FONT_CDN}/montserrat-medium.ttf`,
	"Montserrat Black": `${FONT_CDN}/montserrat-black.ttf`,
	MovLette: `${FONT_CDN}/movlette.ttf`,
	"Open Sans": `${FONT_CDN}/opensans-regular.ttf`,
	"Open Sans Bold": `${FONT_CDN}/opensans-bold.ttf`,
	"Open Sans ExtraBold": `${FONT_CDN}/opensans-extrabold.ttf`,
	"Permanent Marker": `${FONT_CDN}/permanentmarker-regular.ttf`,
	Roboto: `${FONT_CDN}/roboto-regular.ttf`,
	"Roboto Bold": `${FONT_CDN}/roboto-bold.ttf`,
	"Roboto Light": `${FONT_CDN}/roboto-light.ttf`,
	"Roboto Medium": `${FONT_CDN}/roboto-medium.ttf`,
	"Sue Ellen Francisco": `${FONT_CDN}/sueellenfrancisco-regular.ttf`,
	"Work Sans": `${FONT_CDN}/worksans.ttf`
};

/** Alternative names (camelCase, etc.) mapped to canonical names */
export const FONT_ALIASES: Record<string, string> = {
	ClearSans: "Clear Sans",
	DidactGothic: "Didact Gothic",
	OpenSans: "Open Sans",
	PermanentMarker: "Permanent Marker",
	SueEllenFrancisco: "Sue Ellen Francisco",
	WorkSans: "Work Sans"
};

/** Weight modifier suffixes mapped to CSS font-weight values */
export const WEIGHT_MODIFIERS: Record<string, number> = {
	Thin: 100,
	ExtraLight: 200,
	Light: 300,
	Regular: 400,
	Medium: 500,
	SemiBold: 600,
	Bold: 700,
	ExtraBold: 800,
	Black: 900
};

/**
 * Parse a font family name to extract base family and weight
 * e.g., "Montserrat ExtraBold" → { baseFontFamily: "Montserrat", fontWeight: 800 }
 * Case-insensitive matching for weight modifiers (handles "Extrabold", "ExtraBold", etc.)
 */
export function parseFontFamily(fontFamily: string): { baseFontFamily: string; fontWeight: number } {
	const lowerFamily = fontFamily.toLowerCase();
	for (const [modifier, weight] of Object.entries(WEIGHT_MODIFIERS)) {
		const lowerModifier = ` ${modifier.toLowerCase()}`;
		if (lowerFamily.endsWith(lowerModifier)) {
			return {
				baseFontFamily: fontFamily.slice(0, -modifier.length - 1),
				fontWeight: weight
			};
		}
	}
	return { baseFontFamily: fontFamily, fontWeight: 400 };
}

/**
 * Resolve a font family name to its file path
 */
export function resolveFontPath(fontFamily: string): string | undefined {
	// Try Google Fonts by filename hash (from FontPicker selection)
	const googleFontByFilename = GOOGLE_FONTS_BY_FILENAME.get(fontFamily);
	if (googleFontByFilename) {
		return googleFontByFilename.url;
	}

	// Try built-in fonts by exact match (e.g., "Montserrat ExtraBold")
	if (FONT_PATHS[fontFamily]) {
		return FONT_PATHS[fontFamily];
	}

	// Try built-in fonts by alias or base name
	const { baseFontFamily } = parseFontFamily(fontFamily);
	const resolvedName = FONT_ALIASES[baseFontFamily] ?? baseFontFamily;
	if (FONT_PATHS[resolvedName]) {
		return FONT_PATHS[resolvedName];
	}

	// Fall back to Google Fonts by display name (for fonts not in built-in list)
	const googleFontByName = GOOGLE_FONTS_BY_NAME.get(fontFamily);
	if (googleFontByName) {
		return googleFontByName.url;
	}

	return undefined;
}

/**
 * Check if a font family is a Google Font
 */
export function isGoogleFont(fontFamily: string): boolean {
	return GOOGLE_FONTS_BY_FILENAME.has(fontFamily) || GOOGLE_FONTS_BY_NAME.has(fontFamily);
}

/**
 * Get the display name for a font (resolves Google Font filename hashes to readable names)
 */
export function getFontDisplayName(fontFamily: string): string {
	const googleFont = GOOGLE_FONTS_BY_FILENAME.get(fontFamily);
	if (googleFont) {
		return googleFont.displayName;
	}
	return fontFamily;
}
