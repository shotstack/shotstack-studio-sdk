/** @jest-environment jsdom */
import { Timeline } from "@timeline/timeline";
import { AssetLoadTracker } from "@core/events/asset-load-tracker";
import { EventEmitter } from "@core/events/event-emitter";
import { sec } from "@core/timing/types";

it("updates a paused timeline on asset failure and recovery, with accessible help", async () => {
	const tracker = new AssetLoadTracker();
	const events = new EventEmitter();
	const source = "https://example.com/video.mp4";
	let loadError = { error: "Overlapping keyframes detected.", assetType: "svg" };
	const config = { timeline: { tracks: [{ clips: [{ id: "clip-1", asset: { type: "video", src: source }, start: 0, length: 5 }] }] } };
	const edit = {
		events,
		assetLoader: { loadTracker: tracker },
		getInternalEvents: () => events,
		getResolvedEdit: () => config,
		getEdit: () => config,
		isClipSelected: () => false,
		getClipGenerationState: () => undefined,
		getClipError: () => (tracker.registry[source]?.status === "failed" ? loadError : null),
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
	const animationBadge = container.querySelector<HTMLElement>(".ss-clip-error-badge");
	expect(animationBadge?.title).toContain("Animation keyframes overlap");
	expect(animationBadge?.hasAttribute("href")).toBe(false);
	expect(animationBadge?.tabIndex).toBe(0);
	expect(animationBadge?.getAttribute("aria-label")).toContain("Animation keyframes overlap");

	loadError = { error: `CORS may be blocking '${source}'.`, assetType: "video" };
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
	loadError = { error: "Failed to load SVG image", assetType: "svg" };
	tracker.emit("onAssetLoadInfoUpdated", { registry: tracker.registry });
	const svgBadge = container.querySelector<HTMLElement>(".ss-clip-error-badge");
	expect(svgBadge?.hasAttribute("href")).toBe(false);
	expect(svgBadge?.title).toContain(loadError.error);
	expect(svgBadge?.getAttribute("aria-label")).toContain(loadError.error);
	expect(container.querySelectorAll(".ss-clip-error-badge")).toHaveLength(1);
	tracker.registry[source] = { status: "success", progress: 1 };
	tracker.emit("onAssetLoadInfoUpdated", { registry: tracker.registry });
	expect(container.querySelector(".ss-clip-error-badge")).toBeNull();
	timeline.dispose();
	container.remove();
});

it.each([false, true])("clears generation failure styling on retry and success (media error: %s)", async mediaError => {
	const tracker = new AssetLoadTracker();
	const events = new EventEmitter();
	let generation: { status: "generating" | "failed"; error?: string } | undefined;
	let loadError: { error: string; assetType: string } | null = null;
	const config = {
		timeline: { tracks: [{ clips: [{ id: "clip-1", asset: { type: "image", prompt: "A forest", src: "" }, start: 0, length: 5 }] }] }
	};
	const edit = {
		events,
		assetLoader: { loadTracker: tracker },
		getInternalEvents: () => events,
		getResolvedEdit: () => config,
		getEdit: () => config,
		isClipSelected: () => false,
		getClipGenerationState: () => generation,
		getClipError: () => loadError,
		playbackTime: sec(0),
		totalDuration: sec(5),
		isPlaying: false
	};
	const container = document.createElement("div");
	document.body.appendChild(container);
	const timeline = new Timeline(edit as never, container);
	timeline.registerClipRenderer("image", {
		render: (clip, element) => {
			if ("src" in clip.asset && clip.asset.src) {
				element.classList.add("ss-clip--thumbnails");
				element.style.setProperty("background-image", `url("${clip.asset.src}")`);
			}
		}
	});
	try {
		await timeline.load();
		const element = container.querySelector<HTMLElement>(".ss-clip")!;
		generation = { status: "failed", error: "Generation failed." };
		events.emit("clip:generationFailed", { clipId: "clip-1", error: generation.error });
		expect(element.classList.contains("ss-clip--error")).toBe(true);
		expect(element.title).toBe("Generation failed.");

		loadError = mediaError ? { error: "Image failed to load.", assetType: "image" } : null;
		generation = { status: "generating" };
		events.emit("clip:generationStarted", { clipId: "clip-1" });
		expect(element.classList.contains("ss-clip--error")).toBe(mediaError);
		expect(element.getAttribute("aria-busy")).toBe("true");

		config.timeline.tracks[0].clips[0].asset.src = "https://example.com/generated.png";
		generation = undefined;
		events.emit("clip:generationCompleted", { clipId: "clip-1" });
		expect(element.classList.contains("ss-clip--error")).toBe(mediaError);
		expect(element.hasAttribute("aria-busy")).toBe(false);
		expect(element.classList.contains("ss-clip--thumbnails")).toBe(true);
		expect(element.style.backgroundImage).toContain("generated.png");
		expect(element.title).toBe("");
		if (mediaError) expect(element.querySelector(".ss-clip-error-badge")).not.toBeNull();
	} finally {
		timeline.dispose();
		container.remove();
	}
});
