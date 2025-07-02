# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- WYSIWYG text editing for text clips with double-click activation
- Real-time cursor positioning with support for all text alignments (left, center, right)
- Arrow key navigation for precise cursor movement

### Fixed

- Text cursor positioning accuracy for center and right-aligned text
- Cursor positioning at spaces and word boundaries
- Arrow key navigation updating visual cursor position

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
