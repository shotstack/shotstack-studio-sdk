/** @jest-environment jsdom */

import { Html5Player } from "@canvas/players/html5-player";
import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@schemas";

// Canvas rendering is unavailable in jsdom; the HTML5 DOM and state transitions stay real.
jest.mock("pixi.js", () => ({
	Sprite: jest.fn((texture: unknown) => ({ texture, destroy: jest.fn() })),
	Texture: { from: (source: unknown) => ({ source, destroy: jest.fn() }) }
}));
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
	computeHtml5FrameCount: ({ clipLengthSeconds, fps }: { clipLengthSeconds: number; fps: number }) => ({
		frameCount: Math.ceil(clipLengthSeconds * fps)
	}),
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
	computeHtml5CacheKey: jest.fn(async () => "key"),
	html5CacheGet: jest.fn(async () => null),
	html5CachePut: async () => undefined
}));
const cacheLib = jest.requireMock("@canvas/players/html5-cache") as { computeHtml5CacheKey: jest.Mock; html5CacheGet: jest.Mock };
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
	captureIframeAsForeignObjectSvg(width: number, height: number, iframe?: HTMLIFrameElement | null): string;
	captureFrames(): Promise<Blob[] | null>;
	runCapture(): Promise<Blob[] | null>;
	seekHarness(seconds: number, win?: Window | null): void;
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
		getHtml5Prerender: () => "on-load",
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

it("keys a capture to the clip's length and frame rate", async () => {
	const { player, harness } = createPlayer();
	Object.assign(player, { captureFps: 25, getLength: () => 4 });
	await harness.hashAsset();
	expect(cacheLib.computeHtml5CacheKey).toHaveBeenLastCalledWith(expect.objectContaining({ length: 4, fps: 25 }));
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

it("renders a still from its own page without waiting for the clip's capture", async () => {
	const { player, harness, iframe } = createStillPlayer();
	Object.assign(player, { getLength: () => 60, getPlaybackTime: () => 12.5 });
	jest.spyOn(harness, "captureFrames").mockImplementation(() => new Promise(() => {}));
	const serialise = jest.spyOn(harness, "captureIframeAsForeignObjectSvg");
	harness.beginCapture();

	await player.prepareStaticRender();

	const [loading, sprite] = harness.contentContainer.children as [{ visible?: boolean }, StaticSprite];
	expect(serialise).toHaveBeenCalledTimes(1);
	expect(serialise.mock.calls[0][2]).not.toBe(iframe);
	expect(await frameMarkup(sprite.texture.source.blob)).toContain(">t=12.5<");
	expect(loading.visible).toBe(false);
	player.endStaticRender();
	expect(loading.visible).toBe(true);
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
	harness.capturedHash = harness.contentHash;
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

function createMountingPlayer(html5Prerender: "on-load" | "on-play") {
	const created = createPlayer();
	Object.assign(created.edit, { getOutputFps: () => 30, getCanvas: () => null, getHtml5Prerender: () => html5Prerender });
	Object.assign(created.player, { iframe: null });
	jest.spyOn(created.harness, "syncIframePosition").mockImplementation(() => {});
	jest.spyOn(created.harness, "seekHarness").mockImplementation(() => {});
	const capture = jest.spyOn(created.harness, "captureFrames").mockImplementation(() => new Promise(() => {}));
	return { ...created, capture };
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
