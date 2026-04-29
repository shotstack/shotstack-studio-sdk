/**
 * Clip JSON parse + serialise for OS-clipboard interop.
 */

import { ClipSchema, TrackSchema, type Clip, type Track } from "@schemas";

function tryJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * Light-touch JSON recovery for common copy mistakes.
 */
export function tryParseJsonFlexible(text: string): unknown {
	const trimmed = text.trim();
	if (!trimmed) return null;

	const direct = tryJson(trimmed);
	if (direct !== null) return direct;

	const stripped = trimmed.replace(/^,+\s*/, "").replace(/\s*,+$/, "");
	if (stripped !== trimmed && stripped.length > 0) {
		const strippedDirect = tryJson(stripped);
		if (strippedDirect !== null) return strippedDirect;
	}

	if (stripped.length > 0) {
		const wrapped = tryJson(`[${stripped}]`);
		if (wrapped !== null) return wrapped;
	}

	return null;
}

function parseObjectJson(text: string): Record<string, unknown> | null {
	const parsed = tryParseJsonFlexible(text);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
	return parsed as Record<string, unknown>;
}

/**
 * Try to parse text as a Clip JSON. Returns null on parse error or schema
 * validation failure. Pure — no side effects.
 */
export function tryParseClipJson(text: string): Clip | null {
	const obj = parseObjectJson(text);
	if (!obj) return null;
	const result = ClipSchema.safeParse(obj);
	return result.success ? (result.data as Clip) : null;
}

/**
 * Try to parse text as one or more Track JSONs.
 */
export function tryParseTracksJson(text: string): Track[] | null {
	const parsed = tryParseJsonFlexible(text);
	if (parsed === null) return null;

	const candidates = Array.isArray(parsed) ? parsed : [parsed];
	if (candidates.length === 0) return null;

	const tracks: Track[] = [];
	for (const item of candidates) {
		const result = TrackSchema.safeParse(item);
		if (!result.success) return null;
		tracks.push(result.data as Track);
	}

	return tracks;
}

/**
 * Serialise a clip for the OS clipboard.
 */
export function clipToJsonString(clip: Clip): string {
	const exportable = structuredClone(clip);
	delete (exportable as { id?: string }).id;
	return JSON.stringify(exportable, null, 2);
}
