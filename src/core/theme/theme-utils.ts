import { TimelineTheme, TimelineThemeInput } from './timeline-theme.types';

/**
 * Convert hex color string to PIXI number format
 * @param hex - Hex color string (e.g., '#ff0000' or 'ff0000')
 * @returns PIXI color number (e.g., 0xff0000)
 */
export function hexToPixiColor(hex: string): number {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  
  // Parse hex string to number
  const color = parseInt(cleanHex, 16);
  
  // Validate the result
  if (Number.isNaN(color)) {
    console.warn(`Invalid hex color: ${hex}, defaulting to black`);
    return 0x000000;
  }
  
  return color;
}

/**
 * Convert a TimelineThemeInput (with hex strings) to TimelineTheme (with PIXI numbers)
 */
export function convertThemeColors(themeInput: TimelineThemeInput): TimelineTheme {
  const convertColors = (obj: any): any => {
    if (typeof obj === 'string') {
      return hexToPixiColor(obj);
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const converted: any = Array.isArray(obj) ? [] : {};
      
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          converted[key] = convertColors(obj[key]);
        }
      }
      
      return converted;
    }
    
    return obj;
  };

  return convertColors(themeInput) as TimelineTheme;
}

/**
 * Convert any theme object with hex string colors to PIXI number colors (generic version)
 */
export function convertThemeColorsGeneric<T>(theme: T): T {
  if (typeof theme === 'string') {
    return hexToPixiColor(theme) as any;
  }
  
  if (typeof theme === 'object' && theme !== null) {
    const converted: any = Array.isArray(theme) ? [] : {};
    
    for (const key in theme) {
      if (Object.prototype.hasOwnProperty.call(theme, key)) {
        converted[key] = convertThemeColorsGeneric(theme[key]);
      }
    }
    
    return converted;
  }
  
  return theme;
}