/**
 * Shared font configuration for text and rich-text players
 */

import { GOOGLE_FONTS_BY_FILENAME, GOOGLE_FONTS_BY_NAME } from "./google-fonts";

const FONT_CDN = "https://templates.shotstack.io/basic/asset/font";

/** Font family name to file path mapping (variable fonts where available, matching Edit API) */
export const FONT_PATHS: Record<string, string> = {
	Arapey: `${FONT_CDN}/arapey-regular.ttf`,
	"Clear Sans": `${FONT_CDN}/clearsans-regular.ttf`,
	"Clear Sans Bold": `${FONT_CDN}/clearsans-bold.ttf`,
	"Didact Gothic": `${FONT_CDN}/didactgothic-regular.ttf`,
	Montserrat: `${FONT_CDN}/Montserrat.ttf`,
	MovLette: `${FONT_CDN}/movlette.ttf`,
	"Open Sans": `${FONT_CDN}/OpenSans.ttf`,
	"Permanent Marker": `${FONT_CDN}/permanentmarker-regular.ttf`,
	Roboto: `${FONT_CDN}/Roboto.ttf`,
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
 * Resolve a font family name to its file path.
 * Priority: Google filename hash → weight-specific built-in → exact match →
 * base font (variable) → Google variable → Google by display name.
 */
export function resolveFontPath(fontFamily: string, weight?: number): string | undefined {
	// Try Google Fonts by filename hash (from FontPicker selection)
	const googleFontByFilename = GOOGLE_FONTS_BY_FILENAME.get(fontFamily);
	if (googleFontByFilename) {
		return googleFontByFilename.url;
	}

	// Parse family and resolve aliases once (shared by all resolution steps)
	const { baseFontFamily } = parseFontFamily(fontFamily);
	const resolved = FONT_ALIASES[baseFontFamily] ?? baseFontFamily;

	// Try weight-specific built-in (e.g., "Clear Sans Bold" for weight 700)
	if (weight !== undefined && weight !== 400) {
		const modifier = Object.entries(WEIGHT_MODIFIERS).find(([, w]) => w === weight)?.[0];
		if (modifier) {
			const weightedName = `${resolved} ${modifier}`;
			if (FONT_PATHS[weightedName]) return FONT_PATHS[weightedName];
		}
	}

	// Try built-in fonts by exact input (e.g., "Clear Sans Bold" as literal key)
	if (FONT_PATHS[fontFamily]) return FONT_PATHS[fontFamily];

	// Try base font after alias resolution — covers variable fonts (Roboto, Montserrat, etc.)
	if (FONT_PATHS[resolved]) return FONT_PATHS[resolved];

	// Try Google Fonts — prefer variable when weight is specified
	if (weight !== undefined) {
		const googleFont = GOOGLE_FONTS_BY_NAME.get(resolved);
		if (googleFont?.isVariable) return googleFont.url;
	}

	// Fall back to Google Fonts by display name
	const googleFontByName = GOOGLE_FONTS_BY_NAME.get(fontFamily);
	if (googleFontByName) return googleFontByName.url;

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
