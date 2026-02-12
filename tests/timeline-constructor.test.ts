/**
 * @jest-environment jsdom
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { sec } from "../src/core/timing/types";
import { Timeline } from "../src/components/timeline/timeline";

function createMockEdit() {
	return {
		events: {
			on: jest.fn(),
			off: jest.fn()
		},
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

	it("throws when a third constructor argument is provided", () => {
		const edit = createMockEdit();

		expect(() => new (Timeline as unknown as new (...args: unknown[]) => Timeline)(edit, container, {})).toThrow(
			"Timeline constructor no longer accepts options. Use new Timeline(edit, container)."
		);
	});

	it("does not expose feature-toggle methods", () => {
		const edit = createMockEdit();
		const timeline = new Timeline(edit as never, container) as Timeline & { enableFeature?: unknown; disableFeature?: unknown };

		expect(timeline.enableFeature).toBeUndefined();
		expect(timeline.disableFeature).toBeUndefined();
	});
});
