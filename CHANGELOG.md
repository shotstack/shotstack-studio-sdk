# Changelog

All notable changes to this project will be documented in this file.

## [1.1.2] - 2025-04-29

### Fixed

Corrected totalDuration calculation issue in `loadEdit()` method. Explicitly calls `updateTotalDuration()` after loading all clips to ensure accurate timeline duration and consistent playback behavior (#7).

### Changed

- Separated clip selection and state update events (#6):
  - `clip:select` event now triggers only on initial selection (pointer down).
  - Added new `clip:update` event triggered after state changes upon manipulation (pointer up), providing structured payload with previous and current clip states.

## [1.1.1] - 2025-04-22

### Fixed

- Fixed duplication issue in loadEdit() method where new template content appended instead of replacing existing content. All clips are now cleared before loading new content (#5).

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
