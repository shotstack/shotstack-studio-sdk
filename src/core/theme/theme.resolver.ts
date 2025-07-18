import defaultThemeData from '../../themes/default.json';

import { convertThemeColors, convertThemeColorsGeneric } from './theme-utils';
import { TimelineTheme, TimelineThemeOptions, DeepPartial } from './theme.types';

// Default theme converted once at module load
const DEFAULT_THEME: TimelineTheme = convertThemeColors(defaultThemeData);

export class TimelineThemeResolver {

  public static resolveTheme(options?: TimelineThemeOptions): TimelineTheme {
    if (!options || !options.theme) {
      return this.deepClone(DEFAULT_THEME);
    }

    // Convert hex colors to PIXI numbers
    const convertedTheme = convertThemeColorsGeneric(options.theme) as DeepPartial<TimelineTheme>;
    
    // Start with default theme and merge with provided theme
    const baseTheme = this.deepClone(DEFAULT_THEME);
    const resolvedTheme = this.deepMerge(baseTheme, convertedTheme);

    return resolvedTheme;
  }

  public static validateTheme(theme: TimelineTheme): boolean {
    try {
      // Basic structure validation
      if (!theme.colors) return false;
      if (!theme.colors.structure) return false;
      if (!theme.colors.assets) return false;
      if (!theme.colors.interaction) return false;
      if (!theme.colors.ui) return false;

      // Validate required color properties
      const requiredStructureColors = ['background', 'surface', 'surfaceAlt', 'border', 'divider', 'ruler'];
      const requiredAssetColors = ['video', 'audio', 'image', 'text', 'shape', 'html', 'luma', 'transition', 'default'];
      const requiredInteractionColors = ['hover', 'selected', 'focus', 'dropZone', 'snapGuide', 'playhead', 'drag'];
      const requiredUIColors = ['text', 'textMuted', 'icon', 'iconMuted'];

      for (const color of requiredStructureColors) {
        if (typeof theme.colors.structure[color as keyof typeof theme.colors.structure] !== 'number') {
          return false;
        }
      }

      for (const color of requiredAssetColors) {
        if (typeof theme.colors.assets[color as keyof typeof theme.colors.assets] !== 'number') {
          return false;
        }
      }

      for (const color of requiredInteractionColors) {
        if (typeof theme.colors.interaction[color as keyof typeof theme.colors.interaction] !== 'number') {
          return false;
        }
      }

      for (const color of requiredUIColors) {
        if (typeof theme.colors.ui[color as keyof typeof theme.colors.ui] !== 'number') {
          return false;
        }
      }

      // Validate optional sections
      if (theme.dimensions) {
        const {dimensions} = theme;
        if (dimensions.trackHeight !== undefined && (typeof dimensions.trackHeight !== 'number' || dimensions.trackHeight <= 0)) {
          return false;
        }
        if (dimensions.rulerHeight !== undefined && (typeof dimensions.rulerHeight !== 'number' || dimensions.rulerHeight <= 0)) {
          return false;
        }
        if (dimensions.clipRadius !== undefined && (typeof dimensions.clipRadius !== 'number' || dimensions.clipRadius < 0)) {
          return false;
        }
        if (dimensions.borderWidth !== undefined && (typeof dimensions.borderWidth !== 'number' || dimensions.borderWidth < 0)) {
          return false;
        }
      }

      if (theme.opacity) {
        const {opacity} = theme;
        if (opacity.track !== undefined && (typeof opacity.track !== 'number' || opacity.track < 0 || opacity.track > 1)) {
          return false;
        }
        if (opacity.hover !== undefined && (typeof opacity.hover !== 'number' || opacity.hover < 0 || opacity.hover > 1)) {
          return false;
        }
        if (opacity.drag !== undefined && (typeof opacity.drag !== 'number' || opacity.drag < 0 || opacity.drag > 1)) {
          return false;
        }
        if (opacity.disabled !== undefined && (typeof opacity.disabled !== 'number' || opacity.disabled < 0 || opacity.disabled > 1)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Theme validation error:', error);
      return false;
    }
  }

  private static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }

    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }

  private static deepMerge<T>(target: T, source: DeepPartial<T>): T {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (sourceValue !== undefined) {
          if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue) &&
              typeof targetValue === 'object' && targetValue !== null && !Array.isArray(targetValue)) {
            result[key] = this.deepMerge(targetValue, sourceValue);
          } else {
            result[key] = sourceValue as T[Extract<keyof T, string>];
          }
        }
      }
    }

    return result;
  }
}