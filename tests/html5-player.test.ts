/** @jest-environment jsdom */

import { Html5Player } from "@canvas/players/html5-player";
import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@schemas";

// Canvas rendering is unavailable in jsdom; the HTML5 DOM and state transitions stay real.
jest.mock("pixi.js", () => ({}));
jest.mock("@canvas/players/player", () => ({
	Player: class {
		update() {
			return this;
		}
	},
	PlayerType: { Html5: "html5" }
}));
jest.mock("@shotstack/shotstack-canvas", () => ({
	composeHtml5IframeSrcdoc: () => "<html><body>Updated</body></html>"
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
	hashAsset(): Promise<string>;
	beginCapture(): void;
	syncIframePosition(): void;
	transitionToPlayback(): Promise<void>;
};

function createPlayer() {
	const events = { emit: jest.fn() };
	const edit = { size: { width: 1080, height: 1920 }, isPlaying: false, getInternalEvents: () => events };
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
