# Changelog

All notable changes to this project will be documented in this file.

## [2.1.2] - 2026-03-06

### Fixed

- Fix audio bleed when switching media sources via `loadEdit()` — AudioPlayer now properly reloads on source change
- Fix audio/video player disposal to stop playback immediately and clean up PIXI containers

## [2.1.1] - 2026-03-05

### Fixed

- Recalculate total timeline duration after granular `loadEdit()` updates so the toolbar displays the correct time

## [2.1.0] - 2026-03-04

### Added

- Canvas panning with middle mouse button drag, including grab cursor feedback
- Timeline resize handle for adjustable timeline height

### Fixed

- Set initial volume for audio and video players to avoid undefined default values
- Resolve merge fields as strings for `text` and `src` keys

## [2.0.4] - 2026-03-04

### Added

- Externalize `@napi-rs/canvas` in Vite/Rollup build configs to prevent bundling of native Node addons

## [2.0.2] - 2026-03-04

### Fixed

- Prevent deletion of the last clip in a document.

## [2.0.1] - 2026-02-24

### Fixed

- Fixed toolbar positioning when SDK is embedded in a page with surrounding content. Toolbars now use `position: absolute` within the canvas container instead of `position: fixed` relative to the viewport.

## [2.0.0] - 2026-02-17

### Added

**Timeline**

- **HTML/CSS timeline rebuild** - Replaced the 1.x timeline with a fully rewritten HTML/CSS implementation
  - Asset type icons with variable track heights based on content type
  - Playhead ghost hover preview
  - Home/End key navigation (replaces meta+arrow keys)
- **Copy-paste** - Duplicate clips on the timeline using standard keyboard shortcuts
- **Collision detection** - Automatic clip pushing during drag operations to prevent overlapping
- **Thumbnail rendering** - Video and image thumbnails displayed directly on timeline clips
- **Soundtrack support** - Integrated audio player for soundtrack assets on the timeline
- **Graceful error handling** - Visual error indicators on clips that fail to load
- **Seconds-based timing** - Unified all time values to a branded `Seconds` type throughout the timeline

**UI Toolbars**

- **Rich text toolbar** - Full formatting toolbar with font picker, text shadow, padding, background color, animation presets, and strikethrough
- **Media toolbar** - Editing controls for video and image clips including audio, fade effects, zoom/slide transitions, and effects
- **SVG toolbar** - Fill color, corner radius, and clip-level controls (opacity, scale, transition, effect)
- **Canvas toolbar** - Resolution, FPS, and background color controls in a vertical layout on the right edge
- **Asset toolbar** - Quick text and media insertion controls on the canvas
- **Text-to-Speech toolbar** - Voice selection and audio generation controls
- **Text-to-image toolbar** - Prompt editing and AI image generation controls
- **Draggable toolbars** - All toolbars support drag repositioning with reset capability
- **Extensible toolbar buttons** - Registry system for adding custom toolbar buttons

**AI-Powered Assets**

- **AI asset players** - Aurora loading animations for text-to-image and text-to-speech assets during generation
- **AI asset overlays** - Asset number badges and prompt preview overlays on AI-generated content

**Merge Fields**

- **Merge field system** - Template variable substitution across Edit properties
  - Redesigned merge field popup with scroll architecture

**Font System**

- **Font Picker** - Virtual scrolling font selector with recent fonts tracking
- **Font color picker** - Color and highlight controls with gradient presets
- **Font weight selector** - Dropdown with full weight range, replacing the simple bold toggle
- **OpenType integration** - Font family name extraction using `opentype.js` for accurate metadata
- **CDN font hosting** - Migrated default font assets to CDN with expanded weight and style variants

**Rotation, Resize & Alignment**

- **Rotation** - Full rotation support for canvas objects with snapping to fixed angles
- **8-point resize handles** - Corner and edge resize with proper dimension handling for SVG and rich text assets
- **Alignment guides** - Drag snapping to alignment guides integrated into the canvas
- **Dimension labels** - Live dimension display during resize operations
- **Drag time tooltips** - Time position display during clip drag and resize on the timeline

**Luma Mask**

- **Luma mask system** - Attach luma masks to clips using Alt+drag with automatic asset type transformation

**Output & Resolution**

- **Output configuration commands** - Commands for setting format, resolution, aspect ratio, and destinations
- **Resolution presets** - Predefined resolution options with rollback handling
- **Multi-provider destinations** - Output schema supports multiple render destinations

**Canvas & Rendering**

- **Responsive canvas zoom** - Automatic zoom scaling to fit the container
- **Alpha channel support** - Correct rendering for WebM VP9 transparent videos

**Clip Management**

- **Clip reconciliation** - Unidirectional data flow with unified resolution for predictable clip tracking across undo/redo
- **Clip timing controls** - Asset/clip mode toggle for timing configuration
- **Smart loadEdit** - Structural diffing with unified event dispatch when reloading an edit
- **Drag-to-create track** - Drop zone indicators for creating new tracks during clip drag
- **Alias resolution** - Clip reference system using aliases
- **Caption rendering** - Subtitle player with VTT/SRT parser for caption assets

**Keyframes & Animations**

- **Layered animation composition** - Effects and transitions composed as independent animation layers
- **Skew transform** - New skew property for clip transforms with animation builder support
- **Smooth easing** - New easing curve for improved carousel and slide transitions

**SDK Architecture**

- **EditDocument** - Pure data layer for edit configuration management, separating data from rendering
- **Composite UI components** - Reusable panels for effects, transitions, spacing, and style controls
- **SVG asset support** - Full SVG asset rendering, editing, and shared SVG utilities
- **Keyboard arrow positioning** - Arrow keys move selected clips on the canvas

### Changed

- Migrated to `@shotstack/schemas` as canonical type source
- Upgraded `@shotstack/shotstack-canvas` from ^1.6.5 to ^1.9.6
- Upgraded `pixi.js` from ^8.5.2 to ^8.15.0
- Upgraded `zod` from ^3.23.8 to ^4.0.0
- Requires Node.js 22 (previously unconstrained)
- Timeline API simplified — feature toggles and constructor options removed
- Default preview framerate updated to 25fps
- Switched to light theme as default

### Fixed

- Corrected playback time unit conversions across all player types
- Fixed memory leaks from event listener accumulation and recursive handlers
- Resolved race conditions in render updates during clip selection changes
- Fixed audio stuttering caused by excessive video sync checks (now rate-limited)
- Added cache invalidation for clip and track mutations
- Corrected track layer calculation and z-index sorting for multi-track compositions
- Performance and rendering improvements
- Fixed crop scaling logic to use max ratio consistently
- Deferred audio volume keyframe initialization until timing is resolved
- Fixed left-edge clip resize to correctly adjust start position and duration
- Added track existence validation before clip reorder on same-track moves
- Corrected carousel offset calculation logic
- Normalized z-index hierarchy across UI layers
- Improved `.mov` video error messaging
- Included opacity in clip keyframe detection
- Prevented toolbar container duplication on remount
- Fixed SVG icons intercepting pointer events on toolbar buttons
- Fixed clip mask offset to account for centered border strokes

### Removed

- `./schema` package export — schemas now provided by the `@shotstack/schemas` package
- `TimelineOptions` — Timeline constructor options removed in favour of simplified API
- `fast-deep-equal` dependency — replaced by internal structural diffing
- Schema build configuration (`vite.config.schema.ts`)
- Internal UI component exports from the public API surface
- `.webm` browser support check

## [1.10.1] - 2025-11-27

### Changed

- Moved `width`, `height`, and `customFonts` out of `RichTextAssetSchema` - dimensions now resolved from clip config, custom fonts computed at runtime ([#46](https://github.com/shotstack/shotstack-studio-sdk/pull/46))
- Updated `@shotstack/shotstack-canvas` to v1.5.3

## [1.10.0] - 2025-11-26

### Added

- **Audio fade effects** - Added `effect` property to audio assets supporting `fadeIn`, `fadeOut`, and `fadeInFadeOut` with 2-second fade duration
- **updateClip command** ([#44](https://github.com/shotstack/shotstack-studio-sdk/pull/44), [#34](https://github.com/shotstack/shotstack-studio-sdk/issues/34))
  - New command to update clip properties programmatically
  - Dynamic background color updates
- **Rich text padding and border support** ([#45](https://github.com/shotstack/shotstack-studio-sdk/pull/45))
  - Added `padding` property to rich-text assets
  - Added `background.border` property (width, color, opacity) to rich-text assets
- **Merge fields support** for template variable substitution
- **Smart-clip timing values** with support for `"auto"` and `"end"` values with resolution logic
- Emits `timeline:updated` event when edit is reloaded
- Exported `VERSION` constant from package.json

### Changed

- Added strict validation to all Zod schemas
- Rich text player implements `reconfigureAfterRestore` to clear cache and re-render

### Fixed

- Reset render state on seek to prevent race conditions
- Stored bound event handlers to fix listener cleanup

## [1.9.0] - 2025-11-22

### Changed

- Updated `@shotstack/shotstack-canvas` to v1.4.7
- Removed `style` property from font configurations ([#43](https://github.com/shotstack/shotstack-studio-sdk/pull/43))
  - Font style variants should now be loaded as separate font families

### Added

- Support for `background.border` property (width, color, opacity)
- Support for `padding` property (uniform or per-side values)

## [1.8.1] - 2025-11-18

### Fixed

- Fixed module resolution issues in Next.js and other bundlers ([#11](https://github.com/shotstack/shotstack-studio-sdk/issues/11), [#42](https://github.com/shotstack/shotstack-studio-sdk/pull/42))
  - Added `inlineDynamicImports: true` to Vite build configuration to prevent chunk file generation
  - Resolved "Cannot find module" errors when importing the SDK in Next.js applications
  - All code is now properly inlined into single ES and UMD bundle files

### Changed

- Updated `@shotstack/shotstack-canvas` to v1.3.0
- Improved development tooling:
  - Added `typecheck` script for TypeScript validation
  - Added `test:package` script to validate build output before publishing

## [1.8.0] - 2025-11-10

### Changed

- Updated `@shotstack/shotstack-canvas` to v1.1.7
- Improved package exports with explicit TypeScript types and better module format support
- Updated schema build to output `.mjs` and `.cjs` files for better compatibility

## [1.7.1] - 2025-11-06

### Added

- Test cases for Jest builds ([#39](https://github.com/shotstack/shotstack-studio-sdk/pull/39))
- Schema exports for Jest compatibility

### Changed

- Removed makefile build commands in favour of package.json scripts

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
