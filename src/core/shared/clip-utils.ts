import type { Clip } from "@schemas";

/**
 * Remove internal properties from a clip before exposing it in events.
 * The `id` property is internal to the SDK for reconciliation and should
 * never be exposed to consumers or backend APIs.
 */
export function stripInternalProperties(clip: Clip): Clip {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally stripping id
	const { id, ...publicClip } = clip as Clip & { id?: string };
	return publicClip;
}

/**
 * True when a numeric clip property holds something else — keyframes, or a merge
 * field placeholder that never resolved. Writing a scalar over either destroys it,
 * so every control that writes scalars must agree on this test.
 */
export function isKeyframedValue(value: unknown): boolean {
	return Boolean(value) && typeof value !== "number";
}

/**
 * True when any visual property is keyframed or bound.
 *
 * Studio previews such clips without effect and transition layers, so the player
 * and the toolbars must agree on the property list; keep this the only copy.
 * Preview-only: rendered output composes presets over keyframes instead.
 */
export function hasKeyframedVisualProperty(clip: Clip): boolean {
	return [
		clip.opacity,
		clip.scale,
		clip.offset?.x,
		clip.offset?.y,
		clip.transform?.rotate?.angle,
		clip.transform?.skew?.x,
		clip.transform?.skew?.y
	].some(isKeyframedValue);
}
