import { afterAll, beforeAll, vi } from "vitest";
import "@testing-library/jest-dom";

const mockGetContext = vi.fn((contextType: string) => {
	if (contextType === "2d") {
		return {
			fillRect: vi.fn(),
			clearRect: vi.fn(),
			getImageData: vi.fn(() => ({
				width: 100,
				height: 100,
				data: new Uint8ClampedArray(100 * 100 * 4)
			})),
			putImageData: vi.fn(),
			createImageData: vi.fn(() => ({
				width: 100,
				height: 100,
				data: new Uint8ClampedArray(100 * 100 * 4)
			})),
			setTransform: vi.fn(),
			drawImage: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			scale: vi.fn(),
			rotate: vi.fn(),
			translate: vi.fn(),
			transform: vi.fn(),
			beginPath: vi.fn(),
			closePath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			bezierCurveTo: vi.fn(),
			quadraticCurveTo: vi.fn(),
			arc: vi.fn(),
			arcTo: vi.fn(),
			ellipse: vi.fn(),
			rect: vi.fn(),
			fill: vi.fn(),
			stroke: vi.fn(),
			clip: vi.fn(),
			isPointInPath: vi.fn(),
			isPointInStroke: vi.fn(),

			createLinearGradient: vi.fn(() => ({
				addColorStop: vi.fn()
			})),
			createRadialGradient: vi.fn(() => ({
				addColorStop: vi.fn()
			})),
			createConicGradient: vi.fn(() => ({
				addColorStop: vi.fn()
			})),
			createPattern: vi.fn(() => null),

			fillText: vi.fn(),
			strokeText: vi.fn(),
			measureText: vi.fn(() => ({
				width: 100,
				actualBoundingBoxLeft: 0,
				actualBoundingBoxRight: 100,
				actualBoundingBoxAscent: 10,
				actualBoundingBoxDescent: 2
			})),

			drawFocusIfNeeded: vi.fn(),
			scrollPathIntoView: vi.fn(),

			filter: "none",

			imageSmoothingEnabled: true,
			imageSmoothingQuality: "low" as ImageSmoothingQuality,

			direction: "ltr" as CanvasDirection,
			fontKerning: "auto" as CanvasFontKerning,
			letterSpacing: "0px",
			wordSpacing: "0px",
			textRendering: "auto" as CanvasTextRendering,

			strokeStyle: "",
			fillStyle: "",
			globalAlpha: 1,
			lineWidth: 1,
			lineCap: "butt" as CanvasLineCap,
			lineJoin: "miter" as CanvasLineJoin,
			miterLimit: 10,
			shadowOffsetX: 0,
			shadowOffsetY: 0,
			shadowBlur: 0,
			shadowColor: "transparent",
			globalCompositeOperation: "source-over" as GlobalCompositeOperation,
			font: "10px sans-serif",
			textAlign: "start" as CanvasTextAlign,
			textBaseline: "alphabetic" as CanvasTextBaseline,
			lineDashOffset: 0,

			setLineDash: vi.fn(),
			getLineDash: vi.fn(() => []),
			getTransform: vi.fn(() => new DOMMatrix()),
			resetTransform: vi.fn(),

			canvas: {
				width: 300,
				height: 150
			}
		} as unknown as CanvasRenderingContext2D;
	}
	if (contextType === "webgl" || contextType === "webgl2") {
		return {
			viewport: vi.fn(),
			clearColor: vi.fn(),
			clear: vi.fn(),
			enable: vi.fn(),
			disable: vi.fn(),
			blendFunc: vi.fn(),
			createShader: vi.fn(() => ({})),
			shaderSource: vi.fn(),
			compileShader: vi.fn(),
			getShaderParameter: vi.fn(() => true),
			createProgram: vi.fn(() => ({})),
			attachShader: vi.fn(),
			linkProgram: vi.fn(),
			getProgramParameter: vi.fn(() => true),
			useProgram: vi.fn(),
			getAttribLocation: vi.fn(() => 0),
			getUniformLocation: vi.fn(() => ({})),
			enableVertexAttribArray: vi.fn(),
			vertexAttribPointer: vi.fn(),
			uniformMatrix4fv: vi.fn(),
			createBuffer: vi.fn(() => ({})),
			bindBuffer: vi.fn(),
			bufferData: vi.fn(),
			createTexture: vi.fn(() => ({})),
			bindTexture: vi.fn(),
			texParameteri: vi.fn(),
			texImage2D: vi.fn(),
			drawArrays: vi.fn(),
			drawElements: vi.fn()
		} as unknown as WebGLRenderingContext;
	}
	return null;
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
	value: mockGetContext,
	writable: true,
	configurable: true
});

global.ImageData = class MockImageData {
	data: Uint8ClampedArray;
	width: number;
	height: number;

	constructor(data: Uint8ClampedArray | number, widthOrHeight?: number, height?: number) {
		if (typeof data === "number") {
			this.width = data;
			this.height = widthOrHeight!;
			this.data = new Uint8ClampedArray(data * widthOrHeight! * 4);
		} else {
			this.data = data;
			this.width = widthOrHeight!;
			this.height = height!;
		}
	}
} as any;

global.Uint8ClampedArray = Uint8ClampedArray;

global.Image = class Image {
	public src: string = "";
	public onload: (() => void) | null = null;
	public onerror: ((error: any) => void) | null = null;
	public width: number = 100;
	public height: number = 100;

	constructor() {
		setTimeout(() => {
			if (this.onload) this.onload();
		}, 0);
	}
} as any;

global.fetch = vi.fn(url => {
	if (url.includes("fonts.googleapis.com")) {
		return Promise.resolve({
			ok: true,
			text: () => Promise.resolve('@font-face { font-family: "Test"; src: url("test.woff2"); }')
		});
	}
	if (url.includes(".woff") || url.includes(".ttf")) {
		return Promise.resolve({
			ok: true,
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
		});
	}
	return Promise.resolve({
		ok: false,
		status: 404
	});
}) as any;

vi.mock("pixi.js", () => ({
	Application: vi.fn(() => ({
		stage: {
			addChild: vi.fn(),
			removeChild: vi.fn()
		},
		renderer: {
			render: vi.fn()
		},
		ticker: {
			add: vi.fn(),
			remove: vi.fn()
		}
	})),
	Container: vi.fn(() => ({
		addChild: vi.fn(),
		removeChild: vi.fn(),
		removeChildren: vi.fn(),
		position: { set: vi.fn() },
		scale: { set: vi.fn() },
		visible: true,
		alpha: 1,
		label: ""
	})),
	Graphics: vi.fn(() => ({
		clear: vi.fn(),
		beginFill: vi.fn(),
		drawRect: vi.fn(),
		endFill: vi.fn(),
		lineStyle: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn()
	})),
	Text: vi.fn(() => ({
		text: "",
		style: {},
		anchor: { set: vi.fn() },
		position: { set: vi.fn() }
	})),
	Sprite: vi.fn(texture => ({
		texture,
		position: { set: vi.fn(), x: 0, y: 0 },
		scale: { set: vi.fn(), x: 1, y: 1 },
		anchor: { set: vi.fn() },
		visible: true,
		alpha: 1,
		destroy: vi.fn()
	})),
	Texture: {
		from: vi.fn(source => ({
			baseTexture: { source },
			destroy: vi.fn()
		})),
		WHITE: {}
	}
}));

vi.mock("gsap", () => ({
	gsap: {
		timeline: vi.fn(() => ({
			to: vi.fn(),
			from: vi.fn(),
			fromTo: vi.fn(),
			add: vi.fn(),
			progress: vi.fn(),
			kill: vi.fn(),
			paused: true,
			play: vi.fn(),
			pause: vi.fn(),
			reverse: vi.fn(),
			time: vi.fn(),
			duration: vi.fn(() => 1)
		})),
		to: vi.fn(),
		from: vi.fn(),
		fromTo: vi.fn(),
		set: vi.fn()
	}
}));

global.requestAnimationFrame = vi.fn(cb => setTimeout(cb, 0)) as any;
global.cancelAnimationFrame = vi.fn(id => clearTimeout(id)) as any;

global.performance = {
	...global.performance,
	now: vi.fn(() => Date.now())
};

const originalCreateElement = document.createElement.bind(document);
document.createElement = vi.fn((tagName: string) => {
	if (tagName === "canvas") {
		const canvas = originalCreateElement("canvas");

		Object.defineProperty(canvas, "getContext", {
			value: mockGetContext,
			writable: true,
			configurable: true
		});
		return canvas;
	}
	return originalCreateElement(tagName);
}) as any;

(window as any).fs = {
	readFile: vi.fn((path: string, options?: any) => {
		if (path.includes(".csv")) {
			return Promise.resolve("header1,header2\nvalue1,value2");
		}
		if (path.includes(".json")) {
			return Promise.resolve(JSON.stringify({ test: "data" }));
		}
		return Promise.resolve("test content");
	})
};

process.env.NODE_ENV = "test";

const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
	console.error = vi.fn((...args) => {
		if (!args[0]?.includes("Engine not initialized")) {
			originalError(...args);
		}
	});
	console.warn = vi.fn();
});

afterAll(() => {
	console.error = originalError;
	console.warn = originalWarn;
});
