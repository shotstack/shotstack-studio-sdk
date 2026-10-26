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
