/**
 * EditDocument - Pure data layer for Shotstack Edit JSON
 *
 * This class owns the raw Edit configuration with "auto", "end", and merge
 * field placeholders preserved. It provides CRUD operations on the document
 * structure.
 *
 * The document is the source of truth that serializes to the Shotstack Edit API.
 */

import type { Size } from "@layouts/geometry";

import type { Clip, Track, Edit, Soundtrack } from "./schemas";
import { setNestedValue } from "./shared/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type InternalClip = Clip & { id?: string };

export interface MergeFieldBinding {
	placeholder: string;
	resolvedValue: string;
}

export interface ClipLookupResult {
	clip: Clip;
	trackIndex: number;
	clipIndex: number;
}

// ─── EditDocument Class ───────────────────────────────────────────────────────

export class EditDocument {
	private data: Edit;

	/**
	 * Merge field bindings
	 */
	private clipBindings: Map<string, Map<string, MergeFieldBinding>> = new Map();

	constructor(edit: Edit) {
		this.data = structuredClone(edit);
		this.hydrateIds();
	}

	/**
	 * Hydrate clips
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

	/**
	 * Move a clip to a different track and/or position, preserving its ID.
	 * @returns The moved clip, or null if source clip not found
	 */
	moveClip(fromTrackIndex: number, fromClipIndex: number, toTrackIndex: number, updates?: Partial<Clip>): Clip | null {
		// Get the source track and clip
		const fromTrack = this.data.timeline.tracks[fromTrackIndex];
		if (!fromTrack || fromClipIndex < 0 || fromClipIndex >= fromTrack.clips.length) {
			return null;
		}

		// Get destination track (create if needed)
		const toTrack = this.data.timeline.tracks[toTrackIndex];
		if (!toTrack) {
			return null;
		}

		// Remove clip from source (preserves the clip object with its ID)
		const [clip] = fromTrack.clips.splice(fromClipIndex, 1);
		if (!clip) return null;

		// Apply updates (e.g., new start time)
		if (updates) {
			Object.assign(clip, updates);
		}

		// Find insertion point based on start time
		const clipStart = typeof clip.start === "number" ? clip.start : 0;
		let insertIndex = 0;
		for (let i = 0; i < toTrack.clips.length; i += 1) {
			const existingClipStart = toTrack.clips[i].start;
			const existingStart = typeof existingClipStart === "number" ? existingClipStart : 0;
			if (clipStart < existingStart) {
				break;
			}
			insertIndex += 1;
		}

		// Insert at the correct position
		toTrack.clips.splice(insertIndex, 0, clip);

		return clip;
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

	// ─── Clip Binding Management ─────────────────────────────────────────────

	/**
	 * Set a merge field binding for a clip property.
	 * @param clipId - The stable clip ID
	 * @param path - Property path (e.g., "asset.src")
	 * @param binding - The placeholder and resolved value
	 */
	setClipBinding(clipId: string, path: string, binding: MergeFieldBinding): void {
		let clipBindingsMap = this.clipBindings.get(clipId);
		if (!clipBindingsMap) {
			clipBindingsMap = new Map();
			this.clipBindings.set(clipId, clipBindingsMap);
		}
		clipBindingsMap.set(path, binding);
	}

	/**
	 * Get a merge field binding for a clip property.
	 * @param clipId - The stable clip ID
	 * @param path - Property path (e.g., "asset.src")
	 * @returns The binding, or undefined if not set
	 */
	getClipBinding(clipId: string, path: string): MergeFieldBinding | undefined {
		return this.clipBindings.get(clipId)?.get(path);
	}

	/**
	 * Remove a merge field binding for a clip property.
	 * @param clipId - The stable clip ID
	 * @param path - Property path (e.g., "asset.src")
	 */
	removeClipBinding(clipId: string, path: string): void {
		const clipBindingsMap = this.clipBindings.get(clipId);
		if (clipBindingsMap) {
			clipBindingsMap.delete(path);
			// Clean up empty maps
			if (clipBindingsMap.size === 0) {
				this.clipBindings.delete(clipId);
			}
		}
	}

	/**
	 * Get all bindings for a clip.
	 * @param clipId - The stable clip ID
	 * @returns Map of path → binding, or undefined if clip has no bindings
	 */
	getClipBindings(clipId: string): Map<string, MergeFieldBinding> | undefined {
		return this.clipBindings.get(clipId);
	}

	/**
	 * Set all bindings for a clip (replaces existing).
	 * @param clipId - The stable clip ID
	 * @param bindings - Map of path → binding
	 */
	setClipBindingsForClip(clipId: string, bindings: Map<string, MergeFieldBinding>): void {
		if (bindings.size === 0) {
			this.clipBindings.delete(clipId);
		} else {
			this.clipBindings.set(clipId, new Map(bindings));
		}
	}

	/**
	 * Clear all bindings for a clip.
	 * @param clipId - The stable clip ID
	 */
	clearClipBindings(clipId: string): void {
		this.clipBindings.delete(clipId);
	}

	/**
	 * Get all clip IDs that have bindings.
	 * @returns Array of clip IDs
	 */
	getClipIdsWithBindings(): string[] {
		return Array.from(this.clipBindings.keys());
	}

	// ─── Serialization ────────────────────────────────────────────────────────

	/**
	 * Export the document as raw Edit JSON (preserves "auto", "end", merge fields, aliases)
	 */
	toJSON(): Edit {
		const result = structuredClone(this.data);

		// Restore placeholders from document bindings before stripping IDs
		for (const track of result.timeline.tracks) {
			for (const clip of track.clips) {
				const clipId = (clip as InternalClip).id;
				if (clipId) {
					const bindings = this.clipBindings.get(clipId);
					if (bindings) {
						for (const [path, { placeholder }] of bindings) {
							setNestedValue(clip, path, placeholder);
						}
					}
				}
				// Strip internal ID (not part of Shotstack API)
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
