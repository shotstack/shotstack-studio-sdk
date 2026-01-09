/**
 * Single mutation path for timing changes.
 *
 * @internal
 */

import { __DEV__, assertTimingConsistency } from "@core/debug/state-assertions";
import { resolveTimingIntent } from "@core/timing/resolver";
import type { Seconds, TimingIntent } from "@core/timing/types";

import type { CommandContext } from "../types";

/**
 * Options for committing a timing change.
 */
export interface CommitTimingOptions {
	/** Skip the "end" length tracking update (for special cases like split) */
	skipEndTracking?: boolean;
	/** Skip reconfigure after applying timing (caller will do it) */
	skipReconfigure?: boolean;
}

/**
 * Commit a timing change through the single mutation path.
 *
 * This function:
 * 1. Updates intent in document (source of truth)
 * 2. Updates intent on player
 * 3. Builds resolution context (extracts all dependencies)
 * 4. Resolves timing using pure function
 * 5. Applies resolved timing to player
 * 6. Asserts invariant (dev builds only)
 *
 * @param ctx - Command context
 * @param trackIdx - Track index
 * @param clipIdx - Clip index
 * @param intentUpdates - Partial intent updates (start and/or length)
 * @param options - Optional configuration
 * @returns The resolved timing values
 */
export function commitTimingChange(
	ctx: CommandContext,
	trackIdx: number,
	clipIdx: number,
	intentUpdates: Partial<TimingIntent>,
	options: CommitTimingOptions = {}
): { start: Seconds; length: Seconds } {
	const player = ctx.getClipAt(trackIdx, clipIdx);
	if (!player) {
		throw new Error(`commitTimingChange: No player at ${trackIdx}/${clipIdx}`);
	}

	// 1. Update document (source of truth)
	// Convert timing intent to document format
	const documentUpdates: Record<string, unknown> = {};
	if (intentUpdates.start !== undefined) {
		documentUpdates["start"] = intentUpdates.start;
	}
	if (intentUpdates.length !== undefined) {
		documentUpdates["length"] = intentUpdates.length;
	}
	if (Object.keys(documentUpdates).length > 0) {
		ctx.documentUpdateClip(trackIdx, clipIdx, documentUpdates);
		// Sync document back to player's clipConfiguration (excludes asset to preserve resolved merge fields)
		ctx.derivePlayerFromDocument(trackIdx, clipIdx);
	}

	// 2. Update timing intent on player
	const currentIntent = player.getTimingIntent();
	const newIntent: TimingIntent = {
		start: intentUpdates.start ?? currentIntent.start,
		length: intentUpdates.length ?? currentIntent.length
	};
	player.setTimingIntent(newIntent);

	// 3. Handle "end" length tracking
	if (!options.skipEndTracking) {
		const wasEnd = currentIntent.length === "end";
		const isEnd = newIntent.length === "end";
		if (isEnd) {
			ctx.trackEndLengthClip(player);
		} else if (wasEnd && !isEnd) {
			ctx.untrackEndLengthClip(player);
		}
	}

	// 4. Build resolution context (extracts all dependencies upfront)
	const resolutionContext = ctx.buildResolutionContext(trackIdx, clipIdx);

	// 5. Resolve timing using pure function
	const resolved = resolveTimingIntent(newIntent, resolutionContext);

	// 6. Apply resolved timing to player
	player.setResolvedTiming(resolved);

	// 7. Reconfigure player (unless skipped)
	if (!options.skipReconfigure) {
		player.reconfigureAfterRestore();
	}

	// 8. Assert invariant (dev builds only)
	if (__DEV__) {
		assertTimingConsistency(newIntent, resolved, resolutionContext);
	}

	return resolved;
}

/**
 * Resolve timing for a clip without modifying anything.
 * Useful for preview/calculation purposes.
 *
 * @param ctx - Command context
 * @param trackIdx - Track index
 * @param clipIdx - Clip index
 * @returns The resolved timing values
 */
export function resolveClipTiming(ctx: CommandContext, trackIdx: number, clipIdx: number): { start: Seconds; length: Seconds } {
	const player = ctx.getClipAt(trackIdx, clipIdx);
	if (!player) {
		throw new Error(`resolveClipTiming: No player at ${trackIdx}/${clipIdx}`);
	}

	const intent = player.getTimingIntent();
	const context = ctx.buildResolutionContext(trackIdx, clipIdx);
	return resolveTimingIntent(intent, context);
}
