import { darkTheme } from "./dark.theme";
import { lightTheme } from "./light.theme";
import { minimalLightTheme } from "./minimal-light.theme";
import { professionalTheme } from "./professional.theme";

// Export all built-in themes for direct import if needed
export { darkTheme, darkThemeMetadata } from "./dark.theme";
export { lightTheme, lightThemeMetadata } from "./light.theme";
export { professionalTheme, professionalThemeMetadata } from "./professional.theme";
export { minimalLightTheme, minimalLightThemeMetadata } from "./minimal-light.theme";

// Built-in theme presets for easy access
export const TIMELINE_THEMES = {
	default: darkTheme,
	dark: darkTheme,
	light: lightTheme,
	professional: professionalTheme,
	"minimal-light": minimalLightTheme
} as const;
