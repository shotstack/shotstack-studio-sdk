/**
 * @jest-environment jsdom
 */

import { Canvas } from "@canvas/shotstack-canvas";

// pixi.js ships untransformed ESM that jest can't parse; captureFrame only needs the renderer stubbed below.
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

const point = (x: number, y: number) => ({
	x,
	y,
	set(nextX: number, nextY: number) {
		this.x = nextX;
		this.y = nextY;
	}
});

describe("Canvas.captureFrame", () => {
	function setup({ started = true, extractFails = false } = {}) {
		const ticker = {
			started,
			stop: jest.fn(() => {
				ticker.started = false;
			}),
			start: jest.fn(() => {
				ticker.started = true;
			}),
			add: jest.fn(),
			remove: jest.fn()
		};
		const viewportContainer = { position: point(40, 30), scale: point(0.5, 0.5) };
		// What the screen would show if Pixi drew a frame while the extract is in flight.
		const duringExtract: { drawing: boolean; x: number; scale: number }[] = [];
		const base64 = jest.fn(async () => {
			duringExtract.push({ drawing: ticker.started, x: viewportContainer.position.x, scale: viewportContainer.scale.x });
			if (extractFails) throw new Error("extract failed");
			return "data:image/jpeg;base64,AAAA";
		});
		const canvas = Object.create(Canvas.prototype) as Canvas;
		Object.assign(canvas, {
			edit: { size: { width: 1920, height: 1080 } },
			application: { ticker, renderer: { extract: { base64 } } },
			viewportContainer,
			onTickBound: jest.fn()
		});
		return { canvas, ticker, viewportContainer, duringExtract };
	}

	it("stops Pixi drawing while the viewport is moved for the extract", async () => {
		const { canvas, ticker, duringExtract } = setup();

		await expect(canvas.captureFrame({ format: "jpeg" })).resolves.toBe("data:image/jpeg;base64,AAAA");

		expect(duringExtract).toEqual([{ drawing: false, x: 0, scale: 1 }]);
		expect(ticker.started).toBe(true);
	});

	it("restores the viewport and restarts drawing when the extract fails", async () => {
		const { canvas, ticker, viewportContainer } = setup({ extractFails: true });

		await expect(canvas.captureFrame()).rejects.toThrow("extract failed");

		expect(viewportContainer.position).toMatchObject({ x: 40, y: 30 });
		expect(viewportContainer.scale).toMatchObject({ x: 0.5, y: 0.5 });
		expect(ticker.started).toBe(true);
	});

	it("leaves a stopped ticker stopped", async () => {
		const { canvas, ticker } = setup({ started: false });

		await canvas.captureFrame();

		expect(ticker.start).not.toHaveBeenCalled();
		expect(ticker.started).toBe(false);
	});
});
