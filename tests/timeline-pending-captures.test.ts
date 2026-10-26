/** @jest-environment jsdom */
import { Timeline } from "@timeline/timeline";
import { AssetLoadTracker } from "@core/events/asset-load-tracker";
import { EditEvent } from "@core/events/edit-events";
import { EventEmitter } from "@core/events/event-emitter";
import type { PendingCaptures } from "@core/pending-captures";
import { sec } from "@core/timing/types";

async function mountTimeline() {
	const events = new EventEmitter();
	const config = { timeline: { tracks: [] } };
	let state: PendingCaptures = { pending: 0, total: 0 };
	const edit = {
		events,
		assetLoader: { loadTracker: new AssetLoadTracker() },
		getInternalEvents: () => events,
		getResolvedEdit: () => config,
		getEdit: () => config,
		isClipSelected: () => false,
		getClipGenerationState: () => undefined,
		getClipError: () => null,
		getPendingCaptures: () => state,
		playbackTime: sec(0),
		totalDuration: sec(5),
		isPlaying: false
	};
	const container = document.createElement("div");
	document.body.appendChild(container);
	const timeline = new Timeline(edit as never, container);
	await timeline.load();
	jest.useFakeTimers();
	const status = () => container.querySelector<HTMLElement>(".ss-toolbar-status")!;
	const report = (next: PendingCaptures, event: string = EditEvent.ClipCaptureStarted) => {
		state = next;
		events.emit(event, { clipId: "clip", assetType: "html5" });
	};
	return { timeline, status, report };
}

afterEach(() => {
	jest.useRealTimers();
	document.body.replaceChildren();
});

it("shows the line 500 ms after something starts preparing, and hides it when all are ready", async () => {
	const { status, report } = await mountTimeline();

	// A live region announces text written into it; one revealed by display often goes unannounced.
	expect(status().hidden).toBe(false);
	expect(status().getAttribute("role")).toBe("status");

	report({ pending: 3, total: 9 });
	jest.advanceTimersByTime(499);
	expect(status().textContent).toBe("");
	jest.advanceTimersByTime(1);
	expect(status().textContent).toBe("Preparing smooth playback · 6 of 9 ready");

	report({ pending: 0, total: 9 }, EditEvent.ClipCaptureCompleted);
	expect(status().textContent).toBe("");
});

it("never shows the line when preparing finishes within 500 ms", async () => {
	const { status, report } = await mountTimeline();

	report({ pending: 1, total: 1 });
	jest.advanceTimersByTime(300);
	report({ pending: 0, total: 1 }, EditEvent.ClipCaptureCompleted);
	jest.advanceTimersByTime(1000);

	expect(status().textContent).toBe("");
});

it("keeps the first 500 ms wait when more capture events arrive", async () => {
	const { status, report } = await mountTimeline();

	report({ pending: 3, total: 3 });
	jest.advanceTimersByTime(200);
	report({ pending: 2, total: 3 }, EditEvent.ClipCaptureCompleted);
	jest.advanceTimersByTime(200);
	report({ pending: 2, total: 3 });
	jest.advanceTimersByTime(100);

	expect(status().textContent).toBe("Preparing smooth playback · 1 of 3 ready");
});

it("never shows the line for an edit without html5 clips", async () => {
	const { status, report } = await mountTimeline();

	report({ pending: 0, total: 0 });
	jest.advanceTimersByTime(1000);

	expect(status().textContent).toBe("");
});

it("clears the wait when the timeline is disposed", async () => {
	const { timeline, status, report } = await mountTimeline();
	const line = status();

	report({ pending: 2, total: 2 });
	jest.advanceTimersByTime(200);
	timeline.dispose();
	jest.advanceTimersByTime(1000);

	expect(line.textContent).toBe("");
	expect(line.isConnected).toBe(false);
});
