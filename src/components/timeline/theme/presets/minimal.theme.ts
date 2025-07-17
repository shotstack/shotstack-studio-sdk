import { TimelineTheme } from '../timeline-theme.types';
import { convertThemeColors } from '../theme-utils';
import { MINIMAL_THEME_INPUT } from './minimal.theme.input';

export const MINIMAL_THEME: TimelineTheme = convertThemeColors(MINIMAL_THEME_INPUT);