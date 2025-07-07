/**
 * Wrapper to switch between old and new timeline implementations
 * Set USE_NEW_TIMELINE to true to use the new architecture
 */

const USE_NEW_TIMELINE = false;

// Export the appropriate Timeline class based on the flag
export const Timeline = USE_NEW_TIMELINE ? require("../../timeline/TimelineBridge").TimelineBridge : require("./timeline").Timeline;
