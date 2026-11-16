/**
 * @jest-environment jsdom
 *
 * Two canvases share one document and pixi's module-level pools, so disposing
 * one must leave the other able to draw. pixi is real here; only the WebGL
 * context underneath it is a stand-in, because jsdom has none.
 */

import { Canvas } from "@canvas/shotstack-canvas";
import type { Edit } from "@core/edit-session";
import * as pixi from "pixi.js";

// earcut is ESM-only, which jest cannot require. Nothing drawn here needs triangulating.
jest.mock("earcut", () => ({ __esModule: true, default: () => [] }));

type GlAnswer = (...args: number[]) => unknown;

/** Answers the queries pixi branches on and accepts every other call as a no-op. */
const makeGl = (canvas: HTMLCanvasElement, loseContext: () => void): unknown => {
	const names: string[] = [];
	const constant = (name: string): number => (names.includes(name) ? names.indexOf(name) : names.push(name) - 1) + 1;
	const nameOf = (id: number): string => names[id - 1] ?? "";

	const answers: Record<string, GlAnswer> = {
		getContextAttributes: () => ({ stencil: true, alpha: true, antialias: true, premultipliedAlpha: true }),
		getParameter: id => (nameOf(id) === "MAX_TEXTURE_SIZE" ? 4096 : 16),
		getShaderPrecisionFormat: () => ({ precision: 23 }),
		getShaderParameter: () => true,
		getProgramParameter: (_program, id) => (nameOf(id).startsWith("ACTIVE") ? 0 : true),
		checkFramebufferStatus: () => constant("FRAMEBUFFER_COMPLETE"),
		isContextLost: () => false
	};

	return new Proxy(
		{},
		{
			get: (_target, prop) => {
				if (typeof prop !== "string") return undefined;
				if (prop === "canvas") return canvas;
				if (prop === "getExtension") return (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null);
				if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return constant(prop);
				return answers[prop] ?? (prop.startsWith("create") ? () => ({}) : () => undefined);
			}
		}
	);
};

/** A clip on its own blend mode, so each one draws as a separate batch. */
const makeClip = (index: number): { getContainer: () => pixi.Container } => {
	const sprite = new pixi.Sprite(pixi.Texture.WHITE);
	sprite.blendMode = index % 2 ? "add" : "normal";
	return { getContainer: () => sprite };
};

const makeEdit = (clips: number): Edit => {
	const events = { on: () => {}, off: () => {}, emit: () => {} };
	return {
		setCanvas: () => {},
		size: { width: 1280, height: 720 },
		events,
		getInternalEvents: () => events,
		getTimelineBackground: () => "#000000",
		getTracks: () => [Array.from({ length: clips }, (_, index) => makeClip(index))]
	} as unknown as Edit;
};

describe("Canvas dispose", () => {
	const lostContexts: HTMLCanvasElement[] = [];

	beforeAll(() => {
		Object.assign(globalThis, { WebGLRenderingContext: class {} });
		jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function getContext(this: HTMLCanvasElement, type: string) {
			return (type.startsWith("webgl") ? makeGl(this, () => lostContexts.push(this)) : null) as RenderingContext | null;
		} as HTMLCanvasElement["getContext"]);
	});

	beforeEach(() => {
		lostContexts.length = 0;
		document.body.innerHTML = `<div data-shotstack-studio></div>`;
	});

	const mount = async (clips = 0): Promise<Canvas> => {
		const canvas = new Canvas(makeEdit(clips));
		await canvas.load();
		canvas.application.stop();
		// A redraw after a scene change cycles the batcher's batches through pixi's shared pool, as a live editor does on every edit.
		canvas.application.render();
		canvas.application.stage.addChild(new pixi.Container());
		canvas.application.render();
		return canvas;
	};

	it("leaves a second canvas in the same document rendering", async () => {
		// The survivor draws more batches than the disposed canvas hands back, so the shared pool still points at batches it is using.
		const first = await mount();
		const survivor = await mount(4);

		first.dispose();

		expect(() => survivor.application.render()).not.toThrow();
		survivor.dispose();
	});

	it("removes its own canvas element and releases its own WebGL context", async () => {
		const first = await mount();
		const survivor = await mount();
		const firstView = first.application.canvas;
		const survivorView = survivor.application.canvas;

		first.dispose();

		expect(firstView.isConnected).toBe(false);
		expect(survivorView.isConnected).toBe(true);
		expect(lostContexts).toContain(firstView);
		expect(lostContexts).not.toContain(survivorView);
		survivor.dispose();
	});
});
