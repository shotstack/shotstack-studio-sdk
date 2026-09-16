/**
 * remintPastedClipIdentity — paste path strips id and remints colliding aliases.
 */

import { remintPastedClipIdentity } from "@core/clipboard/remint-pasted-alias";
import { generateAlias } from "@core/shared/source-clip-finder";

describe("remintPastedClipIdentity", () => {
	it("clears id when clip has no alias", () => {
		const clip = { id: "keep-me-gone", start: 0, length: 1 };
		remintPastedClipIdentity(clip);
		expect(clip.id).toBeUndefined();
		expect((clip as { alias?: string }).alias).toBeUndefined();
	});

	it("remints id and alias when alias is present", () => {
		const clip = { id: "old-id-xxxxxxxx", alias: "VOICEOVER" };
		remintPastedClipIdentity(clip);

		expect(clip.id).toBeDefined();
		expect(clip.id).not.toBe("old-id-xxxxxxxx");
		expect(clip.alias).toBe(generateAlias(clip.id!));
		expect(clip.alias).not.toBe("VOICEOVER");
		expect(clip.alias).toMatch(/^source_[\da-f]{8}$/i);
	});

	it("remints source_* auto-aliases to a new unique value", () => {
		const clip = { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeffff0001", alias: "source_ffff0001" };
		remintPastedClipIdentity(clip);

		expect(clip.alias).not.toBe("source_ffff0001");
		expect(clip.alias).toBe(generateAlias(clip.id!));
	});
});
