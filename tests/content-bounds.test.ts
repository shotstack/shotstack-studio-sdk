/**
 * @jest-environment jsdom
 */

import { Canvas } from "@canvas/shotstack-canvas";

// pixi.js ships untransformed ESM that jest can't parse; getContentBounds never touches a renderer.
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

/**
 * Regression: optional chaining must continue through `.position`.
 * `viewportContainer?.position.x` still throws when `position` is null/undefined.
 */
describe("Canvas.getContentBounds", () => {
	function boundsFor(viewportContainer: unknown) {
		const canvas = Object.create(Canvas.prototype) as Canvas;
		Object.assign(canvas, {
			edit: { size: { width: 100, height: 50 } },
			currentZoom: 2,
			viewportContainer
		});
		return canvas.getContentBounds();
	}

	it("returns zeroed origin when viewportContainer is missing", () => {
		expect(boundsFor(undefined)).toEqual({ left: 0, right: 200, top: 0, bottom: 100 });
	});

	it("does not throw when viewportContainer.position is null", () => {
		expect(() => boundsFor({ position: null })).not.toThrow();
		expect(boundsFor({ position: null })).toEqual({ left: 0, right: 200, top: 0, bottom: 100 });
	});

	it("uses viewport position when available", () => {
		expect(boundsFor({ position: { x: 10, y: 20 } })).toEqual({
			left: 10,
			right: 210,
			top: 20,
			bottom: 120
		});
	});
});
