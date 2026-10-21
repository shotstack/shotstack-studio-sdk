/** @jest-environment jsdom */

import { Html5Player } from "@canvas/players/html5-player";
import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@schemas";

// Canvas rendering is unavailable in jsdom; the HTML5 DOM and state transitions stay real.
jest.mock("pixi.js", () => ({}));
jest.mock("@canvas/players/player", () => ({
	Player: class {
		async load() {
			await Promise.resolve(this);
		}

		recordLoadError = jest.fn();

		update() {
			return this;
		}
	},
	PlayerType: { Html5: "html5" }
}));
jest.mock("@shotstack/shotstack-canvas", () => ({
	Html5AssetSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
	composeHtml5IframeSrcdoc: jest.fn(() => "<html><body>Updated</body></html>"),
	computeHtml5FrameCount: () => ({ frameCount: 1 }),
	findHtml5IngestUrls: jest.fn(() => []),
	html5ClipLongestEdge: jest.fn(() => 1280),
	inlineHtml5IngestAssets: jest.fn()
}));
const canvasLib = jest.requireMock("@shotstack/shotstack-canvas") as {
	composeHtml5IframeSrcdoc: jest.Mock;
	findHtml5IngestUrls: jest.Mock;
	html5ClipLongestEdge: jest.Mock;
	inlineHtml5IngestAssets: jest.Mock;
};
const INGEST_URL = "https://shotstack-ingest-api-v1-sources.s3.ap-southeast-2.amazonaws.com/owner/src/source.png";
const flush = () =>
	new Promise(resolve => {
		setTimeout(resolve, 0);
	});
jest.mock("@canvas/players/html5-cache", () => ({
	html5CacheGet: async () => null,
	html5CachePut: async () => undefined
}));
jest.mock("@canvas/players/placeholder-graphic", () => ({
	createPlaceholderGraphic: () => ({ kind: "failed", destroy: jest.fn() }),
	createCaptureLoadingGraphic: () => ({ container: { kind: "loading", destroy: jest.fn() }, setProgress: jest.fn() })
}));

type PlayerHarness = {
	iframe: HTMLIFrameElement;
	contentHash: string;
	capturedHash: string | null;
	capturedFrames: Blob[] | null;
	contentContainer: { children: unknown[] };
	captureIframeAsForeignObjectSvg(width: number, height: number): string;
	captureFrames(): Promise<Blob[] | null>;
	seekHarness(seconds: number): void;
	hashAsset(): Promise<string>;
	beginCapture(): void;
	syncIframePosition(): void;
	transitionToPlayback(): Promise<void>;
};

function createPlayer() {
	const events = { emit: jest.fn() };
	const edit = {
		size: { width: 1080, height: 1920 },
		isPlaying: false,
		getInternalEvents: () => events,
		getResolvedEdit: () => ({ output: { resolution: "hd" } })
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
			removeChild: (child: unknown) => children.splice(children.indexOf(child), 1)
		},
		configureKeyframes: jest.fn(),
		isActive: () => true,
		getPlaybackTime: () => 0
	});
	return { player, harness: player as unknown as PlayerHarness, iframe, events, edit };
}

afterEach(() => {
	jest.restoreAllMocks();
	jest.useRealTimers();
	document.body.replaceChildren();
});

it("ignores a capture decode failure after its content has been replaced", async () => {
	const { harness, events } = createPlayer();
	jest.spyOn(console, "warn").mockImplementation(() => {});
	harness.capturedFrames = [new Blob()];
	harness.capturedHash = harness.contentHash;
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
	await new Promise(resolve => {
		setTimeout(resolve, 0);
	});
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
	const sync = jest.spyOn(harness, "syncIframePosition").mockImplementation(() => {
		iframe.style.left = "0px";
	});

	harness.beginCapture();
	await new Promise(resolve => {
		setTimeout(resolve, 0);
	});
	player.update(0, 0);
	edit.isPlaying = true;
	player.update(0, 0);
	player.update(0, 0);
	await player.prepareStaticRender();

	expect(iframe.style.left).toBe("-10000px");
	expect(sync).not.toHaveBeenCalled();
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
	jest.spyOn(harness as unknown as { runCapture(): Promise<Blob[] | null> }, "runCapture").mockImplementation(() => {
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

	expect(iframe.srcdoc).toBe("<p>capture</p>");
	expect(beginCapture).toHaveBeenCalledTimes(1);
});
