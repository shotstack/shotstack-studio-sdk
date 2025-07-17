import { TimelineTheme } from '../timeline-theme.types';
import { convertThemeColors } from '../theme-utils';
import { LIGHT_THEME_INPUT } from './light.theme.input';

export const LIGHT_THEME: TimelineTheme = convertThemeColors(LIGHT_THEME_INPUT);