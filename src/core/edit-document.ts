/**
 * EditDocument - Pure data layer for Shotstack Edit JSON
 *
 * This class owns the raw Edit configuration with "auto", "end", and merge
 * field placeholders preserved. It provides CRUD operations on the document
 * structure.
 *
 * The document is the source of truth that serializes to the Shotstack Edit API.
 *
 * Key distinction:
 * - Edit (this class) = raw user input with "auto", "end", {{ placeholders }}
 * - ResolvedEdit = concrete values (ms timing, substituted text)
 */

import type { Size } from "@layouts/geometry";

import type { Clip, Track, Edit, Soundtrack } from "./schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Internal clip type with stable ID for reconciliation */
type InternalClip = Clip & { id?: string };

/** Result from ID-based clip lookup */
export interface ClipLookupResult {
	clip: Clip;
	trackIndex: number;
	clipIndex: number;
}

export interface EditDocumentOptions {
	defaultSize?: Size;
}

// ─── EditDocument Class ───────────────────────────────────────────────────────

export class EditDocument {
	private data: Edit;

	constructor(edit: Edit) {
		this.data = structuredClone(edit);
		this.hydrateIds();
	}

	/**
	 * Hydrate clips with stable UUIDs for reconciliation.
	 * IDs are stripped on export via toJSON().
	 */
	private hydrateIds(): void {
		for (const track of this.data.timeline.tracks) {
			for (const clip of track.clips as InternalClip[]) {
				if (!clip.id) {
					clip.id = crypto.randomUUID();
				}
			}
		}
	}

	// ─── Timeline Accessors ───────────────────────────────────────────────────

	/**
	 * Get the raw timeline configuration
	 */
	getTimeline(): Edit["timeline"] {
		return this.data.timeline;
	}

	/**
	 * Get timeline background color
	 */
	getBackground(): string | undefined {
		return this.data.timeline.background;
	}

	/**
	 * Get all tracks
	 */
	getTracks(): Track[] {
		return this.data.timeline.tracks;
	}

	/**
	 * Get a specific track by index
	 */
	getTrack(index: number): Track | null {
		return this.data.timeline.tracks[index] ?? null;
	}

	/**
	 * Get total number of tracks
	 */
	getTrackCount(): number {
		return this.data.timeline.tracks.length;
	}

	/**
	 * Get soundtrack configuration
	 */
	getSoundtrack(): Soundtrack | undefined {
		return this.data.timeline.soundtrack;
	}

	// ─── Clip Accessors ───────────────────────────────────────────────────────

	/**
	 * Get a specific clip by track and clip index
	 */
	getClip(trackIndex: number, clipIndex: number): Clip | null {
		const track = this.data.timeline.tracks[trackIndex];
		if (!track) return null;
		return track.clips[clipIndex] ?? null;
	}

	/**
	 * Get all clips in a track
	 */
	getClipsInTrack(trackIndex: number): Clip[] {
		const track = this.data.timeline.tracks[trackIndex];
		return track?.clips ?? [];
	}

	/**
	 * Get total number of clips across all tracks
	 */
	getClipCount(): number {
		return this.data.timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0);
	}

	/**
	 * Get clip count in a specific track
	 */
	getClipCountInTrack(trackIndex: number): number {
		const track = this.data.timeline.tracks[trackIndex];
		return track?.clips.length ?? 0;
	}

	// ─── ID-Based Clip Accessors ─────────────────────────────────────────────

	/**
	 * Get a clip by its stable ID
	 */
	getClipById(clipId: string): ClipLookupResult | null {
		for (let t = 0; t < this.data.timeline.tracks.length; t += 1) {
			const clips = this.data.timeline.tracks[t].clips as InternalClip[];
			for (let c = 0; c < clips.length; c += 1) {
				if (clips[c].id === clipId) {
					return { clip: clips[c], trackIndex: t, clipIndex: c };
				}
			}
		}
		return null;
	}

	/**
	 * Update a clip by its stable ID (partial update)
	 */
	updateClipById(clipId: string, updates: Partial<Clip>): void {
		const found = this.getClipById(clipId);
		if (found) {
			Object.assign(found.clip, updates);
		}
	}

	/**
	 * Remove a clip by its stable ID
	 * @returns The removed clip, or null if not found
	 */
	removeClipById(clipId: string): Clip | null {
		const found = this.getClipById(clipId);
		if (found) {
			return this.removeClip(found.trackIndex, found.clipIndex);
		}
		return null;
	}

	/**
	 * Get the stable ID of a clip at a given position
	 */
	getClipId(trackIndex: number, clipIndex: number): string | null {
		const clip = this.getClip(trackIndex, clipIndex) as InternalClip | null;
		return clip?.id ?? null;
	}

	// ─── Output Accessors ─────────────────────────────────────────────────────

	/**
	 * Get the raw output configuration
	 */
	getOutput(): Edit["output"] {
		return this.data.output;
	}

	/**
	 * Get output size (width/height)
	 * @throws Error if size is not defined
	 */
	getSize(): Size {
		const { size } = this.data.output;
		if (!size?.width || !size?.height) {
			throw new Error("Output size is not defined");
		}
		return { width: size.width, height: size.height };
	}

	/**
	 * Get output format (mp4, gif, etc.)
	 */
	getFormat(): Edit["output"]["format"] {
		return this.data.output.format;
	}

	/**
	 * Get output FPS
	 */
	getFps(): number | undefined {
		return this.data.output.fps;
	}

	/**
	 * Get output resolution preset
	 */
	getResolution(): Edit["output"]["resolution"] {
		return this.data.output.resolution;
	}

	/**
	 * Get output aspect ratio
	 */
	getAspectRatio(): Edit["output"]["aspectRatio"] {
		return this.data.output.aspectRatio;
	}

	// ─── Merge Fields ─────────────────────────────────────────────────────────

	/**
	 * Get merge field definitions
	 */
	getMergeFields(): Edit["merge"] {
		return this.data.merge;
	}

	// ─── Track Mutations ──────────────────────────────────────────────────────

	/**
	 * Add a new track at the specified index
	 * @returns The added track
	 */
	addTrack(index: number, track?: Track): Track {
		const newTrack: Track = track ?? { clips: [] };
		this.data.timeline.tracks.splice(index, 0, newTrack);
		return newTrack;
	}

	/**
	 * Remove a track at the specified index
	 * @returns The removed track, or null if index invalid or would leave 0 tracks
	 */
	removeTrack(index: number): Track | null {
		if (index < 0 || index >= this.data.timeline.tracks.length) {
			return null;
		}
		if (this.data.timeline.tracks.length <= 1) {
			console.warn("Cannot remove the last track");
			return null;
		}
		const [removed] = this.data.timeline.tracks.splice(index, 1);
		return removed ?? null;
	}

	// ─── Clip Mutations ───────────────────────────────────────────────────────

	/**
	 * Add a clip to a track
	 * @returns The added clip (with hydrated ID)
	 */
	addClip(trackIndex: number, clip: Clip, clipIndex?: number): Clip {
		const track = this.data.timeline.tracks[trackIndex];
		if (!track) {
			throw new Error(`Track ${trackIndex} does not exist`);
		}

		// Hydrate with stable ID if not present
		const internalClip = clip as InternalClip;
		if (!internalClip.id) {
			internalClip.id = crypto.randomUUID();
		}

		const insertIndex = clipIndex ?? track.clips.length;
		track.clips.splice(insertIndex, 0, clip);
		return clip;
	}

	/**
	 * Remove a clip from a track
	 * @returns The removed clip, or null if indices invalid
	 */
	removeClip(trackIndex: number, clipIndex: number): Clip | null {
		const track = this.data.timeline.tracks[trackIndex];
		if (!track || clipIndex < 0 || clipIndex >= track.clips.length) {
			return null;
		}
		const [removed] = track.clips.splice(clipIndex, 1);
		return removed ?? null;
	}

	/**
	 * Update a clip's properties (partial update)
	 */
	updateClip(trackIndex: number, clipIndex: number, updates: Partial<Clip>): void {
		const clip = this.getClip(trackIndex, clipIndex);
		if (!clip) {
			throw new Error(`Clip at track ${trackIndex}, index ${clipIndex} does not exist`);
		}
		Object.assign(clip, updates);
	}

	/**
	 * Replace a clip entirely
	 */
	replaceClip(trackIndex: number, clipIndex: number, newClip: Clip): Clip | null {
		const track = this.data.timeline.tracks[trackIndex];
		if (!track || clipIndex < 0 || clipIndex >= track.clips.length) {
			return null;
		}
		const oldClip = track.clips[clipIndex];
		track.clips[clipIndex] = newClip;
		return oldClip;
	}

	// ─── Timeline Mutations ───────────────────────────────────────────────────

	/**
	 * Set timeline background color
	 */
	setBackground(color: string): void {
		this.data.timeline.background = color;
	}

	/**
	 * Set soundtrack
	 */
	setSoundtrack(soundtrack: Soundtrack | undefined): void {
		this.data.timeline.soundtrack = soundtrack;
	}

	// ─── Font Mutations ──────────────────────────────────────────────────────

	/**
	 * Get timeline fonts
	 */
	getFonts(): Array<{ src: string }> {
		return this.data.timeline.fonts ?? [];
	}

	/**
	 * Add a font to the timeline (if not already present)
	 */
	addFont(src: string): void {
		if (!this.data.timeline.fonts) {
			this.data.timeline.fonts = [];
		}
		if (!this.data.timeline.fonts.some(f => f.src === src)) {
			this.data.timeline.fonts.push({ src });
		}
	}

	/**
	 * Remove a font from the timeline
	 */
	removeFont(src: string): void {
		if (this.data.timeline.fonts) {
			this.data.timeline.fonts = this.data.timeline.fonts.filter(f => f.src !== src);
		}
	}

	/**
	 * Set all timeline fonts (replaces existing)
	 */
	setFonts(fonts: Array<{ src: string }>): void {
		this.data.timeline.fonts = fonts;
	}

	// ─── Output Mutations ─────────────────────────────────────────────────────

	/**
	 * Set output size
	 */
	setSize(size: Size): void {
		this.data.output.size = { width: size.width, height: size.height };
	}

	/**
	 * Set output format
	 */
	setFormat(format: Edit["output"]["format"]): void {
		this.data.output.format = format;
	}

	/**
	 * Set output FPS (must be a valid FPS value)
	 */
	setFps(fps: Edit["output"]["fps"]): void {
		this.data.output.fps = fps;
	}

	/**
	 * Set output resolution preset
	 */
	setResolution(resolution: Edit["output"]["resolution"]): void {
		this.data.output.resolution = resolution;
	}

	/**
	 * Clear output resolution preset
	 */
	clearResolution(): void {
		delete this.data.output.resolution;
	}

	/**
	 * Set output aspect ratio
	 */
	setAspectRatio(aspectRatio: Edit["output"]["aspectRatio"]): void {
		this.data.output.aspectRatio = aspectRatio;
	}

	/**
	 * Clear output aspect ratio
	 */
	clearAspectRatio(): void {
		delete this.data.output.aspectRatio;
	}

	/**
	 * Clear output size (for use when setting resolution/aspectRatio)
	 */
	clearSize(): void {
		delete this.data.output.size;
	}

	// ─── Merge Field Mutations ────────────────────────────────────────────────

	/**
	 * Set merge field definitions
	 */
	setMergeFields(mergeFields: Edit["merge"]): void {
		this.data.merge = mergeFields;
	}

	// ─── Serialization ────────────────────────────────────────────────────────

	/**
	 * Export the document as raw Edit JSON (preserves "auto", "end", placeholders)
	 * This is what gets sent to the backend API.
	 * Internal IDs are stripped - they are not part of the Shotstack API spec.
	 */
	toJSON(): Edit {
		const result = structuredClone(this.data);

		// Strip internal IDs from clips (not part of Shotstack API)
		for (const track of result.timeline.tracks) {
			for (const clip of track.clips) {
				delete (clip as InternalClip).id;
			}
		}

		if (result.merge?.length === 0) {
			delete result.merge;
		}
		return result;
	}

	/**
	 * Create an EditDocument from raw Edit JSON
	 */
	static fromJSON(json: Edit): EditDocument {
		return new EditDocument(json);
	}

	/**
	 * Create a deep clone of this document
	 */
	clone(): EditDocument {
		return new EditDocument(this.data);
	}
}
