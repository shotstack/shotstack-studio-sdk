/** @jest-environment jsdom */
import { Timeline } from "@timeline/timeline";
import { AssetLoadTracker } from "@core/events/asset-load-tracker";
import { EventEmitter } from "@core/events/event-emitter";
import { sec } from "@core/timing/types";

it("updates a paused timeline on asset failure and recovery, with accessible help", async () => {
	const tracker = new AssetLoadTracker();
	const events = new EventEmitter();
	const source = "https://example.com/video.mp4";
	const config = { timeline: { tracks: [{ clips: [{ id: "clip-1", asset: { type: "video", src: source }, start: 0, length: 5 }] }] } };
	const edit = {
		events,
		assetLoader: { loadTracker: tracker },
		getInternalEvents: () => events,
		getResolvedEdit: () => config,
		getEdit: () => config,
		isClipSelected: () => false,
		getClipGenerationState: () => undefined,
		getClipError: () => (tracker.registry[source]?.status === "failed" ? { error: `CORS may be blocking '${source}'.`, assetType: "video" } : null),
		playbackTime: sec(0),
		totalDuration: sec(5),
		isPlaying: false
	};
	const container = document.createElement("div");
	document.body.appendChild(container);
	const timeline = new Timeline(edit as never, container);
	timeline.registerClipRenderer("video", { render: () => {} });
	await timeline.load();
	tracker.registry[source] = { status: "failed", progress: 1 };
	tracker.emit("onAssetLoadInfoUpdated", { registry: tracker.registry });
	const badge = container.querySelector<HTMLAnchorElement>("a.ss-clip-error-badge");
	expect(badge).not.toBeNull();
	expect(badge?.getAttribute("aria-label")).toContain("preview");
	const onPointer = jest.fn();
	container.addEventListener("pointerdown", onPointer);
	badge?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
	expect(onPointer).not.toHaveBeenCalled();
	expect(badge?.title).toContain("CORS");
	const onContextMenu = jest.fn();
	container.addEventListener("contextmenu", onContextMenu);
	const contextMenu = new Event("contextmenu", { bubbles: true, cancelable: true });
	badge?.dispatchEvent(contextMenu);
	expect(onContextMenu).not.toHaveBeenCalled();
	expect(contextMenu.defaultPrevented).toBe(false);
	expect(badge?.href).toBe("https://t.shotstack.io/cors");
	expect(badge?.target).toBe("_blank");
	tracker.registry[source] = { status: "success", progress: 1 };
	tracker.emit("onAssetLoadInfoUpdated", { registry: tracker.registry });
	expect(container.querySelector(".ss-clip-error-badge")).toBeNull();
	timeline.dispose();
	container.remove();
});
