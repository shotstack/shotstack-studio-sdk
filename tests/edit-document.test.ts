/**
 * EditDocument Unit Tests
 *
 * Tests for the pure data layer. These tests run WITHOUT any pixi.js mocks
 * or canvas/DOM setup - EditDocument is pure data manipulation.
 */

import { EditDocument } from "@core/edit-document";
import type { Edit } from "@core/schemas/edit";
import type { Clip } from "@core/schemas";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createMinimalEdit(): Edit {
	return {
		timeline: {
			tracks: []
		},
		output: {
			size: { width: 1920, height: 1080 },
			format: "mp4"
		}
	};
}

function createEditWithTracks(): Edit {
	return {
		timeline: {
			background: "#000000",
			tracks: [
				{
					clips: [
						{
							asset: { type: "image", src: "https://example.com/image1.jpg" },
							start: 0,
							length: 5,
							fit: "crop"
						},
						{
							asset: { type: "image", src: "https://example.com/image2.jpg" },
							start: "auto",
							length: 3,
							fit: "crop"
						}
					]
				},
				{
					clips: [
						{
							asset: { type: "video", src: "https://example.com/video.mp4" },
							start: 0,
							length: "end",
							fit: "crop"
						}
					]
				}
			]
		},
		output: {
			size: { width: 1280, height: 720 },
			format: "mp4",
			fps: 30
		},
		merge: [{ find: "TITLE", replace: "Hello World" }]
	};
}

function createImageClip(src: string, start: number | "auto", length: number | "auto" | "end"): Clip {
	return {
		asset: { type: "image", src },
		start,
		length,
		fit: "crop"
	};
}

// ─── Constructor Tests ────────────────────────────────────────────────────────

describe("EditDocument", () => {
	describe("constructor", () => {
		it("creates document from minimal edit", () => {
			const edit = createMinimalEdit();
			const doc = new EditDocument(edit);

			expect(doc.getTrackCount()).toBe(0);
			expect(doc.getSize()).toEqual({ width: 1920, height: 1080 });
		});

		it("creates document from edit with tracks", () => {
			const edit = createEditWithTracks();
			const doc = new EditDocument(edit);

			expect(doc.getTrackCount()).toBe(2);
			expect(doc.getClipCount()).toBe(3);
		});

		it("deep clones input to prevent external mutation", () => {
			const edit = createEditWithTracks();
			const doc = new EditDocument(edit);

			// Mutate original
			edit.timeline.tracks[0].clips[0].start = 999;

			// Document should be unaffected
			const clip = doc.getClip(0, 0);
			expect(clip?.start).toBe(0);
		});
	});

	// ─── Timeline Accessor Tests ──────────────────────────────────────────────

	describe("timeline accessors", () => {
		it("getTimeline returns timeline config", () => {
			const doc = new EditDocument(createEditWithTracks());
			const timeline = doc.getTimeline();

			expect(timeline.background).toBe("#000000");
			expect(timeline.tracks.length).toBe(2);
		});

		it("getBackground returns background color", () => {
			const doc = new EditDocument(createEditWithTracks());
			expect(doc.getBackground()).toBe("#000000");
		});

		it("getBackground returns undefined when not set", () => {
			const doc = new EditDocument(createMinimalEdit());
			expect(doc.getBackground()).toBeUndefined();
		});

		it("getSoundtrack returns undefined when not set", () => {
			const doc = new EditDocument(createMinimalEdit());
			expect(doc.getSoundtrack()).toBeUndefined();
		});
	});

	// ─── Track Accessor Tests ─────────────────────────────────────────────────

	describe("track accessors", () => {
		it("getTracks returns all tracks", () => {
			const doc = new EditDocument(createEditWithTracks());
			const tracks = doc.getTracks();

			expect(tracks.length).toBe(2);
			expect(tracks[0].clips.length).toBe(2);
			expect(tracks[1].clips.length).toBe(1);
		});

		it("getTrack returns track at index", () => {
			const doc = new EditDocument(createEditWithTracks());

			const track0 = doc.getTrack(0);
			expect(track0?.clips.length).toBe(2);

			const track1 = doc.getTrack(1);
			expect(track1?.clips.length).toBe(1);
		});

		it("getTrack returns null for invalid index", () => {
			const doc = new EditDocument(createEditWithTracks());

			expect(doc.getTrack(-1)).toBeNull();
			expect(doc.getTrack(99)).toBeNull();
		});

		it("getTrackCount returns number of tracks", () => {
			const doc = new EditDocument(createEditWithTracks());
			expect(doc.getTrackCount()).toBe(2);
		});

		it("getTrackCount returns 0 for empty timeline", () => {
			const doc = new EditDocument(createMinimalEdit());
			expect(doc.getTrackCount()).toBe(0);
		});
	});

	// ─── Clip Accessor Tests ──────────────────────────────────────────────────

	describe("clip accessors", () => {
		it("getClip returns clip at indices", () => {
			const doc = new EditDocument(createEditWithTracks());

			const clip = doc.getClip(0, 0);
			expect(clip?.start).toBe(0);
			expect(clip?.length).toBe(5);
		});

		it("getClip returns null for invalid track index", () => {
			const doc = new EditDocument(createEditWithTracks());
			expect(doc.getClip(99, 0)).toBeNull();
		});

		it("getClip returns null for invalid clip index", () => {
			const doc = new EditDocument(createEditWithTracks());
			expect(doc.getClip(0, 99)).toBeNull();
		});

		it("getClipsInTrack returns all clips in track", () => {
			const doc = new EditDocument(createEditWithTracks());

			const clips = doc.getClipsInTrack(0);
			expect(clips.length).toBe(2);
		});

		it("getClipsInTrack returns empty array for invalid track", () => {
			const doc = new EditDocument(createEditWithTracks());
			expect(doc.getClipsInTrack(99)).toEqual([]);
		});

		it("getClipCount returns total clips across all tracks", () => {
			const doc = new EditDocument(createEditWithTracks());
			expect(doc.getClipCount()).toBe(3);
		});

		it("getClipCountInTrack returns clips in specific track", () => {
			const doc = new EditDocument(createEditWithTracks());

			expect(doc.getClipCountInTrack(0)).toBe(2);
			expect(doc.getClipCountInTrack(1)).toBe(1);
			expect(doc.getClipCountInTrack(99)).toBe(0);
		});
	});

	// ─── Preserves "auto" and "end" Values ────────────────────────────────────

	describe("preserves timing intent", () => {
		it("preserves 'auto' start value", () => {
			const doc = new EditDocument(createEditWithTracks());
			const clip = doc.getClip(0, 1);

			expect(clip?.start).toBe("auto");
		});

		it("preserves 'end' length value", () => {
			const doc = new EditDocument(createEditWithTracks());
			const clip = doc.getClip(1, 0);

			expect(clip?.length).toBe("end");
		});

		it("preserves numeric timing values", () => {
			const doc = new EditDocument(createEditWithTracks());
			const clip = doc.getClip(0, 0);

			expect(clip?.start).toBe(0);
			expect(clip?.length).toBe(5);
		});
	});

	// ─── Output Accessor Tests ────────────────────────────────────────────────

	describe("output accessors", () => {
		it("getOutput returns output config", () => {
			const doc = new EditDocument(createEditWithTracks());
			const output = doc.getOutput();

			expect(output.size).toEqual({ width: 1280, height: 720 });
			expect(output.format).toBe("mp4");
			expect(output.fps).toBe(30);
		});

		it("getSize returns output dimensions", () => {
			const doc = new EditDocument(createEditWithTracks());
			expect(doc.getSize()).toEqual({ width: 1280, height: 720 });
		});

		it("getFormat returns output format", () => {
			const doc = new EditDocument(createEditWithTracks());
			expect(doc.getFormat()).toBe("mp4");
		});

		it("getFps returns fps or undefined", () => {
			const docWithFps = new EditDocument(createEditWithTracks());
			expect(docWithFps.getFps()).toBe(30);

			const docWithoutFps = new EditDocument(createMinimalEdit());
			expect(docWithoutFps.getFps()).toBeUndefined();
		});
	});

	// ─── Merge Field Tests ────────────────────────────────────────────────────

	describe("merge fields", () => {
		it("getMergeFields returns merge field definitions", () => {
			const doc = new EditDocument(createEditWithTracks());
			const mergeFields = doc.getMergeFields();

			expect(mergeFields).toEqual([{ find: "TITLE", replace: "Hello World" }]);
		});

		it("getMergeFields returns undefined when not set", () => {
			const doc = new EditDocument(createMinimalEdit());
			expect(doc.getMergeFields()).toBeUndefined();
		});
	});

	// ─── Track Mutation Tests ─────────────────────────────────────────────────

	describe("track mutations", () => {
		it("addTrack adds empty track at index", () => {
			const doc = new EditDocument(createMinimalEdit());

			doc.addTrack(0);

			expect(doc.getTrackCount()).toBe(1);
			expect(doc.getClipCountInTrack(0)).toBe(0);
		});

		it("addTrack inserts at correct position", () => {
			const doc = new EditDocument(createEditWithTracks());

			doc.addTrack(1, { clips: [] });

			expect(doc.getTrackCount()).toBe(3);
			// Original track 1 should now be at index 2
			expect(doc.getClipCountInTrack(2)).toBe(1);
		});

		it("removeTrack removes track and returns it", () => {
			const doc = new EditDocument(createEditWithTracks());

			const removed = doc.removeTrack(0);

			expect(removed?.clips.length).toBe(2);
			expect(doc.getTrackCount()).toBe(1);
		});

		it("removeTrack returns null for invalid index", () => {
			const doc = new EditDocument(createEditWithTracks());

			expect(doc.removeTrack(-1)).toBeNull();
			expect(doc.removeTrack(99)).toBeNull();
			expect(doc.getTrackCount()).toBe(2); // Unchanged
		});
	});

	// ─── Clip Mutation Tests ──────────────────────────────────────────────────

	describe("clip mutations", () => {
		it("addClip adds clip to end of track", () => {
			const doc = new EditDocument(createEditWithTracks());
			const newClip = createImageClip("https://example.com/new.jpg", "auto", 2);

			doc.addClip(0, newClip);

			expect(doc.getClipCountInTrack(0)).toBe(3);
			expect(doc.getClip(0, 2)?.asset).toEqual(newClip.asset);
		});

		it("addClip inserts at specific index", () => {
			const doc = new EditDocument(createEditWithTracks());
			const newClip = createImageClip("https://example.com/inserted.jpg", 1, 1);

			doc.addClip(0, newClip, 1);

			expect(doc.getClipCountInTrack(0)).toBe(3);
			expect(doc.getClip(0, 1)?.asset).toEqual(newClip.asset);
		});

		it("addClip throws for invalid track index", () => {
			const doc = new EditDocument(createEditWithTracks());
			const newClip = createImageClip("https://example.com/new.jpg", 0, 1);

			expect(() => doc.addClip(99, newClip)).toThrow("Track 99 does not exist");
		});

		it("removeClip removes and returns clip", () => {
			const doc = new EditDocument(createEditWithTracks());

			const removed = doc.removeClip(0, 0);

			expect(removed?.start).toBe(0);
			expect(doc.getClipCountInTrack(0)).toBe(1);
		});

		it("removeClip returns null for invalid indices", () => {
			const doc = new EditDocument(createEditWithTracks());

			expect(doc.removeClip(99, 0)).toBeNull();
			expect(doc.removeClip(0, 99)).toBeNull();
		});

		it("updateClip updates clip properties", () => {
			const doc = new EditDocument(createEditWithTracks());

			doc.updateClip(0, 0, { start: 10, length: 20 });

			const clip = doc.getClip(0, 0);
			expect(clip?.start).toBe(10);
			expect(clip?.length).toBe(20);
		});

		it("updateClip throws for invalid indices", () => {
			const doc = new EditDocument(createEditWithTracks());

			expect(() => doc.updateClip(99, 0, { start: 0 })).toThrow();
		});

		it("replaceClip replaces entire clip", () => {
			const doc = new EditDocument(createEditWithTracks());
			const newClip = createImageClip("https://example.com/replaced.jpg", 100, 200);

			const oldClip = doc.replaceClip(0, 0, newClip);

			expect(oldClip?.start).toBe(0);
			expect(doc.getClip(0, 0)).toEqual(newClip);
		});

		it("replaceClip returns null for invalid indices", () => {
			const doc = new EditDocument(createEditWithTracks());
			const newClip = createImageClip("https://example.com/new.jpg", 0, 1);

			expect(doc.replaceClip(99, 0, newClip)).toBeNull();
		});
	});

	// ─── Timeline Mutation Tests ──────────────────────────────────────────────

	describe("timeline mutations", () => {
		it("setBackground updates background color", () => {
			const doc = new EditDocument(createMinimalEdit());

			doc.setBackground("#FF0000");

			expect(doc.getBackground()).toBe("#FF0000");
		});

		it("setSoundtrack sets soundtrack", () => {
			const doc = new EditDocument(createMinimalEdit());
			const soundtrack = { src: "https://example.com/audio.mp3", volume: 0.5 };

			doc.setSoundtrack(soundtrack);

			expect(doc.getSoundtrack()).toEqual(soundtrack);
		});

		it("setSoundtrack can clear soundtrack", () => {
			const edit = createEditWithTracks();
			edit.timeline.soundtrack = { src: "https://example.com/audio.mp3" };
			const doc = new EditDocument(edit);

			doc.setSoundtrack(undefined);

			expect(doc.getSoundtrack()).toBeUndefined();
		});
	});

	// ─── Output Mutation Tests ────────────────────────────────────────────────

	describe("output mutations", () => {
		it("setSize updates output dimensions", () => {
			const doc = new EditDocument(createMinimalEdit());

			doc.setSize({ width: 3840, height: 2160 });

			expect(doc.getSize()).toEqual({ width: 3840, height: 2160 });
		});

		it("setFormat updates output format", () => {
			const doc = new EditDocument(createMinimalEdit());

			doc.setFormat("gif");

			expect(doc.getFormat()).toBe("gif");
		});

		it("setFps updates fps", () => {
			const doc = new EditDocument(createMinimalEdit());

			doc.setFps(60);

			expect(doc.getFps()).toBe(60);
		});
	});

	// ─── Serialization Tests ──────────────────────────────────────────────────

	describe("serialization", () => {
		it("toJSON returns deep clone of data", () => {
			const original = createEditWithTracks();
			const doc = new EditDocument(original);

			const exported = doc.toJSON();

			// Should be equal in value
			expect(exported.timeline.tracks.length).toBe(2);
			expect(exported.output.format).toBe("mp4");

			// But not the same reference
			exported.timeline.tracks[0].clips[0].start = 999;
			expect(doc.getClip(0, 0)?.start).toBe(0);
		});

		it("toJSON preserves 'auto' and 'end' values", () => {
			const doc = new EditDocument(createEditWithTracks());
			const exported = doc.toJSON();

			expect(exported.timeline.tracks[0].clips[1].start).toBe("auto");
			expect(exported.timeline.tracks[1].clips[0].length).toBe("end");
		});

		it("fromJSON creates document from JSON", () => {
			const json = createEditWithTracks();
			const doc = EditDocument.fromJSON(json);

			expect(doc.getTrackCount()).toBe(2);
			expect(doc.getClipCount()).toBe(3);
		});

		it("clone creates independent copy", () => {
			const doc = new EditDocument(createEditWithTracks());
			const cloned = doc.clone();

			// Modify original
			doc.updateClip(0, 0, { start: 999 });

			// Clone should be unaffected
			expect(cloned.getClip(0, 0)?.start).toBe(0);
		});
	});

	// ─── Edge Cases ───────────────────────────────────────────────────────────

	describe("edge cases", () => {
		it("handles empty tracks array", () => {
			const doc = new EditDocument(createMinimalEdit());

			expect(doc.getTrackCount()).toBe(0);
			expect(doc.getClipCount()).toBe(0);
			expect(doc.getTracks()).toEqual([]);
		});

		it("handles track with empty clips array", () => {
			const edit = createMinimalEdit();
			edit.timeline.tracks = [{ clips: [] }];
			const doc = new EditDocument(edit);

			expect(doc.getTrackCount()).toBe(1);
			expect(doc.getClipCountInTrack(0)).toBe(0);
		});
	});
});
