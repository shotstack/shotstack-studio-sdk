import { TimelineThemeInput } from '../timeline-theme.types';

export const DARK_THEME_INPUT: TimelineThemeInput = {
  colors: {
    structure: {
      background: '#0d0d0d',      // Darker background
      surface: '#1a1a1a',         // Darker surface
      surfaceAlt: '#161616',      // Darker alt surface
      border: '#2d2d2d',          // Softer borders
      divider: '#0a0a0a',         // Almost black dividers
      ruler: '#262626',           // Darker ruler
    },
    assets: {
      video: '#5c7cfa',           // Softer blue
      audio: '#51cf66',           // Softer green
      image: '#ff922b',           // Warmer orange
      text: '#ff6b6b',            // Softer red
      shape: '#cc5de8',           // Softer purple
      html: '#22b8cf',            // Cyan
      luma: '#94d82d',            // Lime green
      transition: '#748ffc',      // Indigo
      default: '#868e96',         // Gray
    },
    interaction: {
      hover: '#495057',           // Darker hover
      selected: '#339af0',        // Brighter blue selection
      focus: '#339af0',           // Same as selected
      dropZone: '#51cf66',        // Green drop zones
      snapGuide: '#5c7cfa',       // Blue snap guides
      playhead: '#ff6b6b',        // Red playhead
      drag: '#51cf66',            // Green drag
    },
    ui: {
      text: '#e9ecef',            // Slightly softer white
      textMuted: '#adb5bd',       // Muted gray
      icon: '#868e96',            // Gray icons
      iconMuted: '#495057',       // Darker muted icons
    },
  },
  dimensions: {
    trackHeight: 70,              // Slightly taller tracks
    rulerHeight: 40,
    clipRadius: 4,
    borderWidth: 2,
  },
  opacity: {
    track: 0.85,                  // Slightly more opaque
    hover: 0.75,
    drag: 0.65,
    disabled: 0.4,                // More contrast when disabled
  },
};