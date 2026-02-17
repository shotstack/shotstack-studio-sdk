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
