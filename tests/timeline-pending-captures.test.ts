/** @jest-environment jsdom */
import { Timeline } from "@timeline/timeline";
import { AssetLoadTracker } from "@core/events/asset-load-tracker";
import { EditEvent, InternalEvent } from "@core/events/edit-events";
import { EventEmitter } from "@core/events/event-emitter";
import type { PendingCaptures, PlaybackReadiness } from "@core/pending-captures";
import { sec } from "@core/timing/types";

async function mountTimeline() {
	const events = new EventEmitter();
	const config = { timeline: { tracks: [{ clips: [{ id: "clip-1", asset: { type: "html5", html: "<p>Title</p>" }, start: 0, length: 5 }] }] } };
	let state: PendingCaptures = { pending: 0, total: 0, progress: 1 };
	const player = { readiness: null as PlaybackReadiness, progress: 1 };
	const getPendingCaptures = jest.fn(() => state);
	const edit = {
		events,
		assetLoader: { loadTracker: new AssetLoadTracker() },
		getInternalEvents: () => events,
		getResolvedEdit: () => config,
		getEdit: () => config,
		isClipSelected: () => false,
		getClipGenerationState: () => undefined,
		getClipError: () => null,
		getPendingCaptures,
		getClipCaptureProgress: () => (player.readiness === "pending" ? player.progress : null),
		playbackTime: sec(0),
		totalDuration: sec(5),
		isPlaying: false
	};
	const container = document.createElement("div");
	document.body.appendChild(container);
	const timeline = new Timeline(edit as never, container);
	timeline.registerClipRenderer("html5", { render: () => {} });
	await timeline.load();
	jest.useFakeTimers();
	const status = () => container.querySelector<HTMLElement>(".ss-toolbar-status")!;
	const ring = () => container.querySelector<HTMLElement>(".ss-play-progress")!;
	const clip = () => container.querySelector<HTMLElement>(".ss-clip")!;
	const report = (next: PendingCaptures, event: string = EditEvent.ClipCaptureStarted) => {
		state = next;
		events.emit(event, { clipId: "clip-1", assetType: "html5" });
	};
	const step = () => events.emit(InternalEvent.CaptureProgressChanged, { clipId: "clip-1" });
	return {
		timeline,
		status,
		ring,
		clip,
		player,
		report,
		step,
		getPendingCaptures,
		setState: (next: PendingCaptures) => {
			state = next;
		}
	};
}

afterEach(() => {
	jest.useRealTimers();
	document.body.replaceChildren();
});

it("fills a ring around the play button 500 ms after something starts preparing, and fades it once all are ready", async () => {
	const { status, ring, report } = await mountTimeline();
	expect(ring().getAttribute("role")).toBe("progressbar");
	expect(ring().getAttribute("aria-label")).toBe("Preparing smooth playback");

	report({ pending: 3, total: 9, progress: 0.4 });
	jest.advanceTimersByTime(499);
	expect(ring().classList.contains("ss-play-progress--shown")).toBe(false);
	expect(status().textContent).toBe("");
	jest.advanceTimersByTime(1);
	expect(ring().classList.contains("ss-play-progress--shown")).toBe(true);
	expect(ring().getAttribute("aria-valuenow")).toBe("40");
	// A live region announces text written into it; one revealed by display often goes unannounced.
	expect(status().getAttribute("role")).toBe("status");
	expect(status().textContent).toBe("Preparing smooth playback · 6 of 9 ready");

	report({ pending: 0, total: 9, progress: 1 }, EditEvent.ClipCaptureCompleted);
	expect(ring().classList.contains("ss-play-progress--shown")).toBe(false);
	expect(ring().getAttribute("aria-valuenow")).toBe("100");
	expect(status().textContent).toBe("");
});

it("follows bake progress on the player's progress steps, without polling", async () => {
	const { ring, clip, player, report, step, setState, getPendingCaptures } = await mountTimeline();

	Object.assign(player, { readiness: "pending", progress: 0.2 });
	report({ pending: 1, total: 1, progress: 0.2 });
	jest.advanceTimersByTime(500);
	expect(ring().getAttribute("aria-valuenow")).toBe("20");

	Object.assign(player, { progress: 0.6 });
	setState({ pending: 1, total: 1, progress: 0.6 });
	step();
	expect(ring().getAttribute("aria-valuenow")).toBe("60");
	expect(clip().style.getPropertyValue("--ss-capture-progress")).toBe("0.6");

	const reads = getPendingCaptures.mock.calls.length;
	jest.advanceTimersByTime(2000);
	expect(getPendingCaptures.mock.calls.length).toBe(reads);
});

it("never shows preparing when it finishes within 500 ms", async () => {
	const { status, ring, report } = await mountTimeline();

	report({ pending: 1, total: 1, progress: 0 });
	jest.advanceTimersByTime(300);
	report({ pending: 0, total: 1, progress: 1 }, EditEvent.ClipCaptureCompleted);
	jest.advanceTimersByTime(1000);

	expect(ring().classList.contains("ss-play-progress--shown")).toBe(false);
	expect(status().textContent).toBe("");
});

it("keeps the first 500 ms wait when more capture events arrive", async () => {
	const { status, ring, report } = await mountTimeline();

	report({ pending: 3, total: 3, progress: 0 });
	jest.advanceTimersByTime(200);
	report({ pending: 2, total: 3, progress: 0.4 }, EditEvent.ClipCaptureCompleted);
	jest.advanceTimersByTime(200);
	report({ pending: 2, total: 3, progress: 0.4 });
	jest.advanceTimersByTime(100);

	expect(ring().classList.contains("ss-play-progress--shown")).toBe(true);
	expect(status().textContent).toBe("Preparing smooth playback · 1 of 3 ready");
});

it("never shows preparing for an edit without html5 clips", async () => {
	const { status, ring, report } = await mountTimeline();

	report({ pending: 0, total: 0, progress: 1 });
	jest.advanceTimersByTime(1000);

	expect(ring().classList.contains("ss-play-progress--shown")).toBe(false);
	expect(status().textContent).toBe("");
});

it("clears the wait when the timeline is disposed", async () => {
	const { timeline, status, report, getPendingCaptures } = await mountTimeline();
	const line = status();

	report({ pending: 2, total: 2, progress: 0 });
	jest.advanceTimersByTime(200);
	timeline.dispose();
	const reads = getPendingCaptures.mock.calls.length;
	jest.advanceTimersByTime(1000);

	expect(line.textContent).toBe("");
	expect(line.isConnected).toBe(false);
	expect(getPendingCaptures.mock.calls.length).toBe(reads);
});

it("swaps a preparing clip's icon for a ring that fills with its own bake", async () => {
	const { clip, player, report } = await mountTimeline();

	Object.assign(player, { readiness: "pending", progress: 0.4 });
	report({ pending: 1, total: 1, progress: 0.4 });
	expect(clip().classList.contains("ss-clip--preparing")).toBe(true);
	expect(clip().style.getPropertyValue("--ss-capture-progress")).toBe("0.4");
	expect(clip().getAttribute("aria-busy")).toBe("true");
	expect(clip().title).toBe("Preparing smooth playback");

	Object.assign(player, { readiness: "ready", progress: 1 });
	report({ pending: 0, total: 1, progress: 1 }, EditEvent.ClipCaptureCompleted);
	expect(clip().classList.contains("ss-clip--preparing")).toBe(false);
	expect(clip().hasAttribute("aria-busy")).toBe(false);
});
