import { TimelineThemeInput } from '../timeline-theme.types';

export const LIGHT_THEME_INPUT: TimelineThemeInput = {
  colors: {
    structure: {
      background: '#ffffff',
      surface: '#f5f5f5',
      surfaceAlt: '#f0f0f0',
      border: '#e0e0e0',
      divider: '#d0d0d0',
      ruler: '#e8e8e8',
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
      hover: '#dddddd',
      selected: '#007acc',
      focus: '#007acc',
      dropZone: '#00aa00',
      snapGuide: '#cccccc',
      playhead: '#ff4444',
      drag: '#00aa00',
    },
    ui: {
      text: '#333333',
      textMuted: '#666666',
      icon: '#999999',
      iconMuted: '#cccccc',
    },
  },
  dimensions: {
    trackHeight: 80,
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