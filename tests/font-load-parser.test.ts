/**
 * opentype.js 1.3.5 splits the naming table by platform, so a Windows-only font
 * used to crash the loader reading the flat `names.fontFamily` its types describe.
 */
import { readFamilyName } from "@loaders/font-load-parser";

jest.mock("pixi.js", () => ({}));

// Synthetic parse result — only the `names` field readFamilyName touches.
const font = (names: unknown) => ({ names }) as unknown as Parameters<typeof readFamilyName>[0];

describe("readFamilyName — opentype.js platform-split name tables", () => {
	it("reads a Windows-only name table (the regression)", () => {
		expect(readFamilyName(font({ windows: { fontFamily: { en: "Roboto" } } }))).toBe("Roboto");
	});

	it("reads a Macintosh-only name table", () => {
		expect(readFamilyName(font({ macintosh: { fontFamily: { en: "Helvetica Neue" } } }))).toBe("Helvetica Neue");
	});

	it("reads the flat name table older opentype.js versions exposed", () => {
		expect(readFamilyName(font({ fontFamily: { en: "Open Sans" } }))).toBe("Open Sans");
	});

	it("prefers Windows over Macintosh when both are present", () => {
		expect(readFamilyName(font({ windows: { fontFamily: { en: "Win" } }, macintosh: { fontFamily: { en: "Mac" } } }))).toBe("Win");
	});

	it("falls back to the first locale when there is no English entry", () => {
		expect(readFamilyName(font({ windows: { fontFamily: { ja: "ヒラギノ" } } }))).toBe("ヒラギノ");
	});

	it("throws a debuggable error when no platform table carries a family name", () => {
		expect(() => readFamilyName(font({ windows: {}, macintosh: {} }))).toThrow(/no readable family name.*windows, macintosh/);
	});
});
