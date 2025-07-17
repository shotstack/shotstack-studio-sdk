// Input theme uses hex strings for developer convenience
export interface TimelineThemeInput {
  colors: {
    // Structural colors (the "canvas")
    structure: {
      background: string;      // Main timeline background
      surface: string;         // Track backgrounds  
      surfaceAlt: string;      // Alternating track backgrounds
      border: string;          // Primary borders
      divider: string;         // Subtle separators
      ruler: string;           // Ruler background
    };
    
    // Asset colors (the "content")
    assets: {
      video: string;
      audio: string;
      image: string;
      text: string;
      shape: string;
      html: string;
      luma: string;
      transition: string;
      default: string;         // Unknown asset types
    };
    
    // Interaction colors (the "feedback")
    interaction: {
      hover: string;
      selected: string;
      focus: string;
      dropZone: string;
      snapGuide: string;
      playhead: string;
      drag: string;            // Drag preview
      trackInsertion: string;  // Track insertion indicator
    };
    
    // Text and UI elements
    ui: {
      text: string;            // Primary text
      textMuted: string;       // Secondary text
      icon: string;            // Icons and markers
      iconMuted: string;       // Subtle icons
    };
  };
  
  // Optional dimension overrides
  dimensions?: {
    trackHeight?: number;
    rulerHeight?: number;
    clipRadius?: number;
    borderWidth?: number;
  };
  
  // Optional opacity overrides
  opacity?: {
    track?: number;
    hover?: number;
    drag?: number;
    disabled?: number;
  };
}

// Internal theme uses PIXI number format
export interface TimelineTheme {
  colors: {
    // Structural colors (the "canvas")
    structure: {
      background: number;      // Main timeline background
      surface: number;         // Track backgrounds  
      surfaceAlt: number;      // Alternating track backgrounds
      border: number;          // Primary borders
      divider: number;         // Subtle separators
      ruler: number;           // Ruler background
    };
    
    // Asset colors (the "content")
    assets: {
      video: number;
      audio: number;
      image: number;
      text: number;
      shape: number;
      html: number;
      luma: number;
      transition: number;
      default: number;         // Unknown asset types
    };
    
    // Interaction colors (the "feedback")
    interaction: {
      hover: number;
      selected: number;
      focus: number;
      dropZone: number;
      snapGuide: number;
      playhead: number;
      drag: number;            // Drag preview
      trackInsertion: number;  // Track insertion indicator
    };
    
    // Text and UI elements
    ui: {
      text: number;            // Primary text
      textMuted: number;       // Secondary text
      icon: number;            // Icons and markers
      iconMuted: number;       // Subtle icons
    };
  };
  
  // Optional dimension overrides
  dimensions?: {
    trackHeight?: number;
    rulerHeight?: number;
    clipRadius?: number;
    borderWidth?: number;
  };
  
  // Optional opacity overrides
  opacity?: {
    track?: number;
    hover?: number;
    drag?: number;
    disabled?: number;
  };
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface TimelineThemeOptions {
  preset?: 'dark' | 'light' | 'minimal';  // Optional preset
  theme?: DeepPartial<TimelineThemeInput>; // Optional overrides (using hex strings)
}