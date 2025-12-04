/**
 * Shared font configuration for text and rich-text players
 */

/** Font family name to file path mapping */
export const FONT_PATHS: Record<string, string> = {
	Arapey: "/assets/fonts/Arapey-Regular.ttf",
	"Clear Sans": "/assets/fonts/ClearSans-Regular.ttf",
	"Didact Gothic": "/assets/fonts/DidactGothic-Regular.ttf",
	Montserrat: "/assets/fonts/Montserrat.ttf",
	"Montserrat ExtraBold": "/assets/fonts/Montserrat-ExtraBold.ttf",
	"Montserrat SemiBold": "/assets/fonts/Montserrat-SemiBold.ttf",
	MovLette: "/assets/fonts/MovLette.ttf",
	"Open Sans": "/assets/fonts/OpenSans.ttf",
	"Open Sans Bold": "/assets/fonts/OpenSans-Bold.ttf",
	"Permanent Marker": "/assets/fonts/PermanentMarker-Regular.ttf",
	Roboto: "/assets/fonts/Roboto.ttf",
	"Sue Ellen Francisco": "/assets/fonts/SueEllenFrancisco.ttf",
	"Uni Neue": "/assets/fonts/UniNeue-Bold.otf",
	"Work Sans": "/assets/fonts/WorkSans.ttf",
	"Work Sans Light": "/assets/fonts/WorkSans-Light.ttf"
};

/** Alternative names (camelCase, etc.) mapped to canonical names */
export const FONT_ALIASES: Record<string, string> = {
	ClearSans: "Clear Sans",
	DidactGothic: "Didact Gothic",
	OpenSans: "Open Sans",
	PermanentMarker: "Permanent Marker",
	SueEllenFrancisco: "Sue Ellen Francisco",
	UniNeue: "Uni Neue",
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
 * Handles aliases and weight modifiers
 */
export function resolveFontPath(fontFamily: string): string | undefined {
	// First try exact match (e.g., "Montserrat ExtraBold")
	if (FONT_PATHS[fontFamily]) {
		return FONT_PATHS[fontFamily];
	}
	// Fall back to base family name
	const { baseFontFamily } = parseFontFamily(fontFamily);
	const resolvedName = FONT_ALIASES[baseFontFamily] ?? baseFontFamily;
	return FONT_PATHS[resolvedName];
}
