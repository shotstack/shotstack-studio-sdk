import { TimelineTheme } from './timeline-theme.types';
import { convertThemeColors } from './theme-utils';
import { DEFAULT_THEME_INPUT } from './timeline-theme.defaults.input';

// Default theme converted from hex colors for better developer experience
export const DEFAULT_THEME: TimelineTheme = convertThemeColors(DEFAULT_THEME_INPUT);