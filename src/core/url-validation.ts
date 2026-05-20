import type { Clip, Track } from "@schemas";

/**
 * Thrown by mutation methods (addClip, addTrack, addFont, setFonts) when a
 * referenced asset/font URL fails preflight.
 */
export class InvalidAssetUrlError extends Error {
	readonly code = "INVALID_ASSET_URL" as const;
	readonly url: string;
	readonly status: number | undefined;
	readonly reason: string;

	constructor(url: string, status: number | undefined, reason: string) {
		super(`Asset URL ${url} failed validation: ${reason}`);
		this.name = "InvalidAssetUrlError";
		this.url = url;
		this.status = status;
		this.reason = reason;
	}
}

// ─── Extraction (schema-aware walkers) ───────────────────────────────────────

function pushIfHttp(urls: string[], seen: Set<string>, value: unknown): void {
	if (typeof value !== "string") return;
	if (!/^https?:\/\//i.test(value)) return;
	if (seen.has(value)) return;
	seen.add(value);
	urls.push(value);
}

function walkClipUrls(clip: Partial<Clip> | undefined, urls: string[], seen: Set<string>): void {
	if (!clip || typeof clip !== "object") return;
	const { asset } = clip as { asset?: { src?: unknown } };
	if (asset) pushIfHttp(urls, seen, asset.src);
}

export function extractClipUrls(clip: Partial<Clip>): string[] {
	const urls: string[] = [];
	const seen = new Set<string>();
	walkClipUrls(clip, urls, seen);
	return urls;
}

export function extractTrackUrls(track: Partial<Track>): string[] {
	const urls: string[] = [];
	const seen = new Set<string>();
	const { clips } = track as { clips?: Partial<Clip>[] };
	if (Array.isArray(clips)) {
		for (const clip of clips) walkClipUrls(clip, urls, seen);
	}
	return urls;
}
