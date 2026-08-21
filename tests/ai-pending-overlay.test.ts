/**
 * @jest-environment jsdom
 */
/* eslint-disable max-classes-per-file, @typescript-eslint/lines-between-class-members -- Pixi constructor stubs share one module mock. */

const mockTextInstances: Array<{ text: string }> = [];

jest.mock("pixi.js", () => {
	class MockPoint {
		set = jest.fn();
	}

	class MockContainer {
		children: unknown[] = [];
		position = new MockPoint();
		scale = new MockPoint();
		mask: unknown = null;
		filters: unknown[] = [];

		addChild = jest.fn((child: unknown) => {
			this.children.push(child);
			return child;
		});

		removeChildren = jest.fn(() => {
			this.children = [];
		});

		destroy = jest.fn();
	}

	class MockGraphics extends MockContainer {
		clear = jest.fn().mockReturnThis();
		roundRect = jest.fn().mockReturnThis();
		rect = jest.fn().mockReturnThis();
		circle = jest.fn().mockReturnThis();
		arc = jest.fn().mockReturnThis();
		fill = jest.fn().mockReturnThis();
		stroke = jest.fn().mockReturnThis();
		svg = jest.fn().mockReturnThis();
	}

	class MockText extends MockContainer {
		anchor = new MockPoint();
		text: string;

		constructor({ text }: { text: string }) {
			super();
			this.text = text;
			mockTextInstances.push(this);
		}
	}

	return {
		Container: MockContainer,
		Graphics: MockGraphics,
		Text: MockText,
		BlurFilter: class MockBlurFilter {}
	};
});

// eslint-disable-next-line import/first -- Pixi must be mocked before loading the overlay.
import { AiPendingOverlay } from "@canvas/players/ai-pending-overlay";

describe("AiPendingOverlay generation status", () => {
	let frames: FrameRequestCallback[];

	beforeEach(() => {
		frames = [];
		mockTextInstances.length = 0;
		jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
			frames.push(callback);
			return frames.length;
		});
		jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("reassures the user when generation continues beyond ten seconds", () => {
		const overlay = new AiPendingOverlay({
			mode: "panel",
			icon: "image",
			width: 640,
			height: 360,
			prompt: "A lighthouse in a storm"
		});
		overlay.setGenerating(true);

		const runFrame = (time: number): void => {
			const callback = frames.shift();
			if (!callback) throw new Error("No animation frame scheduled");
			callback(time);
		};

		runFrame(0);
		runFrame(9_999);
		expect(mockTextInstances.at(-1)?.text).toBe("Generating…");

		runFrame(10_000);
		expect(mockTextInstances.at(-1)?.text).toBe("Still generating…");

		overlay.dispose();
	});
});
