/**
 * Export module with specialized processors
 */

// Export main coordinator as VideoExporter for backward compatibility
export { ExportCoordinator as VideoExporter } from "./export-coordinator";

// Export processors
export { VideoFrameProcessor } from "./video-frame-processor";
export { AudioProcessor } from "./audio-processor";

// Export utilities and errors
export { SimpleLRUCache, ExportError, BrowserCompatibilityError } from "./export-utils";

// Export UI component
export { ExportProgressUI } from "./export-progress-ui";

// Re-export type guards and interfaces
export { isVideoPlayer, type VideoPlayerExtended } from "./video-frame-processor";
