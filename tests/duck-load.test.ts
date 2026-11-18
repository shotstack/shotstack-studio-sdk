import { existsSync } from "fs";
import { resolve } from "path";

import { buildDuckedVolume } from "@shotstack/shotstack-canvas/duck";

import { EditSchema } from "../src/core/schemas";
import { aliases } from "../vite.shared";

const DUCK = "@shotstack/shotstack-canvas/duck";

describe("duck dependencies", () => {
	it("accepts an audio clip with a duck property", () => {
		const edit = {
			timeline: {
				tracks: [
					{ clips: [{ alias: "voice", asset: { type: "audio", src: "https://example.com/voice.mp3" }, start: 0, length: 5 }] },
					{
						clips: [
							{
								asset: { type: "audio", src: "https://example.com/music.mp3", duck: { under: "alias://voice" } },
								start: 0,
								length: 5
							}
						]
					}
				]
			},
			output: { format: "mp4", size: { width: 1280, height: 720 } }
		};

		expect(() => EditSchema.parse(edit)).not.toThrow();
	});

	it("resolves the canvas duck subpath", () => {
		expect(typeof buildDuckedVolume).toBe("function");
	});

	describe("vite alias", () => {
		it("maps the duck subpath to the canvas build", () => {
			expect(aliases("/repo")[DUCK]).toBe(resolve("/repo", "node_modules/@shotstack/shotstack-canvas/dist/duck.js"));
		});

		it("lists the subpath before the bare package, which also matches it", () => {
			const keys = Object.keys(aliases("/repo"));
			expect(keys.indexOf(DUCK)).toBeGreaterThanOrEqual(0);
			expect(keys.indexOf(DUCK)).toBeLessThan(keys.indexOf("@shotstack/shotstack-canvas"));
		});

		it("points at a file the installed canvas build ships", () => {
			expect(existsSync(aliases(resolve(__dirname, ".."))[DUCK])).toBe(true);
		});
	});
});
