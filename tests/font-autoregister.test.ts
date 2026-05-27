/**
 * EditDocument.toJSON auto-registers catalogued Google Fonts referenced by a clip
 * into timeline.fonts. The editor preview resolves a font from its family hash on its
 * own, but the render API only loads what's listed in timeline.fonts — so an edit built
 * via addClip/updateClip (e.g. by an LLM that never called addFont) must still export a
 * complete fonts array, or it renders with a fallback / fails.
 */
import { EditDocument } from "@core/edit-document";
import type { Edit } from "@schemas";

const OPEN_SANS_FAMILY = "mem8YaGs126MiZpBA-U1UpcaXcl0Aw";
const OPEN_SANS_URL = "https://fonts.gstatic.com/s/opensans/v44/mem8YaGs126MiZpBA-U1UpcaXcl0Aw.ttf";

function richTextEdit(family: string, fonts: Array<{ src: string }> = []): Edit {
	return {
		timeline: {
			background: "#000000",
			fonts,
			tracks: [{ clips: [{ asset: { type: "rich-text", text: "Hi", font: { family, size: 24 } }, start: 0, length: 5 }] }]
		},
		output: { format: "mp4", size: { width: 1080, height: 1920 } }
	} as unknown as Edit;
}

describe("EditDocument.toJSON — Google Font auto-registration", () => {
	it("registers a catalogued font referenced by a clip but missing from timeline.fonts", () => {
		const out = EditDocument.fromJSON(richTextEdit(OPEN_SANS_FAMILY)).toJSON();
		expect(out.timeline.fonts).toEqual([{ src: OPEN_SANS_URL }]);
	});

	it("does not duplicate a font already present in timeline.fonts", () => {
		const out = EditDocument.fromJSON(richTextEdit(OPEN_SANS_FAMILY, [{ src: OPEN_SANS_URL }])).toJSON();
		expect(out.timeline.fonts).toEqual([{ src: OPEN_SANS_URL }]);
	});

	it("leaves non-catalogued (custom) font families untouched", () => {
		const out = EditDocument.fromJSON(richTextEdit("Totally Custom Font")).toJSON();
		expect(out.timeline.fonts ?? []).toEqual([]);
	});
});
