/**
 * @jest-environment jsdom
 *
 * WebGL Support Tests
 *
 * jsdom has no WebGL, so the unsupported path is the natural one here:
 * load() must throw WebGLUnsupportedError (not silently succeed), and
 * resize() must be a no-op before the renderer exists.
 */

import { Canvas } from "@canvas/shotstack-canvas";
import { checkWebGLSupport, WebGLUnsupportedError } from "@core/webgl-support";

import type { Edit } from "@core/edit-session";

// pixi.js ships untransformed ESM that jest can't parse; the paths under test
// (constructor + the WebGL guard at the top of load/resize) never reach a real renderer.
jest.mock("pixi.js", () => ({
	Application: jest.fn(),
	Container: jest.fn(),
	Graphics: jest.fn(),
	Rectangle: jest.fn()
}));
jest.mock("pixi.js/app", () => ({}));
jest.mock("pixi.js/events", () => ({}));
jest.mock("pixi.js/graphics", () => ({}));
jest.mock("pixi.js/text", () => ({}));
jest.mock("pixi.js/text-html", () => ({}));
jest.mock("pixi.js/sprite-tiling", () => ({}));
jest.mock("pixi.js/filters", () => ({}));
jest.mock("pixi.js/mesh", () => ({}));

const makeEditStub = (): Edit =>
	({
		setCanvas: () => {},
		size: { width: 1280, height: 720 }
	}) as unknown as Edit;

describe("WebGL support", () => {
	beforeEach(() => {
		document.body.innerHTML = `<div data-shotstack-studio></div>`;
	});

	it("reports unsupported in jsdom", () => {
		expect(checkWebGLSupport().supported).toBe(false);
	});

	it("load() throws WebGLUnsupportedError when WebGL is unavailable", async () => {
		const canvas = new Canvas(makeEditStub());
		await expect(canvas.load()).rejects.toBeInstanceOf(WebGLUnsupportedError);
	});

	it("still renders the error overlay for the user", async () => {
		const canvas = new Canvas(makeEditStub());
		await canvas.load().catch(() => {});
		const root = document.querySelector("[data-shotstack-studio]");
		expect(root?.childElementCount).toBeGreaterThan(0);
	});

	it("resize() is a no-op before the renderer is initialised", () => {
		const canvas = new Canvas(makeEditStub());
		expect(() => canvas.resize()).not.toThrow();
	});
});
