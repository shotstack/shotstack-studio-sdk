/** @jest-environment jsdom */

import { BakeQueue } from "@canvas/players/bake-queue";
import { Html5Player, bakeScaleFor, captureFramesInFlight, heldFrame } from "@canvas/players/html5-player";
import type { Edit } from "@core/edit-session";
import { EditEvent, InternalEvent } from "@core/events/edit-events";
import { sec } from "@core/timing/types";
import type { ResolvedClip } from "@schemas";

// Canvas rendering is unavailable in jsdom; the HTML5 DOM and state transitions stay real.
jest.mock("pixi.js", () => ({
	Matrix: jest.fn(),
	Sprite: jest.fn((texture: unknown) => ({ texture, destroy: jest.fn() })),
	Texture: {
		from: (source: { resource?: unknown; resolution?: number }) => ({
			source: source.resource ?? source,
			resolution: source.resolution,
			destroy: jest.fn()
		})
	}
}));
jest.mock("@canvas/players/player", () => ({
	Player: class {
		private resolvedTiming: { start: number; length: number };

		constructor(
			_edit: unknown,
			private clipConfiguration: { start: number; length: number }
		) {
			this.resolvedTiming = { start: clipConfiguration.start, length: clipConfiguration.length };
		}

		getLength() {
			return this.resolvedTiming.length;
		}

		getStart() {
			return this.resolvedTiming.start;
		}

		getEnd() {
			return this.resolvedTiming.start + this.resolvedTiming.length;
		}

		setResolvedTiming(timing: { start: number; length: number }) {
			this.resolvedTiming = { ...timing };
			this.clipConfiguration.start = timing.start;
			this.clipConfiguration.length = timing.length;
		}

		async load() {
			await Promise.resolve(this);
		}

		recordLoadError = jest.fn();

		update() {
			return this;
		}

		dispose() {
			return this;
		}
	},
	PlayerType: { Html5: "html5" }
}));
jest.mock("@shotstack/shotstack-canvas", () => ({
	Html5AssetSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
	composeHtml5IframeSrcdoc: jest.fn(() => "<html><body>Updated</body></html>"),
	computeHtml5FrameCount: jest.fn(({ clipLengthSeconds, fps }: { clipLengthSeconds: number; fps: number }) => ({
		frameCount: Math.ceil(clipLengthSeconds * fps)
	})),
	findHtml5IngestUrls: jest.fn(() => []),
	html5ClipLongestEdge: jest.fn(() => 1280),
	inlineHtml5IngestAssets: jest.fn()
}));
const canvasLib = jest.requireMock("@shotstack/shotstack-canvas") as {
	composeHtml5IframeSrcdoc: jest.Mock;
	computeHtml5FrameCount: jest.Mock;
	findHtml5IngestUrls: jest.Mock;
	html5ClipLongestEdge: jest.Mock;
	inlineHtml5IngestAssets: jest.Mock;
};
const INGEST_URL = "https://shotstack-ingest-api-v1-sources.s3.ap-southeast-2.amazonaws.com/owner/src/source.png";
const flush = (ms = 0) =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});
const until = async (condition: () => boolean, deadline = Date.now() + 2000): Promise<void> => {
	if (condition()) return;
	if (Date.now() > deadline) throw new Error(`timed out waiting for ${condition}`);
	await flush(5);
	await until(condition, deadline);
};

jest.mock("@canvas/players/html5-cache", () => ({
	computeHtml5CacheKey: jest.fn(async () => "content"),
	html5CacheGet: jest.fn(async () => null),
	html5CachePut: jest.fn(async () => undefined)
}));
const cacheLib = jest.requireMock("@canvas/players/html5-cache") as { html5CacheGet: jest.Mock };
jest.mock("@canvas/players/placeholder-graphic", () => ({
	createPlaceholderGraphic: () => ({ kind: "failed", destroy: jest.fn() }),
	createCaptureLoadingGraphic: () => ({ container: { kind: "loading", destroy: jest.fn() }, setProgress: jest.fn() })
}));

type PlayerHarness = {
	iframe: HTMLIFrameElement;
	contentHash: string;
	capturedHash: string | null;
	capturedFrames: Blob[] | null;
	clipConfiguration: { width?: number; height?: number };
	contentContainer: { children: unknown[] };
	captureIframeAsForeignObjectSvg(width: number, height: number, iframe?: HTMLIFrameElement | null): string;
	captureInFlight: Promise<Blob[] | null> | null;
	captureFrames(minScale?: number): Promise<Blob[] | null>;
	runCapture(minScale?: number): Promise<Blob[] | null>;
	seekHarness(seconds: number, win?: Window | null): void;
	hashAsset(): Promise<string>;
	beginCapture(): void;
	renderStill(seconds: number): Promise<unknown>;
	transitionToPlayback(): Promise<void>;
	transitionToFailed(): void;
	bakingFrames: Array<Blob | undefined> | null;
	reloadAsset(): Promise<void>;
};

function createPlayer() {
	const events = { emit: jest.fn() };
	const edit = {
		size: { width: 1080, height: 1920 },
		isPlaying: false,
		playbackTime: 0,
		getHtml5Prerender: () => "on-load",
		getInternalEvents: () => events,
		getResolvedEdit: () => ({ output: { resolution: "hd" } }),
		getCanvas: () => null
	};
	const clip = { id: "background", start: 0, length: 60, asset: { type: "html5", html: "<div>Background</div>" } };
	const player = new Html5Player(edit as unknown as Edit, clip as ResolvedClip);
	const iframe = document.createElement("iframe");
	document.body.appendChild(iframe);
	const children: unknown[] = [];
	Object.assign(player, {
		edit,
		clipConfiguration: clip,
		clipId: clip.id,
		iframe,
		contentHash: "original",
		contentContainer: {
			children,
			addChild: (child: unknown) => children.push(child),
			addChildAt: (child: unknown, index: number) => children.splice(index, 0, child),
			removeChild: (child: unknown) => children.splice(children.indexOf(child), 1),
			getGlobalTransform: () => ({ a: 1, b: 0, c: 0, d: 1 })
		},
		configureKeyframes: jest.fn(),
		isActive: () => true,
		getPlaybackTime: () => 0
	});
	return { player, harness: player as unknown as PlayerHarness, iframe, events, edit };
}

afterEach(() => {
	jest.restoreAllMocks();
	jest.clearAllMocks();
	jest.useRealTimers();
	document.body.replaceChildren();
});

it.each([
	["mounting in an on-load edit", { mode: "editing" }, "on-load", "pending"],
	["capturing", { mode: "capturing" }, "on-load", "pending"],
	["stale after a content or length change", { mode: "stale" }, "on-load", "pending"],
	["playing baked frames, even during a sharper re-bake", { mode: "playback", rebakeStarted: true }, "on-load", "ready"],
	["an on-play edit before its play", { mode: "editing" }, "on-play", null],
	["an on-play edit once its bake is triggered", { mode: "editing", hasTriggeredCapture: true }, "on-play", "pending"]
])("reports playback readiness when %s", (_, state, prerender, expected) => {
	const { player, edit } = createPlayer();
	Object.assign(edit, { getHtml5Prerender: () => prerender });
	Object.assign(player, state);

	expect(player.getPlaybackReadiness()).toBe(expected);
});

it.each([
	["baking", { mode: "capturing", captureFramesDone: 30, captureFramesTotal: 60 }, 0.5],
	["queued behind another clip's bake", { mode: "capturing", captureFramesDone: 0, captureFramesTotal: 0 }, 0],
	["ready", { mode: "playback" }, 1]
])("reports its bake progress when %s", (_, state, expected) => {
	const { player } = createPlayer();
	Object.assign(player, state);

	expect(player.getCaptureProgress()).toBe(expected);
});

it("starts a new bake's progress from zero", () => {
	const { player, harness } = createPlayer();
	Object.assign(player, { mode: "stale", captureFramesDone: 60, captureFramesTotal: 60 });
	jest.spyOn(harness, "captureFrames").mockImplementation(() => new Promise(() => {}));

	harness.beginCapture();

	expect(player.getCaptureProgress()).toBe(0);
});

it("reports ready once its frames are adopted, before playback takes over", () => {
	const { player, harness } = createPlayer();
	Object.assign(player, { mode: "capturing", capturedScale: 1 });
	harness.capturedFrames = [new Blob(["baked 0"])];
	harness.capturedHash = `${harness.contentHash}@1`;

	expect(player.getPlaybackReadiness()).toBe("ready");
});

// A listener that redraws on the failure must already see the clip as failed.
function readinessWhenFailureAnnounced(player: Html5Player, events: { emit: jest.Mock }): unknown[] {
	const seen: unknown[] = [];
	events.emit.mockImplementation((name: string) => {
		if (name === EditEvent.ClipCaptureFailed) seen.push(player.getPlaybackReadiness());
	});
	return seen;
}

it.each([
	["a bake that throws", (harness: PlayerHarness) => jest.spyOn(harness, "captureFrames").mockRejectedValue(new Error("bake failed"))],
	["a bake that yields no frames", (harness: PlayerHarness) => jest.spyOn(harness, "captureFrames").mockResolvedValue(null)]
])("announces %s only once the clip reports no readiness", async (_, fail) => {
	const { player, harness, events } = createPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	const seen = readinessWhenFailureAnnounced(player, events);
	fail(harness);

	harness.beginCapture();
	await until(() => seen.length === 1);

	expect(seen).toEqual([null]);
});

it("announces a failed reload only once the clip reports no readiness", async () => {
	const { player, harness, events } = createPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	jest.spyOn(harness, "hashAsset").mockResolvedValue("updated");
	canvasLib.findHtml5IngestUrls.mockReturnValueOnce([INGEST_URL]);
	canvasLib.inlineHtml5IngestAssets.mockRejectedValueOnce(new Error("ingest failed"));
	const seen = readinessWhenFailureAnnounced(player, events);

	await player.reloadAsset();

	expect(seen).toEqual([null]);
});

it("reports no playback readiness after a failed bake", () => {
	const { player, harness } = createPlayer();
	harness.transitionToFailed();

	expect(player.getPlaybackReadiness()).toBeNull();
});

it("ignores a capture decode failure after its content has been replaced", async () => {
	const { harness, events } = createPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	harness.capturedFrames = [new Blob()];
	harness.capturedHash = `${harness.contentHash}@1`;
	jest.spyOn(harness, "transitionToPlayback").mockRejectedValue(new Error("decode failed"));

	harness.beginCapture();
	harness.contentHash = "updated";
	await Promise.resolve();

	expect(events.emit).not.toHaveBeenCalledWith(EditEvent.ClipCaptureFailed, expect.anything());
	expect(harness.contentContainer.children).toHaveLength(0);
});

it("ignores an older iframe timeout while newer content is loading", async () => {
	jest.useFakeTimers();
	const { player, harness, iframe, events } = createPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	jest.spyOn(harness, "hashAsset").mockResolvedValueOnce("older").mockResolvedValueOnce("newer");
	jest.spyOn(harness, "captureFrames").mockImplementation(() => new Promise(() => {}));

	const older = player.reloadAsset();
	await Promise.resolve();
	jest.advanceTimersByTime(5000);
	const newer = player.reloadAsset();
	await Promise.resolve();
	jest.advanceTimersByTime(5000);
	await older;
	iframe.dispatchEvent(new Event("load"));
	await newer;

	expect(events.emit).not.toHaveBeenCalledWith(EditEvent.ClipCaptureFailed, expect.anything());
	expect(harness.contentContainer.children).toEqual([expect.objectContaining({ kind: "loading" })]);
});

// A page animated only by a style block in its markup has frames to capture, as it does in the render.
it("counts frames from the page's markup when keying and capturing it", async () => {
	const { player, harness, iframe } = createPlayer();
	Object.assign(player, { getLength: () => 1 });
	jest.spyOn(harness, "seekHarness").mockImplementation(() => {
		throw new Error("stop after first seek");
	});

	await harness.hashAsset();
	const capture = harness.captureFrames();
	await until(() => iframe.srcdoc === "<html><body>Updated</body></html>");
	iframe.dispatchEvent(new Event("load"));
	await expect(capture).rejects.toThrow("stop after first seek");

	const counted = canvasLib.computeHtml5FrameCount.mock.calls.map(([args]) => args.htmlContent);
	expect(counted).toEqual(["<div>Background</div>", "<div>Background</div>"]);
});

it("captures from a freshly loaded document rather than the live-edited one", async () => {
	const { player, harness, iframe } = createPlayer();
	Object.assign(player, { getLength: () => 1 });
	iframe.srcdoc = "<html><body>Scrubbed</body></html>";
	const steps: string[] = [];
	iframe.addEventListener("load", () => steps.push("load"));
	jest.spyOn(harness, "seekHarness").mockImplementation(() => {
		steps.push(`seek ${iframe.srcdoc}`);
		throw new Error("stop after first seek");
	});

	const capture = harness.captureFrames();
	await until(() => iframe.srcdoc === "<html><body>Updated</body></html>");
	iframe.dispatchEvent(new Event("load"));

	await expect(capture).rejects.toThrow("stop after first seek");
	expect(steps.at(-1)).toBe("seek <html><body>Updated</body></html>");
	expect(steps.indexOf("load")).toBeLessThan(steps.length - 1);
});

it("captures inline SVG backgrounds and CSS metacharacters as valid XML without changing their contents", () => {
	const { harness, iframe } = createPlayer();
	const doc = iframe.contentDocument!;
	const css = `.grain{background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22><rect/></svg>')} .label::before{content:'A & B < C ]]> D'}`;
	const style = doc.createElement("style");
	style.textContent = css;
	doc.head.appendChild(style);
	doc.body.innerHTML = "<div class='grain'>A &amp; B</div>";

	const svg = harness.captureIframeAsForeignObjectSvg(1080, 1920);
	const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");

	expect(parsed.querySelector("parsererror")).toBeNull();
	expect(parsed.querySelector("style")?.textContent).toBe(css);
	expect(parsed.querySelector("body")?.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
	expect(parsed.querySelector(".grain")?.textContent).toBe("A & B");
	expect(doc.head.querySelector("style")?.textContent).toBe(css);
});

it("leaves scripts out of the capture so their source can't break the frame", () => {
	const { harness, iframe } = createPlayer();
	const doc = iframe.contentDocument!;
	const script = doc.createElement("script");
	script.textContent = 'const unit = "\u0001";';
	doc.body.replaceChildren(script, Object.assign(doc.createElement("div"), { className: "title", textContent: "Shown" }));

	const parsed = new DOMParser().parseFromString(harness.captureIframeAsForeignObjectSvg(1080, 1920), "image/svg+xml");

	expect(parsed.querySelector("parsererror")).toBeNull();
	expect(parsed.querySelector("script")).toBeNull();
	expect(parsed.querySelector(".title")?.textContent).toBe("Shown");
	expect(doc.body.querySelector("script")).not.toBeNull();
});

it("paints canvas pixels into the capture as the canvas's own background", () => {
	const { harness, iframe } = createPlayer();
	const doc = iframe.contentDocument!;
	const canvas = doc.createElement("canvas");
	canvas.setAttribute("style", "border: 4px solid gold;");
	doc.body.replaceChildren(canvas);
	jest.spyOn(Object.getPrototypeOf(canvas) as HTMLCanvasElement, "toDataURL").mockReturnValue("data:image/png;base64,AAAA");

	const parsed = new DOMParser().parseFromString(harness.captureIframeAsForeignObjectSvg(1080, 1920), "image/svg+xml");
	const style = parsed.querySelector("canvas")?.getAttribute("style") ?? "";

	expect(style).toMatch(/background-image: url\("?data:image\/png;base64,AAAA"?\)/);
	expect(style).toContain("background-size: 100% 100%");
	expect(style).toContain("border: 4px solid gold");
	expect(canvas.getAttribute("style")).toBe("border: 4px solid gold;");
});

it("keeps a failed capture inside its canvas layer and retries only after the asset changes", async () => {
	const { player, harness, iframe, events, edit } = createPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	const capture = jest.spyOn(harness, "captureFrames").mockRejectedValue(new Error("The source image cannot be decoded."));

	harness.beginCapture();
	await new Promise(resolve => {
		setTimeout(resolve, 0);
	});
	player.update(0, 0);
	edit.isPlaying = true;
	player.update(0, 0);
	player.update(0, 0);
	await player.prepareStaticRender();

	expect(capture).toHaveBeenCalledTimes(1);
	expect(harness.contentContainer.children).toEqual([expect.objectContaining({ kind: "failed" })]);
	expect(events.emit).toHaveBeenCalledWith(EditEvent.ClipCaptureFailed, expect.objectContaining({ fallback: "static-placeholder" }));

	jest.spyOn(harness, "hashAsset").mockResolvedValue("updated");
	capture.mockImplementation(() => new Promise(() => {}));
	const reload = player.reloadAsset();
	await Promise.resolve();
	iframe.dispatchEvent(new Event("load"));
	await reload;

	expect(capture).toHaveBeenCalledTimes(2);
	expect(harness.contentContainer.children).toEqual([expect.objectContaining({ kind: "loading" })]);
});

it("composes the page from ingest files inlined for the clip's size", async () => {
	const { player, harness, iframe } = createPlayer();
	const inlined = { type: "html5", html: '<img src="data:image/webp;base64,AAAA">' };
	canvasLib.findHtml5IngestUrls.mockReturnValueOnce([INGEST_URL]);
	canvasLib.inlineHtml5IngestAssets.mockResolvedValueOnce(inlined);
	canvasLib.composeHtml5IframeSrcdoc.mockClear();
	jest.spyOn(harness, "hashAsset").mockResolvedValue("updated");
	jest.spyOn(harness, "beginCapture").mockImplementation(() => {});

	const reload = player.reloadAsset();
	await flush();
	iframe.dispatchEvent(new Event("load"));
	await reload;

	expect(canvasLib.html5ClipLongestEdge).toHaveBeenCalledWith(expect.objectContaining({ id: "background" }), { resolution: "hd" });
	expect(canvasLib.inlineHtml5IngestAssets).toHaveBeenCalledWith(expect.objectContaining({ type: "html5" }), 1280);
	expect(canvasLib.composeHtml5IframeSrcdoc).toHaveBeenCalledWith(inlined);
});

it("marks the clip failed when an ingest file can't be inlined", async () => {
	const { player, harness, events } = createPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	canvasLib.findHtml5IngestUrls.mockReturnValueOnce([INGEST_URL]);
	canvasLib.inlineHtml5IngestAssets.mockRejectedValueOnce(new Error(`html5 asset file not found: ${INGEST_URL}`));
	jest.spyOn(harness, "hashAsset").mockResolvedValue("updated");

	await player.reloadAsset();

	expect(events.emit).toHaveBeenCalledWith(
		EditEvent.ClipCaptureFailed,
		expect.objectContaining({ error: `html5 asset file not found: ${INGEST_URL}` })
	);
});

it("keeps the newer page when an older reload finishes inlining last", async () => {
	const { player, harness, iframe } = createPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	jest.spyOn(harness, "hashAsset").mockResolvedValueOnce("older").mockResolvedValueOnce("newer");
	jest.spyOn(harness, "beginCapture").mockImplementation(() => {});
	let finishOlder: (asset: unknown) => void = () => {};
	canvasLib.findHtml5IngestUrls.mockReturnValueOnce([INGEST_URL]).mockReturnValueOnce([]);
	canvasLib.inlineHtml5IngestAssets.mockReturnValueOnce(
		new Promise(resolve => {
			finishOlder = resolve;
		})
	);
	canvasLib.composeHtml5IframeSrcdoc.mockReturnValueOnce("<p>newer</p>").mockReturnValueOnce("<p>older</p>");

	const older = player.reloadAsset();
	await flush();
	const newer = player.reloadAsset();
	await flush();
	iframe.dispatchEvent(new Event("load"));
	await newer;
	finishOlder({ type: "html5", html: "older" });
	await older;

	expect(iframe.srcdoc).toBe("<p>newer</p>");
});

it("marks the clip failed when an ingest file can't be inlined at mount", async () => {
	const { player, harness, events, edit } = createPlayer();
	Object.assign(edit, { getOutputFps: () => 30 });
	jest.spyOn(harness, "hashAsset").mockResolvedValue("mounted");
	jest.spyOn(console, "error").mockImplementation(() => {});
	const recordLoadError = jest.spyOn(player as unknown as { recordLoadError(e: unknown): void }, "recordLoadError");
	Object.assign(player, { createFallbackGraphic: jest.fn() });
	canvasLib.findHtml5IngestUrls.mockReturnValueOnce([INGEST_URL]);
	canvasLib.inlineHtml5IngestAssets.mockRejectedValueOnce(new Error(`html5 asset file not found: ${INGEST_URL}`));

	await player.load();

	expect(recordLoadError).toHaveBeenCalledWith(expect.objectContaining({ message: `html5 asset file not found: ${INGEST_URL}` }));
	expect(events.emit).toHaveBeenCalledWith(
		EditEvent.ClipCaptureFailed,
		expect.objectContaining({ error: `html5 asset file not found: ${INGEST_URL}` })
	);
});

it("recovers a clip whose ingest file failed at mount once the asset changes", async () => {
	const { player, harness, events, edit } = createPlayer();
	Object.assign(edit, { getOutputFps: () => 30, getCanvas: () => null });
	Object.assign(player, { iframe: null });
	jest.spyOn(harness, "hashAsset").mockResolvedValueOnce("broken").mockResolvedValueOnce("fixed");
	jest.spyOn(harness, "beginCapture").mockImplementation(() => {});
	jest.spyOn(console, "error").mockImplementation(() => {});
	jest
		.spyOn(player as unknown as { recordLoadError(e: unknown): void }, "recordLoadError")
		.mockImplementation(error => Object.assign(player, { loadError: (error as Error).message }));
	canvasLib.findHtml5IngestUrls.mockReturnValueOnce([INGEST_URL]).mockReturnValueOnce([INGEST_URL]);
	canvasLib.inlineHtml5IngestAssets
		.mockRejectedValueOnce(new Error(`html5 asset file not found: ${INGEST_URL}`))
		.mockResolvedValueOnce({ type: "html5", html: "fixed" });

	await player.load();
	expect(player.loadError).toBe(`html5 asset file not found: ${INGEST_URL}`);

	await player.reloadAsset();

	expect(player.loadError).toBeNull();
	expect(harness.iframe?.isConnected).toBe(true);
	expect(harness.contentContainer.children).toEqual([]);
	expect(events.emit.mock.calls.filter(([name]) => name === EditEvent.ClipCaptureFailed)).toHaveLength(1);
});

it("applies an asset change made during a slow mount to the one mounted iframe", async () => {
	const { player, harness, edit } = createPlayer();
	Object.assign(edit, { getOutputFps: () => 30, getCanvas: () => null });
	Object.assign(player, { iframe: null });
	jest.spyOn(harness, "hashAsset").mockResolvedValueOnce("mounted").mockResolvedValueOnce("changed");
	jest.spyOn(harness, "beginCapture").mockImplementation(() => {});
	let finishMount: (asset: unknown) => void = () => {};
	canvasLib.findHtml5IngestUrls.mockReturnValueOnce([INGEST_URL]);
	canvasLib.inlineHtml5IngestAssets.mockReturnValueOnce(
		new Promise(resolve => {
			finishMount = resolve;
		})
	);
	canvasLib.composeHtml5IframeSrcdoc.mockReturnValueOnce("<p>mounted</p>").mockReturnValueOnce("<p>changed</p>");

	const load = player.load();
	await flush();
	const reload = player.reloadAsset();
	await flush();
	finishMount({ type: "html5", html: "mounted" });
	await load;
	await flush();
	harness.iframe.dispatchEvent(new Event("load"));
	await reload;

	expect(document.querySelectorAll("iframe")).toHaveLength(2);
	expect(harness.iframe.srcdoc).toBe("<p>changed</p>");
});

it("mounts no iframe for a player disposed while its ingest files load", async () => {
	const { player, harness, edit } = createPlayer();
	Object.assign(edit, { getOutputFps: () => 30, getCanvas: () => null });
	Object.assign(player, { iframe: null });
	jest.spyOn(harness, "hashAsset").mockResolvedValue("mounted");
	let finishInline: (asset: unknown) => void = () => {};
	canvasLib.findHtml5IngestUrls.mockReturnValueOnce([INGEST_URL]);
	canvasLib.inlineHtml5IngestAssets.mockReturnValueOnce(
		new Promise(resolve => {
			finishInline = resolve;
		})
	);

	const load = player.load();
	await flush();
	Object.assign(player, { disposed: true });
	finishInline({ type: "html5", html: "late" });
	await load;

	expect(document.querySelectorAll("iframe")).toHaveLength(1);
	expect(harness.iframe).toBeNull();
});

it("leaves an in-flight capture's page alone when a reload finishes inlining later", async () => {
	const { player, harness, iframe, edit } = createPlayer();
	jest.spyOn(harness, "hashAsset").mockResolvedValue("updated");
	const beginCapture = jest.spyOn(harness, "beginCapture");
	jest.spyOn(harness, "renderStill").mockResolvedValue(null);
	const runCapture = jest.spyOn(harness as unknown as { runCapture(): Promise<Blob[] | null> }, "runCapture").mockImplementation(() => {
		iframe.srcdoc = "<p>capture</p>";
		return new Promise(() => {});
	});
	let finishReload: (asset: unknown) => void = () => {};
	canvasLib.findHtml5IngestUrls.mockReturnValueOnce([INGEST_URL]);
	canvasLib.inlineHtml5IngestAssets.mockReturnValueOnce(
		new Promise(resolve => {
			finishReload = resolve;
		})
	);

	const reload = player.reloadAsset();
	await flush();
	edit.isPlaying = true;
	player.update(0, 0);
	await flush();
	finishReload({ type: "html5", html: "reloaded" });
	await flush();
	iframe.dispatchEvent(new Event("load"));
	await reload;
	await until(() => runCapture.mock.calls.length === 1);

	expect(iframe.srcdoc).toBe("<p>capture</p>");
	expect(beginCapture).toHaveBeenCalledTimes(1);
});

type StaticSprite = { texture: { source: { blob: Blob }; destroy: jest.Mock } };

// jsdom's Blob has no text(), and a frame's bytes are the URI-encoded markup it was drawn from.
const frameMarkup = (blob: Blob) =>
	new Promise<string>(resolve => {
		const reader = new FileReader();
		reader.onload = () => resolve(decodeURIComponent(reader.result as string));
		reader.readAsText(blob);
	});

// jsdom never navigates to a srcdoc and can't decode or draw images. These stand-ins load a fresh page for
// every srcdoc written, and rasterise a frame as the markup it was drawn from.
function createStillPlayer() {
	const created = createPlayer();
	Object.assign(created.edit, { getCanvas: () => null });
	Object.assign(created.player, { getLength: () => 2, captureFps: 30 });
	jest.spyOn(HTMLIFrameElement.prototype, "srcdoc", "set").mockImplementation(function navigate(this: HTMLIFrameElement) {
		setTimeout(() => {
			const doc = this.contentDocument!;
			doc.body = doc.createElement("body");
			this.dispatchEvent(new Event("load"));
		}, 0);
	});
	Object.assign(HTMLImageElement.prototype, { decode: async () => undefined });
	Object.assign(globalThis, { createImageBitmap: async (blob: Blob) => ({ blob, close: jest.fn() }) });
	let drawn = "";
	jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		drawImage: (img: HTMLImageElement) => {
			drawn = img.src;
		}
	} as never);
	jest.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(done => {
		const bytes = Uint8Array.from(drawn, c => c.charCodeAt(0));
		done({ arrayBuffer: async () => bytes.buffer } as unknown as Blob);
	});
	const result = { ...created, seeks: [] as string[], onSeek: null as ((seek: string) => void) | null };
	// A seek writes its time into the page. A rewind marks it, the way a rewound tween leaves its start values inline.
	jest.spyOn(created.harness, "seekHarness").mockImplementation((seconds, win = created.iframe.contentWindow) => {
		const { body } = win!.document;
		if (seconds < Number(body.getAttribute("data-t") ?? 0)) body.setAttribute("data-rewound", "");
		body.setAttribute("data-t", String(seconds));
		body.textContent = `t=${seconds}`;
		const seek = `${win === created.iframe.contentWindow ? "bake" : "still"} ${seconds}`;
		result.seeks.push(seek);
		result.onSeek?.(seek);
	});
	return result;
}

it("announces bake progress in 5% steps, not on every frame", async () => {
	const { harness, events } = createStillPlayer(); // 2 s at 30 fps: 60 frames

	await harness.runCapture();

	const steps = events.emit.mock.calls.filter(([name]) => name === InternalEvent.CaptureProgressChanged);
	expect(steps).toHaveLength(20);
	expect(steps[0][1]).toEqual({ clipId: "background" });
});

it("renders a still from its own page without waiting for the clip's capture", async () => {
	const { player, harness, iframe } = createStillPlayer();
	Object.assign(player, { getLength: () => 60, getPlaybackTime: () => 12.5 });
	jest.spyOn(harness, "captureFrames").mockImplementation(() => new Promise(() => {}));
	const serialise = jest.spyOn(harness, "captureIframeAsForeignObjectSvg");
	harness.beginCapture();

	await player.prepareStaticRender();

	const [sprite, loading] = harness.contentContainer.children as [StaticSprite, { visible?: boolean }];
	expect(serialise).toHaveBeenCalledTimes(1);
	expect(serialise.mock.calls[0][2]).not.toBe(iframe);
	expect(await frameMarkup(sprite.texture.source.blob)).toContain(">t=12.5<");
	expect(loading.visible).toBe(false);
	player.endStaticRender();
	expect(loading.visible).toBe(true);
});

it("counts frames from the page's markup when rendering a still", async () => {
	const { player, harness } = createStillPlayer();
	jest.spyOn(harness, "captureFrames").mockImplementation(() => new Promise(() => {}));
	harness.beginCapture();

	await player.prepareStaticRender();
	player.endStaticRender();

	expect(canvasLib.computeHtml5FrameCount).toHaveBeenCalledWith(expect.objectContaining({ htmlContent: "<div>Background</div>" }));
});

it("takes a still from captured frames, in memory or cached, without rendering one", async () => {
	const { player, harness } = createStillPlayer();
	Object.assign(player, { getPlaybackTime: () => 1 });
	const serialise = jest.spyOn(harness, "captureIframeAsForeignObjectSvg");
	cacheLib.html5CacheGet.mockResolvedValueOnce({ pngs: [new Blob(["cached 0"]), new Blob(["cached 1"])], fps: 1, frameCount: 2 });

	await player.prepareStaticRender();
	const cached = harness.contentContainer.children[0] as StaticSprite;
	expect(await frameMarkup(cached.texture.source.blob)).toBe("cached 1");
	player.endStaticRender();

	harness.capturedFrames = [new Blob(["baked 0"]), new Blob(["baked 1"])];
	harness.capturedHash = `${harness.contentHash}@1`;
	await player.prepareStaticRender();
	const baked = harness.contentContainer.children[0] as StaticSprite;
	expect(await frameMarkup(baked.texture.source.blob)).toBe("baked 1");
	player.endStaticRender();

	expect(serialise).not.toHaveBeenCalled();
	expect(document.querySelectorAll("iframe")).toHaveLength(1);
	expect(cached.texture.destroy).toHaveBeenCalled();
	expect(baked.texture.destroy).not.toHaveBeenCalled();
});

it("keeps a still taken mid-capture and the capture from changing each other's frames", async () => {
	const setup = createStillPlayer();
	const { player, harness, seeks } = setup;
	Object.assign(player, { getPlaybackTime: () => 1.5 });
	await player.prepareStaticRender();
	player.endStaticRender();

	// Partway through the capture, take a still from before both the capture's frame and the last still's.
	let still: Promise<void> = Promise.resolve();
	setup.onSeek = seek => {
		if (seek !== `bake ${8 / 30}`) return;
		Object.assign(player, { getPlaybackTime: () => 0.1 });
		still = player.prepareStaticRender();
	};
	const frames = await harness.runCapture();
	await still;

	const markup = await Promise.all(frames!.map(frameMarkup));
	expect(markup.map(frame => /data-t="([^"]*)"/.exec(frame)?.[1])).toEqual(Array.from({ length: 60 }, (_, i) => String(i / 30)));
	expect(markup.join("")).not.toContain("data-rewound");
	const stillMarkup = await frameMarkup((harness.contentContainer.children[0] as StaticSprite).texture.source.blob);
	expect(stillMarkup).toContain(">t=0.1<");
	expect(stillMarkup).not.toContain("data-rewound");
	expect(seeks.indexOf("still 0.1")).toBeLessThan(seeks.indexOf(`bake ${59 / 30}`));
});

it("bakes from the playhead to the clip's end, then from a fresh page up to the playhead", async () => {
	const { harness, edit, iframe, seeks } = createStillPlayer(); // 2 s at 30 fps: 60 frames
	Object.assign(edit, { playbackTime: 1 });
	const loads = jest.spyOn(HTMLIFrameElement.prototype, "srcdoc", "set");
	loads.mockClear();

	const frames = (await harness.runCapture())!;

	const order = [...Array.from({ length: 30 }, (_, i) => 30 + i), ...Array.from({ length: 30 }, (_, i) => i)];
	expect(seeks.filter(seek => seek.startsWith("bake"))).toEqual(order.map(i => `bake ${i / 30}`));
	expect(loads.mock.contexts.filter(context => context === iframe)).toHaveLength(2);
	const markup = await Promise.all(frames.map(frameMarkup));
	expect(markup.map(frame => /data-t="([^"]*)"/.exec(frame)?.[1])).toEqual(Array.from({ length: 60 }, (_, i) => String(i / 30)));
	expect(markup.some(frame => frame.includes("data-rewound"))).toBe(false);
});

it("draws a frame only when the page changed, reusing the last frame's blob", async () => {
	const { harness } = createStillPlayer(); // 2 s at 30 fps: 60 frames
	const seek = jest.mocked(harness.seekHarness);
	const write = seek.getMockImplementation()!;
	seek.mockImplementation((seconds, win) => write(Math.min(seconds, 0.5), win));
	const toBlob = jest.mocked(HTMLCanvasElement.prototype.toBlob);
	toBlob.mockClear();

	const frames = (await harness.runCapture())!;

	expect(frames).toHaveLength(60);
	expect(toBlob).toHaveBeenCalledTimes(16);
	expect(frames[59]).toBe(frames[15]);
	expect(await frameMarkup(frames[59])).toContain('data-t="0.5"');
});

it("draws each frame of a looping page once, reusing it every time the loop comes round", async () => {
	const { harness, iframe } = createStillPlayer(); // 2 s at 30 fps: 60 frames
	jest.mocked(harness.seekHarness).mockImplementation((seconds, win = iframe.contentWindow) => {
		const { body } = win!.document;
		body.textContent = `phase=${Math.round(seconds * 30) % 15}`;
	});
	const toBlob = jest.mocked(HTMLCanvasElement.prototype.toBlob);
	toBlob.mockClear();

	const frames = (await harness.runCapture())!;

	expect(toBlob).toHaveBeenCalledTimes(15);
	expect(frames[45]).toBe(frames[0]);
	expect(frames[59]).toBe(frames[14]);
	expect(await frameMarkup(frames[59])).toContain(">phase=14<");
});

it("shares no frame between pages that differ only in their styles", async () => {
	const { harness, iframe } = createStillPlayer(); // 2 s at 30 fps: 60 frames
	jest.mocked(harness.seekHarness).mockImplementation((seconds, win = iframe.contentWindow) => {
		const doc = win!.document;
		const style = doc.querySelector("style") ?? doc.head.appendChild(doc.createElement("style"));
		style.textContent = seconds >= 2 / 3 && seconds < 4 / 3 ? ".b{}" : ".a{}";
		doc.body.textContent = "same";
	});

	const frames = (await harness.runCapture())!;

	expect(await frameMarkup(frames[30])).toContain(".b{}");
	expect(await frameMarkup(frames[59])).toContain(".a{}");
	expect(frames[59]).not.toBe(frames[30]);
});

it.each([
	[undefined, 4],
	[2, 4],
	[4, 4],
	[8, 8],
	[10, 10],
	[32, 16]
])("keeps frames in flight for %p logical cores: %p", (cores, expected) => {
	expect(captureFramesInFlight(cores, 1920 * 1080 * 4)).toBe(expected);
});

it("caps frames in flight so their canvases fit in 256 MiB", () => {
	expect(captureFramesInFlight(16, 3840 * 2160 * 4)).toBe(8);
});

const holdToBlob = () => {
	const toBlob = jest.mocked(HTMLCanvasElement.prototype.toBlob);
	const draw = toBlob.getMockImplementation()!;
	const held: Array<() => void> = [];
	// The stand-in encodes whatever was drawn last, so each frame is encoded as it is held.
	toBlob.mockImplementation(function hold(this: HTMLCanvasElement, done, ...rest) {
		draw.call(this, blob => held.push(() => done(blob)), ...rest);
	});
	const releaseAll = () => {
		toBlob.mockImplementation(draw);
		held.splice(0).forEach(release => release());
	};
	return { held, releaseAll };
};

it.each([
	[100, 100, 12, 12],
	[3840, 2160, 16, 8]
])("draws ahead of the oldest unfinished frame up to the in-flight limit at %ix%i on %i cores: %i", async (width, height, cores, inFlight) => {
	const { harness } = createStillPlayer();
	Object.assign(harness, { renderedWidth: width, renderedHeight: height });
	jest.spyOn(Navigator.prototype, "hardwareConcurrency", "get").mockReturnValue(cores);
	const { held, releaseAll } = holdToBlob();

	const capture = harness.runCapture();
	await until(() => held.length >= inFlight);
	await flush(100); // a window that overdraws would draw its extra frame within a frame or two
	expect(held).toHaveLength(inFlight);
	held.shift()!();
	await until(() => held.length >= inFlight);
	await flush(100);
	expect(held).toHaveLength(inFlight);

	releaseAll();
	const frames = (await capture)!;
	expect(frames).toHaveLength(60);
	const markup = await Promise.all(frames.map(frameMarkup));
	expect(markup.map(frame => /data-t="([^"]*)"/.exec(frame)?.[1])).toEqual(Array.from({ length: 60 }, (_, i) => String(i / 30)));
});

const sliceEveryFrame = () => {
	let clock = 0;
	jest.spyOn(performance, "now").mockImplementation(() => {
		clock += 13;
		return clock;
	});
};

const sharedInFlight = () => (Html5Player as unknown as { inFlight: { frames: number; bytes: number } }).inFlight;

it("publishes frames and progress while later frames still draw", async () => {
	const { harness, events } = createStillPlayer(); // 2 s at 30 fps: 60 frames
	Object.assign(harness, { mode: "capturing" });
	sliceEveryFrame();
	const steps = () => events.emit.mock.calls.filter(([name]) => name === InternalEvent.CaptureProgressChanged).length;
	let atLastSeek = { landed: 0, steps: 0 };
	const record = jest.mocked(harness.seekHarness).getMockImplementation()!;
	jest.mocked(harness.seekHarness).mockImplementation((seconds, win) => {
		record(seconds, win);
		if (seconds === 59 / 30) atLastSeek = { landed: harness.bakingFrames!.filter(Boolean).length, steps: steps() };
	});

	await harness.runCapture();

	expect(atLastSeek.landed).toBeGreaterThan(30);
	expect(atLastSeek.steps).toBeGreaterThan(10);
});

it("waits for another bake's frames to leave the window before drawing its own", async () => {
	const { harness } = createStillPlayer();
	Object.assign(harness, { renderedWidth: 3840, renderedHeight: 2160 });
	jest.spyOn(Navigator.prototype, "hardwareConcurrency", "get").mockReturnValue(16);
	Object.assign(sharedInFlight(), { frames: 8, bytes: 8 * 3840 * 2160 * 4 });
	let waits = 0;
	jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
		waits += 1;
		if (waits === 5) Object.assign(sharedInFlight(), { frames: 0, bytes: 0 });
		setTimeout(() => callback(0), 0);
		return 0;
	});

	expect(await harness.runCapture()).toHaveLength(60);
	expect(waits).toBeGreaterThanOrEqual(5);
	expect(sharedInFlight()).toEqual({ frames: 0, bytes: 0 });
});

it("releases its share of the in-flight window when disposed mid-bake", async () => {
	const { player, harness } = createStillPlayer();
	const { held, releaseAll } = holdToBlob();
	const capture = harness.runCapture();
	await until(() => held.length > 0);

	player.dispose();
	releaseAll();
	await capture;
	await flush();

	expect(sharedInFlight()).toEqual({ frames: 0, bytes: 0 });
});

it("returns no frames when the content changes while frames are in flight", async () => {
	const { harness } = createStillPlayer();
	jest.spyOn(Navigator.prototype, "hardwareConcurrency", "get").mockReturnValue(4);
	const { held, releaseAll } = holdToBlob();

	const capture = harness.runCapture();
	await until(() => held.length >= 4);
	harness.contentHash = "changed";
	releaseAll();

	expect(await capture).toBeNull();
	expect(harness.capturedFrames).toBeNull();
});

it("returns no frames when the content changes while a clip shorter than the window is in flight", async () => {
	const { player, harness } = createStillPlayer();
	Object.assign(player, { getLength: () => 0.05 }); // 2 frames: fewer than the smallest window
	const { held, releaseAll } = holdToBlob();

	const capture = harness.runCapture();
	await until(() => held.length >= 2);
	harness.contentHash = "changed";
	releaseAll();

	expect(await capture).toBeNull();
	expect(harness.capturedFrames).toBeNull();
});

const countYields = () =>
	jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
		callback(0);
		return 0;
	});

it("yields once per time slice, not per frame, when every frame is held", async () => {
	const { harness } = createStillPlayer();
	const seek = jest.mocked(harness.seekHarness);
	const write = seek.getMockImplementation()!;
	seek.mockImplementation((_seconds, win) => write(0, win));
	jest.spyOn(performance, "now").mockReturnValue(1000);
	const yields = countYields();

	expect(await harness.runCapture()).toHaveLength(60);
	expect(yields).toHaveBeenCalledTimes(2 + 1); // the scale read and the page load, then the first frame
});

it("yields before every frame when each frame outlasts the time slice", async () => {
	const { harness } = createStillPlayer();
	let clock = 0;
	jest.spyOn(performance, "now").mockImplementation(() => {
		clock += 13;
		return clock;
	});
	const yields = countYields();

	expect(await harness.runCapture()).toHaveLength(60);
	expect(yields).toHaveBeenCalledTimes(2 + 60); // the scale read and the page load, then each frame
});

it("rejects once on a failed frame, leaving no unhandled rejections from the frames behind it", async () => {
	const { harness } = createStillPlayer();
	jest.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(done => done(null));

	await expect(harness.runCapture()).rejects.toThrow("canvas.toBlob returned null");
	await flush(); // the runtime reports unhandled rejections a task after they settle
});

it.each([
	[0.1, 0.25],
	[0.46, 0.5],
	[0.5, 0.5],
	[0.51, 0.75],
	[0.9, 1],
	[2, 1]
])("bakes a clip shown at %p of its size at %p", (onScreen, expected) => {
	expect(bakeScaleFor(onScreen)).toBe(expected);
});

const shownAt = (harness: PlayerHarness, scale: number) =>
	Object.assign(harness.contentContainer, { getGlobalTransform: () => ({ a: scale, b: 0, c: 0, d: scale }) });

type PlaybackSprite = { visible?: boolean; texture: { source: { blob: Blob }; resolution?: number; destroy: jest.Mock } };

it("draws frames at the bake scale and sizes their texture back to the clip", async () => {
	const { harness } = createStillPlayer();
	Object.assign(harness, { renderedWidth: 1080, renderedHeight: 1920 });
	shownAt(harness, 0.46);
	const drawImage = jest.fn();
	jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);

	await harness.runCapture();
	await harness.transitionToPlayback();

	expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 540, 960);
	expect((harness.contentContainer.children.at(-1) as PlaybackSprite).texture.resolution).toBe(0.5);
});

it("draws a full-size frame of a fractional clip size as an unscaled draw does", async () => {
	const { harness } = createStillPlayer();
	Object.assign(harness, { renderedWidth: 1080.6, renderedHeight: 1920.4 });
	const drawImage = jest.fn();
	const canvases: number[][] = [];
	jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function context(this: HTMLCanvasElement) {
		canvases.push([this.width, this.height]);
		return { drawImage } as never;
	});

	await harness.runCapture();

	expect(canvases[0]).toEqual([1080, 1920]);
	expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1080.6, 1920.4);
});

it("plays a cached bake without reloading the page", async () => {
	const { harness } = createStillPlayer();
	const pngs = [new Blob(["cached 0"])];
	cacheLib.html5CacheGet.mockResolvedValueOnce({ pngs, fps: 30, frameCount: 1 });

	expect(await harness.runCapture()).toBe(pngs);
	expect(cacheLib.html5CacheGet).toHaveBeenCalledWith("original@1");
	expect(canvasLib.composeHtml5IframeSrcdoc).not.toHaveBeenCalled();
});

it("keys each bake by its scale", async () => {
	const { harness } = createStillPlayer();
	shownAt(harness, 0.46);
	await harness.runCapture();
	expect(jest.requireMock("@canvas/players/html5-cache").html5CachePut).toHaveBeenCalledWith("original@0.5", expect.anything());
});

it("inlines ingest files sized for the bake's scale, and for full size in a still", async () => {
	const { player, harness } = createStillPlayer();
	shownAt(harness, 0.46);
	canvasLib.findHtml5IngestUrls.mockReturnValue([INGEST_URL]);
	canvasLib.inlineHtml5IngestAssets.mockImplementation(async asset => asset);

	await harness.runCapture();
	expect(canvasLib.inlineHtml5IngestAssets).toHaveBeenLastCalledWith(expect.objectContaining({ type: "html5" }), 640);

	await player.prepareStaticRender();
	player.endStaticRender();
	expect(canvasLib.inlineHtml5IngestAssets).toHaveBeenLastCalledWith(expect.objectContaining({ type: "html5" }), 1280);
});

it("keeps stills and captures at full resolution while a scaled bake exists", async () => {
	const { player, harness } = createStillPlayer();
	Object.assign(harness, { capturedFrames: [new Blob(["baked 0"])], capturedHash: "original@0.5", capturedScale: 0.5 });
	const serialise = jest.spyOn(harness, "captureIframeAsForeignObjectSvg");

	await player.prepareStaticRender();

	expect(serialise).toHaveBeenCalledTimes(1);
	expect(cacheLib.html5CacheGet).toHaveBeenCalledWith("original@1");
});

it("hides a scaled bake's sprite while a capture's still is up, with the still first", async () => {
	const { player, harness } = createStillPlayer();
	shownAt(harness, 0.46);
	await harness.runCapture();
	await harness.transitionToPlayback();
	const playback = harness.contentContainer.children[0] as PlaybackSprite;

	await player.prepareStaticRender();

	const [still] = harness.contentContainer.children as [PlaybackSprite];
	expect(still).not.toBe(playback);
	expect(still.texture.resolution).toBeUndefined();
	expect(playback.visible).toBe(false);
	player.endStaticRender();
	expect(harness.contentContainer.children).toEqual([playback]);
	expect(playback.visible).toBe(true);
});

it("leaves a scaled bake hidden when a capture's still fails", async () => {
	const { player, harness } = createStillPlayer();
	shownAt(harness, 0.46);
	await harness.runCapture();
	await harness.transitionToPlayback();
	const playback = harness.contentContainer.children[0] as PlaybackSprite;
	jest.spyOn(console, "warn").mockImplementation(() => {});
	jest.spyOn(harness, "captureIframeAsForeignObjectSvg").mockImplementation(() => {
		throw new Error("serialise failed");
	});

	await player.prepareStaticRender();

	expect(harness.contentContainer.children).toEqual([playback]);
	expect(playback.visible).toBe(false);

	player.endStaticRender();
	expect(playback.visible).toBe(true);
	jest.spyOn(harness, "renderStill").mockResolvedValue(null);
	await player.prepareStaticRender();
	expect(playback.visible).toBe(false);
	player.endStaticRender();
	expect(playback.visible).toBe(true);
});

it("keeps a scaled bake on screen until a capture's still is ready", async () => {
	const { player, harness } = createStillPlayer();
	shownAt(harness, 0.46);
	await harness.runCapture();
	await harness.transitionToPlayback();
	const playback = harness.contentContainer.children[0] as PlaybackSprite;
	let finish: (texture: unknown) => void = () => {};
	jest.spyOn(harness, "renderStill").mockImplementation(
		() =>
			new Promise(resolve => {
				finish = resolve;
			})
	);

	const capture = player.prepareStaticRender();
	await flush();
	expect(playback.visible).toBe(true);
	finish({ destroy: jest.fn() });
	await capture;
	expect(playback.visible).toBe(false);
	expect(harness.contentContainer.children).toHaveLength(2);
});

it("keeps a bake that finishes during a capture hidden behind the capture's still", async () => {
	const { player, harness } = createStillPlayer();
	await player.prepareStaticRender();
	await harness.runCapture();
	await harness.transitionToPlayback();
	const [, playback] = harness.contentContainer.children as [PlaybackSprite, PlaybackSprite];

	expect(playback.visible).toBe(false);
	player.endStaticRender();
	expect(harness.contentContainer.children).toEqual([playback]);
	expect(playback.visible).toBe(true);
});

it("re-bakes once at the higher scale when the clip is shown larger", async () => {
	const { player, harness, events } = createStillPlayer();
	Object.assign(harness, { capturedFrames: [new Blob(["baked 0"])], capturedHash: "original@0.5", capturedScale: 0.5, mode: "playback" });
	shownAt(harness, 0.8);
	const capture = jest.spyOn(harness, "captureFrames").mockImplementation(() => new Promise(() => {}));
	Object.assign(player, { isActive: () => false });
	player.update(0, 0);
	expect(capture).not.toHaveBeenCalled();

	Object.assign(player, { isActive: () => true });
	player.update(0, 0);
	shownAt(harness, 0.3);
	player.update(0, 0);
	expect(capture).toHaveBeenCalledTimes(1);
	expect(capture).toHaveBeenCalledWith(1);
	expect(events.emit).toHaveBeenCalledWith(EditEvent.ClipCaptureStarted, expect.anything());

	// The clip zoomed back out before the bake read its scale: the bake keeps its target, and doesn't re-arm.
	await harness.runCapture(1);
	shownAt(harness, 0.8);
	player.update(0, 0);
	expect(harness.capturedHash).toBe("original@1");
	expect(capture).toHaveBeenCalledTimes(1);
});

it("re-bakes once when a clip is resized larger", () => {
	const { player, harness } = createStillPlayer();
	Object.assign(harness, {
		renderedWidth: 1080,
		renderedHeight: 1920,
		capturedFrames: [new Blob(["baked 0"])],
		capturedHash: "original@0.5",
		capturedScale: 0.5,
		mode: "playback"
	});
	shownAt(harness, 0.4);
	const capture = jest.spyOn(harness, "captureFrames").mockImplementation(() => new Promise(() => {}));
	player.update(0, 0);
	expect(capture).not.toHaveBeenCalled();

	Object.assign(harness.clipConfiguration, { width: 2160, height: 1920 });
	player.update(0, 0);
	player.update(0, 0);
	expect(capture).toHaveBeenCalledTimes(1);
	expect(capture).toHaveBeenCalledWith(1);
});

it("reports a failed re-bake and keeps the frames it has", async () => {
	const { player, harness, events } = createStillPlayer();
	const frames = [new Blob(["baked 0"])];
	Object.assign(harness, { capturedFrames: frames, capturedHash: "original@0.5", capturedScale: 0.5, mode: "playback" });
	shownAt(harness, 0.8);
	jest.spyOn(console, "warn").mockImplementation(() => {});
	jest.spyOn(harness, "captureFrames").mockRejectedValue(new Error("re-bake failed"));

	player.update(0, 0);
	await flush();

	expect(events.emit).toHaveBeenCalledWith(
		EditEvent.ClipCaptureFailed,
		expect.objectContaining({ error: "re-bake failed", fallback: "scaled-frames" })
	);
	expect(harness.capturedFrames).toBe(frames);
});

type SharedQueue = { bakes: BakeQueue };

// Stands in for another clip's bake at the head of the shared queue.
function holdCaptureQueue(): { drain: () => void; restore: () => void } {
	const { bakes } = Html5Player as unknown as SharedQueue;
	const held = new BakeQueue();
	let drain = () => {};
	const gate = new Promise<void>(resolve => {
		drain = resolve;
	});
	// Ahead of the playhead and earliest, so it runs ahead of any clip that joins after it.
	held.add({ nextFrameEnd: () => 0, playhead: () => -Infinity }, () => gate);
	Object.assign(Html5Player, { bakes: held });
	return { drain, restore: () => Object.assign(Html5Player, { bakes }) };
}

// Earlier tests can leave a bake that never settles on the shared queue.
function emptyCaptureQueue(): () => void {
	const { bakes } = Html5Player as unknown as SharedQueue;
	Object.assign(Html5Player, { bakes: new BakeQueue() });
	return () => Object.assign(Html5Player, { bakes });
}

it("drops a re-bake queued for content that has since changed, leaving the newer capture in flight", async () => {
	const { player, harness } = createStillPlayer();
	Object.assign(harness, { capturedFrames: [new Blob(["baked 0"])], capturedHash: "original@0.5", capturedScale: 0.5, mode: "playback" });
	shownAt(harness, 0.8);
	const queue = holdCaptureQueue();
	try {
		player.update(0, 0);
		const rebake = harness.captureInFlight!;

		jest.spyOn(harness, "hashAsset").mockResolvedValue("changed");
		shownAt(harness, 0.3);
		await player.reloadAsset();
		const newer = harness.captureInFlight;
		expect(newer).not.toBeNull();
		queue.drain();
		await rebake;
		expect(harness.captureInFlight).toBe(newer);

		await newer;
		const { html5CachePut } = jest.requireMock("@canvas/players/html5-cache");
		expect(html5CachePut).toHaveBeenCalledWith("changed@0.5", expect.anything());
		expect(html5CachePut).not.toHaveBeenCalledWith("changed@1", expect.anything());
	} finally {
		queue.restore();
	}
});

it("adopts cached frames while another clip's bake holds the queue", async () => {
	const { harness, events } = createStillPlayer();
	const queue = holdCaptureQueue();
	try {
		cacheLib.html5CacheGet.mockResolvedValueOnce({ pngs: [new Blob(["cached 0"]), new Blob(["cached 1"])], fps: 1, frameCount: 2 });
		harness.beginCapture();
		await until(() => harness.capturedFrames !== null);

		expect(harness.capturedHash).toBe("original@1");
		expect(events.emit).toHaveBeenCalledWith(EditEvent.ClipCaptureCompleted, expect.objectContaining({ frameCount: 2 }));
	} finally {
		queue.restore();
	}
});

it("keeps an uncached clip's bake behind the bake ahead of it", async () => {
	const { harness } = createStillPlayer();
	const queue = holdCaptureQueue();
	try {
		const runCapture = jest.spyOn(harness, "runCapture");
		harness.beginCapture();
		await flush(5);
		expect(runCapture).not.toHaveBeenCalled();

		queue.drain();
		await until(() => runCapture.mock.calls.length === 1);
		await harness.captureInFlight;
	} finally {
		queue.restore();
	}
});

it("keeps the queue's bakes in order when a cached clip sits between them", async () => {
	const players = ["first", "cached", "last"].map(contentHash => {
		const created = createStillPlayer();
		created.harness.contentHash = contentHash;
		return created;
	});
	const [first, cached, last] = players.map(({ harness }) => harness);
	jest.spyOn(console, "warn").mockImplementation(() => {});
	cacheLib.html5CacheGet.mockImplementation(async (key: string) =>
		key === "cached@1" ? { pngs: [new Blob(["cached 0"])], fps: 1, frameCount: 1 } : null
	);
	let finishFirst: (frames: Blob[] | null) => void = () => {};
	jest.spyOn(first, "runCapture").mockImplementation(
		() =>
			new Promise(resolve => {
				finishFirst = resolve;
			})
	);
	const lastBake = jest.spyOn(last, "runCapture").mockResolvedValue(null);
	const restore = emptyCaptureQueue();
	try {
		first.beginCapture();
		cached.beginCapture();
		last.beginCapture();
		await until(() => cached.capturedFrames !== null);
		await flush(5);
		expect(lastBake).not.toHaveBeenCalled();

		finishFirst(null);
		await until(() => lastBake.mock.calls.length === 1);
	} finally {
		restore();
	}
});

it("bakes the clip that plays first ahead of one whose page loaded first", async () => {
	const later = createStillPlayer();
	const opening = createStillPlayer();
	Object.assign(later.player, { getStart: () => 54.4, getEnd: () => 80.37 });
	Object.assign(opening.player, { getStart: () => 0, getEnd: () => 24.4 });
	const baked: string[] = [];
	const bake = (name: string) => async () => {
		baked.push(name);
		return null;
	};
	jest.spyOn(later.harness, "runCapture").mockImplementation(bake("later"));
	jest.spyOn(opening.harness, "runCapture").mockImplementation(bake("opening"));
	jest.spyOn(console, "warn").mockImplementation(() => {});
	const restore = emptyCaptureQueue();
	try {
		later.harness.beginCapture();
		opening.harness.beginCapture();
		await until(() => baked.length === 2);

		expect(baked).toEqual(["opening", "later"]);
	} finally {
		restore();
	}
});

it("shares one in-flight window between bakes that take turns", async () => {
	const a = createStillPlayer();
	const b = createStillPlayer();
	b.harness.contentHash = "other";
	[a, b].forEach(({ harness }) => Object.assign(harness, { renderedWidth: 3840, renderedHeight: 2160 }));
	jest.spyOn(Navigator.prototype, "hardwareConcurrency", "get").mockReturnValue(16);
	sliceEveryFrame();
	const { held, releaseAll } = holdToBlob();
	const restore = emptyCaptureQueue();
	try {
		const captures = [a.harness.captureFrames(), b.harness.captureFrames()];
		await until(() => held.length >= 8);
		await flush(100);
		expect(held).toHaveLength(8);

		releaseAll();
		expect((await Promise.all(captures)).map(frames => frames?.length)).toEqual([60, 60]);
	} finally {
		restore();
	}
});

it("alternates overlapping clips' frames rather than baking one clip whole", async () => {
	const a = createStillPlayer();
	const b = createStillPlayer();
	b.harness.contentHash = "other";
	const order: string[] = [];
	a.onSeek = seek => seek.startsWith("bake") && order.push("a");
	b.onSeek = seek => seek.startsWith("bake") && order.push("b");
	sliceEveryFrame();
	const restore = emptyCaptureQueue();
	try {
		await Promise.all([a.harness.captureFrames(), b.harness.captureFrames()]);

		expect(new Set(order.slice(0, 10)).size).toBe(2);
	} finally {
		restore();
	}
});

it("drops a cached bake whose content changed during the lookup", async () => {
	const { harness, events } = createStillPlayer();
	let hit: (value: unknown) => void = () => {};
	cacheLib.html5CacheGet.mockImplementationOnce(
		() =>
			new Promise(resolve => {
				hit = resolve;
			})
	);
	const queue = holdCaptureQueue();
	try {
		harness.beginCapture();
		await until(() => cacheLib.html5CacheGet.mock.calls.length === 1);
		harness.contentHash = "changed";
		hit({ pngs: [new Blob(["cached 0"])], fps: 1, frameCount: 1 });
		await flush(5);

		expect(harness.capturedFrames).toBeNull();
		expect(events.emit).not.toHaveBeenCalledWith(EditEvent.ClipCaptureCompleted, expect.anything());
	} finally {
		queue.restore();
	}
});

it("swaps a sharper bake in under the frame on screen and frees the earlier one", async () => {
	const { harness } = createStillPlayer();
	shownAt(harness, 0.46);
	await harness.runCapture();
	await harness.transitionToPlayback();
	const sprite = harness.contentContainer.children[0] as PlaybackSprite;
	const earlier = sprite.texture;

	shownAt(harness, 0.8);
	await harness.runCapture();

	expect(earlier.destroy).toHaveBeenCalled();
	expect(sprite.texture.resolution).toBe(1);
	expect(await frameMarkup(sprite.texture.source.blob)).toContain('data-t="0"');
});

const layer = (harness: PlayerHarness) => harness.contentContainer.children as Array<StaticSprite & { visible?: boolean }>;
const stillShown = (harness: PlayerHarness) => () => layer(harness).some(child => child.texture?.source?.blob);
const baking = (harness: PlayerHarness) => jest.spyOn(harness, "captureFrames").mockImplementation(() => new Promise(() => {}));

it("shows the playhead's still while the clip bakes", async () => {
	const { player, harness } = createStillPlayer();
	Object.assign(player, { getLength: () => 60, getPlaybackTime: () => 12.5 });
	baking(harness);
	harness.beginCapture();
	player.update(0, 0);
	await until(stillShown(harness));

	expect(layer(harness)).toHaveLength(1);
	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toContain(">t=12.5<");
});

it("renders only the newest playhead position after a burst of moves", async () => {
	const { player, harness, seeks } = createStillPlayer();
	baking(harness);
	harness.beginCapture();
	[0.1, 0.5, 0.9, 1.3].forEach(t => {
		Object.assign(player, { getPlaybackTime: () => t });
		player.update(0, 0);
	});
	await until(() => seeks.includes("still 1.3"));

	expect(seeks.filter(seek => seek.startsWith("still"))).toEqual(["still 0.1", "still 1.3"]);
	expect(layer(harness)).toHaveLength(1);
});

it("tries a failed still once more, but not on every tick", async () => {
	const { player, harness } = createStillPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	baking(harness);
	harness.beginCapture();
	const still = jest.spyOn(harness, "renderStill").mockRejectedValueOnce(new Error("iframe load timed out"));
	player.update(0, 0);
	await until(stillShown(harness));
	expect(still).toHaveBeenCalledTimes(2);

	still.mockResolvedValue(null);
	Object.assign(player, { getPlaybackTime: () => 1 });
	player.update(0, 0);
	await flush();
	player.update(0, 0);
	player.update(0, 0);
	await flush();
	expect(still).toHaveBeenCalledTimes(4);
});

it("keeps showing stills after one fails to mount", async () => {
	const { player, harness, seeks } = createStillPlayer();
	const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
	Object.assign(harness.clipConfiguration, { width: 540, height: 960 });
	const fit = jest.fn().mockImplementationOnce(() => {
		throw new Error("fit failed");
	});
	Object.assign(player, { applyFixedDimensions: fit });
	player.update(0, 0);
	await until(() => fit.mock.calls.length === 1);
	Object.assign(player, { getPlaybackTime: () => 1 });
	player.update(0, 0);
	await until(() => seeks.includes("still 1"));

	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toContain(">t=1<");
	expect(warn).toHaveBeenCalledWith("[Html5Player] still failed:", expect.objectContaining({ message: "fit failed" }));
});

const bakedAt = (...indices: number[]) => Array.from({ length: 60 }, (_, i) => (indices.includes(i) ? new Blob([`baked ${i}`]) : undefined));

it("plays a frame from a bake still in progress instead of rendering a still", async () => {
	const { player, harness, seeks } = createStillPlayer();
	Object.assign(player, { getPlaybackTime: () => 0.5 });
	baking(harness);
	harness.beginCapture();
	Object.assign(harness, { bakingFrames: bakedAt(15), bakingScale: 0.5 });
	player.update(0, 0);
	await until(stillShown(harness));

	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toBe("baked 15");
	expect((layer(harness)[0].texture as { resolution?: number }).resolution).toBe(0.5);
	expect(seeks.some(seek => seek.startsWith("still"))).toBe(false);
});

it("renders a still where the bake in progress hasn't reached", async () => {
	const { player, harness } = createStillPlayer();
	Object.assign(player, { getPlaybackTime: () => 0.5 });
	baking(harness);
	harness.beginCapture();
	Object.assign(harness, { bakingFrames: bakedAt(...Array.from({ length: 10 }, (_, i) => i)), bakingScale: 1 });
	player.update(0, 0);
	await until(stillShown(harness));

	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toContain(">t=0.5<");
});

it("renders an export's still mid-bake, never a frame from the bake in progress", async () => {
	const { player, harness } = createStillPlayer();
	Object.assign(player, { getPlaybackTime: () => 0.5 });
	baking(harness);
	harness.beginCapture();
	Object.assign(harness, { bakingFrames: bakedAt(...Array.from({ length: 60 }, (_, i) => i)), bakingScale: 1 });
	const serialise = jest.spyOn(harness, "captureIframeAsForeignObjectSvg");

	await player.prepareStaticRender();

	expect(serialise).toHaveBeenCalledTimes(1);
	expect(await frameMarkup((harness.contentContainer.children[0] as StaticSprite).texture.source.blob)).toContain(">t=0.5<");
	player.endStaticRender();
});

it("forgets a bake's frames once the clip's content changes", async () => {
	const { player, harness } = createStillPlayer();
	baking(harness);
	harness.beginCapture();
	Object.assign(harness, { bakingFrames: bakedAt(0, 1, 2) });
	jest.spyOn(harness, "hashAsset").mockResolvedValue("changed");

	await player.reloadAsset();

	expect(harness.bakingFrames).toBeNull();
});

it("forgets a failed bake's frames", () => {
	const { harness } = createStillPlayer();
	Object.assign(harness, { bakingFrames: bakedAt(0, 1, 2) });

	harness.transitionToFailed();

	expect(harness.bakingFrames).toBeNull();
});

it("keeps a sharper re-bake's frames hidden until it finishes", async () => {
	const { harness } = createStillPlayer();
	Object.assign(harness, { mode: "playback", capturedFrames: [new Blob(["baked 0"])], capturedHash: "original@0.5", capturedScale: 0.5 });
	const { held, releaseAll } = holdToBlob();
	const capture = harness.runCapture(1);
	await until(() => held.length > 0);

	expect(harness.bakingFrames).toBeNull();
	releaseAll();
	await capture;
});

it("shows a first bake's frames as they land", async () => {
	const { harness } = createStillPlayer();
	baking(harness);
	harness.beginCapture();
	const { held, releaseAll } = holdToBlob();
	const capture = harness.runCapture();
	await until(() => held.length > 1);
	held.shift()!();
	await until(() => harness.bakingFrames?.[0] !== undefined);

	expect(harness.bakingFrames).toHaveLength(60);
	expect(harness.bakingFrames!.filter(Boolean)).toHaveLength(1);
	releaseAll();
	await capture;
});

it.each([
	[[0, 3], 2, 7, 0],
	[[0, 3], 3, 7, 3],
	[[0], 8, 7, null],
	[[1], 8, 7, 1],
	[[0, 3], 2, 0, null],
	[[19], 20, 7, 19]
])("finds the frame to hold among %p at %p within %p frames: %p", (present, idx, maxBehind, expected) => {
	const frames = Array.from({ length: 20 }, (_, i) => (present.includes(i) ? new Blob([`${i}`]) : undefined));

	expect(heldFrame(frames, idx, maxBehind)).toBe(expected);
});

const playingAhead = async (...baked: number[]) => {
	const created = createStillPlayer();
	const { player, harness, edit } = created;
	Object.assign(edit, { isPlaying: true });
	Object.assign(player, { getPlaybackTime: () => 0.4 }); // frame 12
	baking(harness);
	harness.beginCapture();
	Object.assign(harness, { bakingFrames: bakedAt(...baked), bakingScale: 1 });
	player.update(0, 0);
	await until(stillShown(harness));
	return created;
};

it("reports buffering while the playhead's frame isn't baked, whatever is on screen", async () => {
	const held = await playingAhead(8);
	expect(held.player.isPlaybackBuffering()).toBe(true);

	const still = await playingAhead(0);
	expect(still.player.isPlaybackBuffering()).toBe(true);

	const empty = createStillPlayer();
	Object.assign(empty.edit, { isPlaying: true });
	baking(empty.harness);
	empty.harness.beginCapture();
	expect(empty.player.isPlaybackBuffering()).toBe(true);
});

it("reports no buffering once the playhead's frame is baked, before it reaches the screen", async () => {
	const { player, harness } = await playingAhead(12);
	expect(player.isPlaybackBuffering()).toBe(false);

	// The playhead moves before the frame on screen catches up.
	Object.assign(player, { getPlaybackTime: () => 13 / 30 });
	harness.bakingFrames![13] = new Blob(["baked 13"]);
	expect(player.isPlaybackBuffering()).toBe(false);

	Object.assign(player, { getPlaybackTime: () => 14 / 30 });
	expect(player.isPlaybackBuffering()).toBe(true);
});

it("reports no buffering while paused, once the bake is complete, or for a clip that failed", async () => {
	const { player, harness, edit } = await playingAhead(8);
	Object.assign(edit, { isPlaying: false });
	expect(player.isPlaybackBuffering()).toBe(false);

	Object.assign(edit, { isPlaying: true });
	Object.assign(harness, { mode: "playback" });
	expect(player.isPlaybackBuffering()).toBe(false);

	const failed = await playingAhead(8);
	Object.assign(failed.harness, { fallbackGraphic: { destroy: jest.fn() } });
	expect(failed.player.isPlaybackBuffering()).toBe(false);
});

it("holds the nearest baked frame while playing ahead of the bake", async () => {
	const { harness, seeks } = await playingAhead(8, 16);

	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toBe("baked 8");
	expect(seeks.some(seek => seek.startsWith("still"))).toBe(false);
});

it("holds a baked frame exactly 7 frames back while playing", async () => {
	const { harness } = await playingAhead(5);

	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toBe("baked 5");
});

it("renders a still while playing when the nearest baked frame is more than 7 frames back", async () => {
	const { harness } = await playingAhead(4);

	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toContain(">t=0.4<");
});

it("decodes a held frame once while playing on through it", async () => {
	const { player } = await playingAhead(8);
	const decode = jest.spyOn(globalThis, "createImageBitmap");
	[0.4, 0.4, 13 / 30, 13 / 30, 14 / 30].forEach(t => {
		Object.assign(player, { getPlaybackTime: () => t });
		player.update(0, 0);
	});
	await flush(50);

	expect(decode).not.toHaveBeenCalled();
});

it("never steps back to an older baked frame than the still on screen while playing", async () => {
	const { player, harness } = await playingAhead(0); // a still of frame 12
	harness.bakingFrames![11] = new Blob(["baked 11"]);
	Object.assign(player, { getPlaybackTime: () => 13 / 30 });
	player.update(0, 0);
	await flush(50);

	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toContain(">t=0.4<");
});

it("renders the exact still once playback pauses on a held frame", async () => {
	const { player, harness, edit } = await playingAhead(8, 16);
	const held = layer(harness)[0].texture;
	Object.assign(edit, { isPlaying: false });
	player.update(0, 0);
	await until(() => layer(harness)[0].texture !== held);

	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toContain(">t=0.4<");
});

it("swaps the still for baked frames once the bake finishes", async () => {
	const { player, harness } = createStillPlayer();
	let finish: (frames: Blob[]) => void = () => {};
	jest.spyOn(harness, "captureFrames").mockImplementation(
		() =>
			new Promise(resolve => {
				finish = resolve;
			})
	);
	harness.beginCapture();
	player.update(0, 0);
	await until(stillShown(harness));
	const still = layer(harness)[0];
	harness.capturedFrames = [new Blob(["baked 0"])];
	harness.capturedHash = `${harness.contentHash}@1`;
	finish(harness.capturedFrames);
	await until(() => !layer(harness).includes(still));

	expect(still.texture.destroy).toHaveBeenCalled();
	expect(layer(harness)).toHaveLength(1);
	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toBe("baked 0");
});

it("switches from the still to the playhead's baked frame", async () => {
	const { player, harness } = createStillPlayer();
	Object.assign(player, { getPlaybackTime: () => 1 });
	let finish: (frames: Blob[]) => void = () => {};
	jest.spyOn(harness, "captureFrames").mockImplementation(
		() =>
			new Promise(resolve => {
				finish = resolve;
			})
	);
	harness.beginCapture();
	player.update(0, 0);
	await until(stillShown(harness));
	const still = layer(harness)[0];
	harness.capturedFrames = Array.from({ length: 60 }, (_, i) => new Blob([`baked ${i}`]));
	harness.capturedHash = `${harness.contentHash}@1`;
	finish(harness.capturedFrames);
	await until(() => !layer(harness).includes(still));

	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toBe("baked 30");
});

it("replaces the still with the placeholder when the bake fails", async () => {
	const { player, harness } = createStillPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	let fail: (error: Error) => void = () => {};
	jest.spyOn(harness, "captureFrames").mockImplementation(
		() =>
			new Promise((_, reject) => {
				fail = reject;
			})
	);
	harness.beginCapture();
	player.update(0, 0);
	await until(stillShown(harness));
	const still = layer(harness)[0];
	fail(new Error("The source image cannot be decoded."));
	await until(() => !layer(harness).includes(still));

	expect(still.texture.destroy).toHaveBeenCalled();
	expect(layer(harness)).toEqual([expect.objectContaining({ kind: "failed" })]);
});

it("shows a still again after the clip's content changes", async () => {
	const { player, harness } = createStillPlayer();
	harness.capturedFrames = [new Blob(["baked 0"])];
	harness.capturedHash = `${harness.contentHash}@1`;
	await harness.transitionToPlayback();
	jest.spyOn(harness, "hashAsset").mockResolvedValue("updated");
	baking(harness);
	await player.reloadAsset();
	player.update(0, 0);
	await until(stillShown(harness));

	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toContain(">t=0<");
});

it("keeps a capture to one copy of the clip while a still is showing", async () => {
	const { player, harness } = createStillPlayer();
	baking(harness);
	harness.beginCapture();
	player.update(0, 0);
	await until(stillShown(harness));
	const live = layer(harness)[0];

	await player.prepareStaticRender();
	expect(live.visible).toBe(false);
	expect(layer(harness)).toHaveLength(2);
	player.endStaticRender();
	expect(live.visible).toBe(true);
	expect(layer(harness)).toEqual([live]);
});

it("fits a capture's sprite, not the hidden still, to a clip with its own size", async () => {
	const { player, harness } = createStillPlayer();
	Object.assign(harness.clipConfiguration, { width: 540, height: 960 });
	// applyFixedDimensions fits the layer's first sprite.
	const fitted: unknown[] = [];
	Object.assign(player, { applyFixedDimensions: () => fitted.push(layer(harness).find(child => child.texture)) });
	baking(harness);
	harness.beginCapture();
	player.update(0, 0);
	await until(stillShown(harness));
	const live = layer(harness)[0];
	await player.prepareStaticRender();

	expect(fitted.at(-1)).toBe(layer(harness).find(child => child !== live));
});

it("takes a capture's still from the live still at the same frame", async () => {
	const { player, harness, seeks } = createStillPlayer();
	baking(harness);
	harness.beginCapture();
	player.update(0, 0);
	await player.prepareStaticRender();
	player.endStaticRender();
	await player.prepareStaticRender();

	expect(seeks.filter(seek => seek.startsWith("still"))).toEqual(["still 0"]);
	expect(await frameMarkup(layer(harness)[0].texture.source.blob)).toContain(">t=0<");
});

it.each([
	["renders nothing", () => Promise.resolve(null)],
	["throws", () => Promise.reject(new Error("iframe load timed out"))]
])("leaves the clip blank in a capture whose still %s", async (_, fail) => {
	const { player, harness } = createStillPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	baking(harness);
	harness.beginCapture();
	const still = jest.spyOn(harness, "renderStill").mockImplementation(fail);
	await player.prepareStaticRender();
	const [loading] = layer(harness);
	expect(loading.visible).toBe(false);
	player.endStaticRender();
	expect(loading.visible).toBe(true);

	still.mockRestore();
	player.update(0, 0);
	await until(stillShown(harness));
	const [live] = layer(harness);
	jest.spyOn(harness, "renderStill").mockImplementation(fail);
	await player.prepareStaticRender();
	expect(layer(harness)).toEqual([live]);
	expect(live.visible).toBe(false);
	player.endStaticRender();
	expect(live.visible).toBe(true);
});

it("keeps a still that arrives during a capture out of it", async () => {
	const { player, harness } = createStillPlayer();
	baking(harness);
	harness.beginCapture();
	await player.prepareStaticRender();
	player.update(0, 0);
	await until(() => layer(harness).filter(child => child.texture?.source?.blob).length === 2);
	const live = layer(harness)[1];

	expect(live.visible).toBe(false);
	player.endStaticRender();
	expect(live.visible).toBe(true);
	expect(layer(harness)).toEqual([live]);
});

it("shows a still of the changed content before an on-play edit plays", async () => {
	const { player, harness, edit } = createStillPlayer();
	Object.assign(edit, { getHtml5Prerender: () => "on-play" });
	player.update(0, 0);
	await until(stillShown(harness));
	const old = layer(harness)[0];
	jest.spyOn(harness, "hashAsset").mockResolvedValue("updated");
	await player.reloadAsset();
	player.update(0, 0);
	await until(() => layer(harness).some(child => child !== old && child.texture?.source?.blob));

	expect(old.texture.destroy).toHaveBeenCalled();
	expect(layer(harness)).toHaveLength(1);
});

it("destroys the still with the player", async () => {
	const { player, harness } = createStillPlayer();
	baking(harness);
	harness.beginCapture();
	player.update(0, 0);
	await until(stillShown(harness));
	const still = layer(harness)[0] as StaticSprite & { destroy: jest.Mock };
	player.dispose();

	expect(still.destroy).toHaveBeenCalled();
	expect(still.texture.destroy).toHaveBeenCalled();
});

function createMountingPlayer(html5Prerender: "on-load" | "on-play") {
	const created = createPlayer();
	Object.assign(created.edit, { getOutputFps: () => 30, getCanvas: () => null, getHtml5Prerender: () => html5Prerender });
	Object.assign(created.player, { iframe: null });
	const still = jest.spyOn(created.harness, "renderStill").mockResolvedValue(null);
	jest.spyOn(created.harness, "seekHarness").mockImplementation(() => {});
	const capture = jest.spyOn(created.harness, "captureFrames").mockImplementation(() => new Promise(() => {}));
	return { ...created, capture, still };
}

it("pre-renders a clip as soon as it loads by default", async () => {
	const { player, harness, capture } = createMountingPlayer("on-load");
	jest.spyOn(harness, "hashAsset").mockResolvedValue("mounted");

	await player.load();

	expect(capture).toHaveBeenCalledTimes(1);
});

it("waits for playback to pre-render a clip when the edit pre-renders on play", async () => {
	const { player, harness, edit, capture } = createMountingPlayer("on-play");
	jest.spyOn(harness, "hashAsset").mockResolvedValue("mounted");

	await player.load();
	player.update(0, 0);
	expect(capture).not.toHaveBeenCalled();

	edit.isPlaying = true;
	player.update(0, 0);
	expect(capture).toHaveBeenCalledTimes(1);
});

it("doesn't pre-render a changed clip before playback when the edit pre-renders on play", async () => {
	const { player, harness, capture } = createMountingPlayer("on-play");
	jest.spyOn(harness, "hashAsset").mockResolvedValueOnce("mounted").mockResolvedValueOnce("changed");
	await player.load();

	const reload = player.reloadAsset();
	await flush();
	harness.iframe.dispatchEvent(new Event("load"));
	await reload;

	expect(capture).not.toHaveBeenCalled();
});

it("gives a bake a new key when the clip's length or frame rate changes", async () => {
	const { player, harness } = createPlayer();
	Object.assign(player, { getLength: () => 3, captureFps: 30 });
	const short = await harness.hashAsset();
	Object.assign(player, { getLength: () => 6 });
	const long = await harness.hashAsset();
	Object.assign(player, { captureFps: 60 });
	const faster = await harness.hashAsset();
	// Both bake 120 frames, so only the frame rate tells these two apart.
	Object.assign(player, { getLength: () => 4, captureFps: 30 });
	const fourSeconds = await harness.hashAsset();
	Object.assign(player, { getLength: () => 2, captureFps: 60 });
	const twoSecondsFaster = await harness.hashAsset();

	expect(new Set([short, long, faster]).size).toBe(3);
	expect(twoSecondsFaster).not.toBe(fourSeconds);
});

it("re-bakes a loaded clip when its resolved length changes", () => {
	const { player } = createPlayer();
	const lengthsSeen: number[] = [];
	const reload = jest.spyOn(player, "reloadAsset").mockImplementation(async () => {
		lengthsSeen.push(player.getLength());
	});

	player.setResolvedTiming({ start: sec(0), length: sec(90) });

	expect(reload).toHaveBeenCalledTimes(1);
	expect(lengthsSeen).toEqual([90]);
});

it("doesn't re-bake a clip when only its start changes", () => {
	const { player } = createPlayer();
	const reload = jest.spyOn(player, "reloadAsset").mockResolvedValue(undefined);

	player.setResolvedTiming({ start: sec(5), length: sec(60) });

	expect(reload).not.toHaveBeenCalled();
});

it("re-bakes a clip whose length resolves while it mounts", async () => {
	const { player, harness } = createMountingPlayer("on-load");
	jest.spyOn(harness, "hashAsset").mockResolvedValue("mounted");
	const reload = jest.spyOn(player, "reloadAsset").mockResolvedValue(undefined);

	const load = player.load();
	player.setResolvedTiming({ start: sec(0), length: sec(90) });
	await load;

	expect(reload).toHaveBeenCalledTimes(1);
});

it("doesn't mount a clip that hasn't loaded when its length resolves", async () => {
	const { player, harness } = createMountingPlayer("on-load");
	jest.spyOn(harness, "hashAsset").mockResolvedValue("mounted");
	const reload = jest.spyOn(player, "reloadAsset");

	player.setResolvedTiming({ start: sec(0), length: sec(90) });
	await flush();

	expect(reload).not.toHaveBeenCalled();
	expect(harness.iframe).toBeNull();
	expect(document.querySelectorAll("iframe")).toHaveLength(1);
});

it("keeps the newer key when an older reload's digest finishes last", async () => {
	const { player, harness, iframe } = createPlayer();
	const beginCapture = jest.spyOn(harness, "beginCapture").mockImplementation(() => {});
	const digests: ((key: string) => void)[] = [];
	jest.spyOn(harness, "hashAsset").mockImplementation(
		() =>
			new Promise(resolve => {
				digests.push(resolve);
			})
	);

	const older = player.reloadAsset();
	const newer = player.reloadAsset();
	digests[1]("newer");
	await flush();
	digests[0]("older");
	await flush();
	iframe.dispatchEvent(new Event("load"));
	await Promise.all([older, newer]);

	expect(harness.contentHash).toBe("newer");
	expect(beginCapture).toHaveBeenCalledTimes(1);
});

it("shows stills, not the live page, before an on-play edit plays", async () => {
	const { player, harness, capture, still } = createMountingPlayer("on-play");
	jest.spyOn(harness, "hashAsset").mockResolvedValue("mounted");
	await player.load();
	player.update(0, 0);

	expect(still).toHaveBeenCalledWith(0);
	expect(harness.iframe.style.left).toBe("-10000px");
	expect(capture).not.toHaveBeenCalled();
});
