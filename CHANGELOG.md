# Changelog

All notable changes to this project will be documented in this file.

## [1.7.0] - 2025-11-04

### Added

- **Rich Text Asset Support ([#35](https://github.com/shotstack/shotstack-studio-sdk/pull/35))**
  - New `rich-text` asset type with RichTextPlayer
  - Custom font loading from URLs and local files

- **Clip Dimensions ([#36](https://github.com/shotstack/shotstack-studio-sdk/pull/36))**
  - Added optional `width` and `height` properties to clips (1-3840px, 1-2160px)

- **Schema Exports ([#38](https://github.com/shotstack/shotstack-studio-sdk/pull/38))**
  - All Zod validation schemas now exported for external package usage

### Changed

- Fit property now optional with smart defaults: `none` for rich-text, `crop` for other assets ([#36](https://github.com/shotstack/shotstack-studio-sdk/pull/36))
- Updated `@shotstack/shotstack-canvas` to v1.1.2

### Fixed

- Rewrote fit logic to match backend behavior ([#37](https://github.com/shotstack/shotstack-studio-sdk/pull/37)):
  - `cover`: non-uniform stretch to fill
  - `crop`: viewport-aware scaling, never downscales small images
  - `contain`: fit within bounds preserving aspect ratio
  - `none`: native dimensions
- Fixed animation sequence and tween properties integration

## [1.6.0] - 2025-09-02

### Changed

- **Replaced WASM-based FFmpeg with Mediabunny**
  - Switched from FFmpeg to WebCodecs-based Mediabunny
  - Export speeds improved by 10x

### Added

- Keyboard shortcut for export/download with Cmd/Ctrl + E

### Removed

- FFmpeg dependency

## [1.5.1] - 2025-08-29

### Fixed

- Image fit behaviour corrected ([#31]):
  - cover: apply non-uniform x/y scaling to fill the viewport (break aspect ratio)
  - crop: scale by dominant viewport axis (height for portrait viewports)
- Mask overflow outside the edit viewport using a rectangular stage mask to prevent content drawing beyond bounds

## [1.5.0] - 2025-07-27

### Added

- **Timeline Component**: A comprehensive visual timeline interface for editing video projects
  - Visual track and clip representation with drag-and-drop support
  - Clip resizing with edge detection and visual feedback
  - Playhead control for timeline navigation
  - Ruler with time markers and zoom support
  - Toolbar with playback controls, edit actions, and time display
  - Snap-to-grid functionality for precise clip alignment
  - Multi-track support with visual track management
  - Theme support with dark, light, and minimal themes
  - Selection system with visual feedback
  - Collision detection for clip placement
  - Viewport management with scroll and zoom controls
  - Real-time preview updates during clip manipulation

### Fixed

- Improved clip selection logic for better user interaction
- Fixed resize handles to always appear on top with full opacity

## [1.4.1] - 2025-07-06

### Fixed

- Fixed TypeScript declaration files not resolving path aliases in published npm package
- Replaced custom build process with vite-plugin-dts for standard declaration file generation

## [1.4.0] - 2025-07-06

### Changed

- **Major refactoring: Implemented command pattern architecture**
  - Reorganized project structure in anticipation of new UI modules
  - Extracted all edit operations into dedicated command classes

### Added

- **Complete undo/redo support for all editing operations**
  - Implemented undo functionality for all commands
  - Added keyboard shortcuts ctrl/cmd-z for undo ctrl/cmd-shift-z for redo

### Technical Improvements

- Enhanced TypeScript strict mode with `noImplicitAny` enabled
- Improved import path aliases for better code organization

## [1.3.0] - 2025-07-02

### Added

- WYSIWYG text editing for text clips with double-click activation
- Real-time cursor positioning with support for all text alignments (left, center, right)
- Arrow key navigation for precise cursor movement

## [1.2.2] - 2025-06-26

### Fixed

- Asset loader video handling now correctly targets only Safari browsers instead of all webkit-based browsers, resolving video loading issues in Chrome and other webkit browsers ([#18](https://github.com/shotstack/shotstack-studio-sdk/issues/18))

## [1.2.1] - 2025-06-05

### Fixed

Asset loader now sets required CORS attributes for Webkit video elements, preventing loading hangs ([#15](https://github.com/shotstack/shotstack-studio-sdk/issues/15)).

## [1.2.0] - 2025-05-26

### Added

- **Luma mask rendering compatibility with Shotstack Edit API ([#12](https://github.com/shotstack/shotstack-studio-sdk/issues/12))**
  - Luma masks in Studio now render with the same behaviour as the Shotstack Edit API.
  - White areas are transparent, black areas are opaque.
  - Ensures accurate previews of templates using video and image luma clips.

## [1.1.2] - 2025-04-29

### Fixed

Corrected totalDuration calculation issue in `loadEdit()` method. Explicitly calls `updateTotalDuration()` after loading all clips to ensure accurate timeline duration and consistent playback behavior ([#7](https://github.com/shotstack/shotstack-studio-sdk/issues/7)).

### Changed

- **Separated clip selection and state update events ([#6](https://github.com/shotstack/shotstack-studio-sdk/issues/6))**:
  - `clip:select` event now triggers only on initial selection (pointer down).
  - Added new `clip:updated` event triggered after state changes upon manipulation (pointer up), providing structured payload with previous and current clip states.

## [1.1.1] - 2025-04-22

### Fixed

- Fixed duplication issue in loadEdit() method where new template content appended instead of replacing existing content. All clips are now cleared before loading new content ([#5](https://github.com/shotstack/shotstack-studio-sdk/issues/5)).

## [1.1.0] - 2025-04-17

### Changed

- Moved FFmpeg to peer dependencies to reduce compatibility issues with frameworks such as Next.js
- Updated documentation to clarify FFmpeg installation requirements

## [1.0.0] - 2025-04-10

### Added

- Initial release of Shotstack Studio
- Core Edit class for managing video timelines and compositions
- Controls for keyboard-based playback and editing
- VideoExporter for exporting to MP4 using browser-based FFmpeg
- Support for images, videos, text, shapes, and audio clips
- Positioning and transformation system
- Keyframing system
- Preconfigured effects and transitions
- Template-based editing system with JSON format compatible with Shotstack Edit API
- Event system
- Asset loader
- Full TypeScript support with comprehensive type definitions
