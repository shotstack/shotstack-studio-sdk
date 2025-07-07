/**
 * Wrapper to switch between old and new timeline implementations
 * Set USE_NEW_TIMELINE to true to use the new architecture
 */

import { TimelineBridge } from "../../timeline/TimelineBridge";

import { Timeline as OldTimeline } from "./timeline";

const USE_NEW_TIMELINE = false;

// Export the appropriate Timeline class based on the flag
export const Timeline = USE_NEW_TIMELINE ? TimelineBridge : OldTimeline;
