import { TimelineTheme } from '../timeline-theme.types';
import { convertThemeColors } from '../theme-utils';
import { DARK_THEME_INPUT } from './dark.theme.input';

export const DARK_THEME: TimelineTheme = convertThemeColors(DARK_THEME_INPUT);