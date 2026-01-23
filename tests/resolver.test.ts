import { EditDocument } from "@core/edit-document";
import { EventEmitter } from "@core/events/event-emitter";
import { MergeFieldService } from "@core/merge/merge-field-service";
import { resolve, type ResolvedClipWithId } from "@core/resolver";
import type { Edit } from "@schemas";

function createMergeFieldService(): MergeFieldService {
	return new MergeFieldService(new EventEmitter());
}

function createEditWithAutoStart(): Edit {
	return {
		timeline: {
			tracks: [
				{
					clips: [
						{ asset: { type: "image", src: "https://example.com/1.jpg" }, start: 0, length: 2 },
						{ asset: { type: "image", src: "https://example.com/2.jpg" }, start: "auto", length: 3 },
						{ asset: { type: "image", src: "https://example.com/3.jpg" }, start: "auto", length: 1 }
					]
				}
			]
		},
		output: { format: "mp4", size: { width: 1920, height: 1080 } }
	};
}

function createEditWithEndLength(): Edit {
	return {
		timeline: {
			tracks: [
				{
					clips: [{ asset: { type: "image", src: "https://example.com/1.jpg" }, start: 0, length: 5 }]
				},
				{
					clips: [{ asset: { type: "image", src: "https://example.com/bg.jpg" }, start: 0, length: "end" }]
				}
			]
		},
		output: { format: "mp4", size: { width: 1920, height: 1080 } }
	};
}

function createEditWithMergeFields(): Edit {
	return {
		timeline: {
			tracks: [
				{
					clips: [
						{
							asset: {
								type: "title",
								text: "Hello {{ NAME }}",
								style: "minimal"
							},
							start: 0,
							length: 3
						}
					]
				}
			]
		},
		output: { format: "mp4", size: { width: 1920, height: 1080 } },
		merge: [{ find: "NAME", replace: "World" }]
	};
}

describe("Resolver", () => {
	describe("resolve()", () => {
		it("resolves 'auto' starts to sequential positions", () => {
			const doc = new EditDocument(createEditWithAutoStart());
			const mergeFields = createMergeFieldService();

			const resolved = resolve(doc, { mergeFields });

			const { clips } = resolved.timeline.tracks[0];
			expect(clips[0].start).toBe(0);
			expect(clips[1].start).toBe(2); // After first clip (0 + 2)
			expect(clips[2].start).toBe(5); // After second clip (2 + 3)
		});

		it("resolves 'end' length to extend to timeline end", () => {
			const doc = new EditDocument(createEditWithEndLength());
			const mergeFields = createMergeFieldService();

			const resolved = resolve(doc, { mergeFields });

			// Track 0 has a clip from 0-5
			// Track 1 has a clip with length: "end" starting at 0
			const endClip = resolved.timeline.tracks[1].clips[0];
			expect(endClip.start).toBe(0);
			expect(endClip.length).toBe(5); // Extends to timeline end
		});

		it("substitutes merge fields in assets", () => {
			const doc = new EditDocument(createEditWithMergeFields());
			const mergeFields = createMergeFieldService();
			mergeFields.register({ name: "NAME", defaultValue: "Claude" });

			const resolved = resolve(doc, { mergeFields });

			const titleAsset = resolved.timeline.tracks[0].clips[0].asset as { text: string };
			expect(titleAsset.text).toBe("Hello Claude");
		});

		it("preserves clip IDs through resolution", () => {
			const doc = new EditDocument(createEditWithAutoStart());
			const mergeFields = createMergeFieldService();

			// Get the ID assigned during hydration
			const originalId = doc.getClipId(0, 0);

			const resolved = resolve(doc, { mergeFields });

			// The resolved clip should have the same ID
			const resolvedClip = resolved.timeline.tracks[0].clips[0] as ResolvedClipWithId;
			expect(resolvedClip.id).toBe(originalId);
		});

		it("assigns unique IDs to all resolved clips", () => {
			const doc = new EditDocument(createEditWithAutoStart());
			const mergeFields = createMergeFieldService();

			const resolved = resolve(doc, { mergeFields });

			const ids = resolved.timeline.tracks[0].clips.map(c => (c as ResolvedClipWithId).id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);
		});

		it("is pure - same input produces same output", () => {
			const doc = new EditDocument(createEditWithAutoStart());
			const mergeFields = createMergeFieldService();

			const resolved1 = resolve(doc, { mergeFields });
			const resolved2 = resolve(doc, { mergeFields });

			// Structure should be identical (excluding dynamically generated IDs which are stable)
			expect(resolved1.timeline.tracks[0].clips.map(c => c.start)).toEqual(resolved2.timeline.tracks[0].clips.map(c => c.start));
			expect(resolved1.timeline.tracks[0].clips.map(c => c.length)).toEqual(resolved2.timeline.tracks[0].clips.map(c => c.length));
		});

		it("does not mutate the source document", () => {
			const doc = new EditDocument(createEditWithAutoStart());
			const originalClip = doc.getClip(0, 1);
			const originalStart = originalClip?.start;

			const mergeFields = createMergeFieldService();
			resolve(doc, { mergeFields });

			// Document should be unchanged
			const clipAfterResolve = doc.getClip(0, 1);
			expect(clipAfterResolve?.start).toBe(originalStart);
		});

		it("preserves timeline metadata", () => {
			const edit: Edit = {
				timeline: {
					background: "#FF0000",
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "https://example.com/1.jpg" }, start: 0, length: 2 }]
						}
					],
					fonts: [{ src: "https://example.com/font.ttf" }]
				},
				output: { format: "mp4", size: { width: 1920, height: 1080 } }
			};

			const doc = new EditDocument(edit);
			const mergeFields = createMergeFieldService();

			const resolved = resolve(doc, { mergeFields });

			expect(resolved.timeline.background).toBe("#FF0000");
			expect(resolved.timeline.fonts).toEqual([{ src: "https://example.com/font.ttf" }]);
		});

		it("handles empty tracks", () => {
			const edit: Edit = {
				timeline: {
					tracks: [{ clips: [] }]
				},
				output: { format: "mp4", size: { width: 1920, height: 1080 } }
			};

			const doc = new EditDocument(edit);
			const mergeFields = createMergeFieldService();

			const resolved = resolve(doc, { mergeFields });

			expect(resolved.timeline.tracks[0].clips).toEqual([]);
		});

		it("handles 'end' length with minimum duration", () => {
			// When timeline end equals clip start, ensure minimum length
			const edit: Edit = {
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "https://example.com/bg.jpg" }, start: 0, length: "end" }]
						}
					]
				},
				output: { format: "mp4", size: { width: 1920, height: 1080 } }
			};

			const doc = new EditDocument(edit);
			const mergeFields = createMergeFieldService();

			const resolved = resolve(doc, { mergeFields });

			// Should have minimum length of 0.1
			expect(resolved.timeline.tracks[0].clips[0].length).toBeGreaterThanOrEqual(0.1);
		});

		describe("alias references", () => {
			it("handles alias reference in length without producing NaN", () => {
				// Regression test: alias://image was falling through to sec() which produced NaN
				const edit: Edit = {
					timeline: {
						tracks: [
							{
								clips: [
									{
										asset: { type: "image", src: "https://example.com/1.jpg" },
										start: 0,
										length: 5,
										alias: "image"
									}
								]
							},
							{
								clips: [
									{
										asset: { type: "html", html: "<p>overlay</p>" },
										start: 0,
										length: "alias://image" as unknown as number // TypeScript doesn't know about alias
									}
								]
							}
						]
					},
					output: { format: "mp4", size: { width: 1920, height: 1080 } }
				};

				const doc = new EditDocument(edit);
				const mergeFields = createMergeFieldService();

				const resolved = resolve(doc, { mergeFields });

				// The length should be a valid number (placeholder), NOT NaN
				const aliasClip = resolved.timeline.tracks[1].clips[0];
				expect(aliasClip.length).not.toBeNaN();
				expect(typeof aliasClip.length).toBe("number");
				expect(aliasClip.length).toBeGreaterThan(0);
			});

			it("handles alias reference in start without producing NaN", () => {
				// Regression test: alias://image in start was falling through to sec() which produced NaN
				const edit: Edit = {
					timeline: {
						tracks: [
							{
								clips: [
									{
										asset: { type: "image", src: "https://example.com/1.jpg" },
										start: 2,
										length: 5,
										alias: "image"
									}
								]
							},
							{
								clips: [
									{
										asset: { type: "html", html: "<p>overlay</p>" },
										start: "alias://image" as unknown as number, // TypeScript doesn't know about alias
										length: 3
									}
								]
							}
						]
					},
					output: { format: "mp4", size: { width: 1920, height: 1080 } }
				};

				const doc = new EditDocument(edit);
				const mergeFields = createMergeFieldService();

				const resolved = resolve(doc, { mergeFields });

				// The start should be a valid number (placeholder), NOT NaN
				const aliasClip = resolved.timeline.tracks[1].clips[0];
				expect(aliasClip.start).not.toBeNaN();
				expect(typeof aliasClip.start).toBe("number");
				expect(aliasClip.start).toBeGreaterThanOrEqual(0);
			});

			it("handles luma mask scenario with alias timing", () => {
				// Regression test: combining luma mask + alias timing produced NaN:0NaN duration
				const edit: Edit = {
					timeline: {
						tracks: [
							{
								clips: [
									{
										asset: { type: "image", src: "https://example.com/photo.jpg" },
										start: 0,
										length: 5,
										alias: "image"
									}
								]
							},
							{
								clips: [
									{
										asset: { type: "html", html: '<svg>...</svg>', width: 100, height: 100 },
										start: 0,
										length: "alias://image" as unknown as number
									}
								]
							}
						]
					},
					output: { format: "mp4", size: { width: 1920, height: 1080 } }
				};

				const doc = new EditDocument(edit);
				const mergeFields = createMergeFieldService();

				const resolved = resolve(doc, { mergeFields });

				// Both clips should have valid timing
				const imageClip = resolved.timeline.tracks[0].clips[0];
				const svgClip = resolved.timeline.tracks[1].clips[0];

				expect(imageClip.start).not.toBeNaN();
				expect(imageClip.length).not.toBeNaN();
				expect(svgClip.start).not.toBeNaN();
				expect(svgClip.length).not.toBeNaN();

				// Verify the resolved values are finite numbers
				expect(Number.isFinite(svgClip.start)).toBe(true);
				expect(Number.isFinite(svgClip.length)).toBe(true);
			});
		});
	});
});
