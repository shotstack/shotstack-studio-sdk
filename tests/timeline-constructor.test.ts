/**
 * @jest-environment jsdom
 */

import { sec } from "../src/core/timing/types";
import { Timeline } from "../src/components/timeline/timeline";

function createMockEdit() {
	const events = {
		on: jest.fn(),
		off: jest.fn()
	};
	return {
		events,
		getInternalEvents: jest.fn(() => events),
		playbackTime: sec(0),
		isPlaying: false,
		totalDuration: sec(10),
		getResolvedEdit: jest.fn(() => ({ timeline: { tracks: [] } })),
		getEdit: jest.fn(() => ({ timeline: { tracks: [] } })),
		isClipSelected: jest.fn(() => false),
		selectClip: jest.fn(),
		clearSelection: jest.fn()
	};
}

describe("Timeline constructor API", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
	});

	it("constructs with edit and container only", () => {
		const edit = createMockEdit();
		const timeline = new Timeline(edit as never, container);

		expect(timeline).toBeInstanceOf(Timeline);
	});

	it("accepts optional third options param", () => {
		const edit = createMockEdit();
		const timeline = new Timeline(edit as never, container, { resizable: false });

		expect(timeline).toBeInstanceOf(Timeline);
	});

	it("does not expose feature-toggle methods", () => {
		const edit = createMockEdit();
		const timeline = new Timeline(edit as never, container) as Timeline & { enableFeature?: unknown; disableFeature?: unknown };

		expect(timeline.enableFeature).toBeUndefined();
		expect(timeline.disableFeature).toBeUndefined();
	});
});

describe("Timeline resizable option", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
		// Stub getBoundingClientRect for load()
		container.getBoundingClientRect = () => ({ width: 800, height: 300 } as DOMRect);
	});

	it("creates resize divider by default", async () => {
		const edit = createMockEdit();
		const timeline = new Timeline(edit as never, container);
		await timeline.load();

		expect(timeline.element.querySelector(".ss-timeline-divider")).not.toBeNull();
	});

	it("omits resize divider when resizable is false", async () => {
		const edit = createMockEdit();
		const timeline = new Timeline(edit as never, container, { resizable: false });
		await timeline.load();

		expect(timeline.element.querySelector(".ss-timeline-divider")).toBeNull();
	});
});
