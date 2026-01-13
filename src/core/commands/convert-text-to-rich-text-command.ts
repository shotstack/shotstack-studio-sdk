import { EditEvent } from "@core/events/edit-events";
import { parseFontFamily } from "@core/fonts/font-config";
import { calculateTimelineEnd, resolveEndLength } from "@core/timing/resolver";
import type { ResolvedClip, TextAsset, RichTextAsset } from "@schemas";

import type { CommandContext } from "./types";

/**
 * Type guard for TextAsset.
 * Proves to the compiler that an unknown asset is a TextAsset.
 */
function isTextAsset(asset: unknown): asset is TextAsset {
	return typeof asset === "object" && asset !== null && (asset as { type?: string }).type === "text";
}

/**
 * Convert a TextAsset to a RichTextAsset with equivalent styling.
 * Width/height are returned as clip updates to move them to clip.fit.
 * @param textAsset The text asset to convert
 */
function convertTextToRichText(textAsset: TextAsset): { richTextAsset: RichTextAsset; clipUpdates: Partial<ResolvedClip> } {
	// Extract weight from font family suffix (e.g., "Montserrat ExtraBold" → 800)
	// Keep original family name for RichTextPlayer to resolve via resolveFontPath()
	const fontFamily = textAsset.font?.family ?? "Open Sans";
	const { fontWeight } = parseFontFamily(fontFamily);

	const font: RichTextAsset["font"] = {
		family: fontFamily,
		size: textAsset.font?.size ?? 32,
		weight: textAsset.font?.weight ?? fontWeight,
		color: textAsset.font?.color ?? "#ffffff",
		opacity: textAsset.font?.opacity ?? 1
	};

	// Nest stroke inside font if present
	if (textAsset.stroke?.width && textAsset.stroke.width > 0) {
		font.stroke = {
			width: textAsset.stroke.width,
			color: textAsset.stroke.color ?? "#000000",
			opacity: 1
		};
	}

	// Build style object (lineHeight moves from font to style)
	const style: RichTextAsset["style"] = {
		letterSpacing: 0,
		lineHeight: textAsset.font?.lineHeight ?? 1.2,
		textTransform: "none",
		textDecoration: "none"
	};

	// Map alignment (rename object and map vertical value)
	// TextAsset uses "center" but RichTextAsset uses "middle" for vertical centering
	let verticalAlign: "top" | "middle" | "bottom" = "middle";
	if (textAsset.alignment?.vertical === "top") {
		verticalAlign = "top";
	} else if (textAsset.alignment?.vertical === "bottom") {
		verticalAlign = "bottom";
	}

	const align: RichTextAsset["align"] = {
		horizontal: textAsset.alignment?.horizontal ?? "center",
		vertical: verticalAlign
	};

	// Build the RichTextAsset
	const richTextAsset: RichTextAsset = {
		type: "rich-text",
		text: textAsset.text,
		font,
		style,
		align
	};

	// Map background (padding moves to top-level)
	if (textAsset.background) {
		richTextAsset.background = {
			color: textAsset.background.color,
			opacity: textAsset.background.opacity ?? 1,
			borderRadius: textAsset.background.borderRadius ?? 0
		};

		// Extract padding from background to top-level
		if (textAsset.background.padding) {
			richTextAsset.padding = textAsset.background.padding;
		}
	}

	// Map animation
	// TODO: speed is deprecated and should be removed once @shotstack/schemas is updated
	if (textAsset.animation) {
		richTextAsset.animation = {
			preset: textAsset.animation.preset,
			speed: 1,
			duration: textAsset.animation.duration
		};
	}

	// Move width/height to clip level (RichTextAsset doesn't have width/height on asset)
	const clipUpdates: Partial<ResolvedClip> = {};
	if (textAsset.width !== undefined) {
		clipUpdates.width = textAsset.width;
	}
	if (textAsset.height !== undefined) {
		clipUpdates.height = textAsset.height;
	}

	// Note: ellipsis is silently dropped (not supported in RichTextAsset)

	return { richTextAsset, clipUpdates };
}

/**
 * Execute text-to-rich-text conversion.
 * One-way transformation without undo support.
 */
export async function executeTextToRichTextConversion(trackIndex: number, clipIndex: number, context: CommandContext): Promise<void> {
	const player = context.getClipAt(trackIndex, clipIndex);
	if (!player?.clipConfiguration) {
		throw new Error("Cannot convert clip: invalid player");
	}

	const { asset } = player.clipConfiguration;
	if (!isTextAsset(asset)) {
		throw new Error("Cannot convert clip: asset is not a TextAsset");
	}

	// Capture original state (local variables, not class state)
	const originalConfig = { ...player.clipConfiguration };
	const originalIntent = player.getTimingIntent();
	const originalBindings = new Map(player.getMergeFieldBindings());

	// Convert TextAsset to RichTextAsset (asset is now narrowed to TextAsset)
	const { richTextAsset, clipUpdates } = convertTextToRichText(asset);

	// Build new clip configuration
	const newConfig: ResolvedClip = {
		...originalConfig,
		...clipUpdates,
		asset: richTextAsset as ResolvedClip["asset"]
	};

	// Create new player
	const newPlayer = context.createPlayerFromAssetType(newConfig);
	if (!newPlayer) {
		throw new Error("Failed to create RichTextPlayer");
	}
	newPlayer.layer = trackIndex + 1;

	// CRITICAL: Transfer timing intent IMMEDIATELY after creation
	// The new player was created from resolved config (numeric values),
	// so its timingIntent is wrong. We must restore the original intent.
	newPlayer.setTimingIntent(originalIntent);

	// Copy merge field bindings
	if (originalBindings.size > 0) {
		newPlayer.setInitialBindings(originalBindings);
	}

	// Replace in track array
	const track = context.getTrack(trackIndex);
	if (!track) throw new Error("Invalid track index");
	track[clipIndex] = newPlayer;

	// Replace in global clips array
	const clips = context.getClips();
	const globalIndex = clips.indexOf(player);
	if (globalIndex !== -1) {
		clips[globalIndex] = newPlayer;
	}

	// Add to PIXI container
	context.addPlayerToContainer(trackIndex, newPlayer);

	// Handle special length values and resolve timing
	if (originalIntent.length === "end") {
		context.untrackEndLengthClip(player);
		context.trackEndLengthClip(newPlayer);

		// CRITICAL: context.updateDuration() only calculates max duration -
		// it does NOT resolve end clip lengths. We must do it manually.
		const tracks = context.getTracks();
		const timelineEnd = calculateTimelineEnd(tracks);
		const resolved = newPlayer.getResolvedTiming();
		newPlayer.setResolvedTiming({
			start: resolved.start,
			length: resolveEndLength(resolved.start, timelineEnd)
		});
	} else if (originalIntent.length === "auto") {
		context.resolveClipAutoLength(newPlayer);
	}

	// Update total duration
	context.updateDuration();

	const exportableClip = newPlayer.getExportableClip();
	context.getDocument()?.replaceClip(trackIndex, clipIndex, exportableClip);

	// Configure keyframes with correct resolved timing
	newPlayer.reconfigureAfterRestore();

	// Load synchronously to prevent race condition:
	// If we don't await, update() can try to render before font is registered
	await newPlayer.load();
	newPlayer.draw();

	context.emitEvent(EditEvent.ClipUpdated, {
		previous: {
			trackIndex,
			clipIndex,
			clip: originalConfig
		},
		current: {
			trackIndex,
			clipIndex,
			clip: newConfig
		}
	});

	// Safe to dispose original player now
	context.queueDisposeClip(player);
}
