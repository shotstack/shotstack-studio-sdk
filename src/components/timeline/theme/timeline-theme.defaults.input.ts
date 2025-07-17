import { TimelineThemeInput } from './timeline-theme.types';

export const DEFAULT_THEME_INPUT: TimelineThemeInput = {
  colors: {
    structure: {
      background: '#1a1a1a',
      surface: '#2a2a2a',
      surfaceAlt: '#242424',
      border: '#3a3a3a',
      divider: '#1a1a1a',
      ruler: '#404040',
    },
    assets: {
      video: '#4a90e2',
      audio: '#7ed321',
      image: '#f5a623',
      text: '#d0021b',
      shape: '#9013fe',
      html: '#50e3c2',
      luma: '#b8e986',
      transition: '#8e8e93',
      default: '#8e8e93',
    },
    interaction: {
      hover: '#666666',
      selected: '#007acc',
      focus: '#007acc',
      dropZone: '#00ff00',
      snapGuide: '#888888',
      playhead: '#ff4444',
      drag: '#00ff00',
      trackInsertion: '#00ff00',  // Same as dropZone for consistency
    },
    ui: {
      text: '#ffffff',
      textMuted: '#cccccc',
      icon: '#888888',
      iconMuted: '#666666',
    },
    toolbar: {
      background: '#1a1a1a',
      surface: '#2a2a2a',
      hover: '#3a3a3a',
      active: '#007acc',
      divider: '#3a3a3a',
    },
  },
  dimensions: {
    toolbarHeight: 36,
    trackHeight: 60,
    rulerHeight: 40,
    clipRadius: 4,
    borderWidth: 2,
  },
  opacity: {
    track: 0.8,
    hover: 0.7,
    drag: 0.6,
    disabled: 0.5,
  },
};