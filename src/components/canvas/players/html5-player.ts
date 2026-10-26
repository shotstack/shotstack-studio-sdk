import { Player, PlayerType } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import type { ResolvedTiming } from "@core/timing/types";
import { type Size } from "@layouts/geometry";
import type { ResolvedClip } from "@schemas";
import { nextFrame } from "@shared/utils";
import {
	Html5AssetSchema,
	composeHtml5IframeSrcdoc,
	computeHtml5FrameCount,
	findHtml5IngestUrls,
	html5ClipLongestEdge,
	inlineHtml5IngestAssets,
	type Html5Asset
} from "@shotstack/shotstack-canvas";
import * as pixi from "pixi.js";

import { computeHtml5CacheKey, html5CacheGet, html5CachePut } from "./html5-cache";
import { createCaptureLoadingGraphic, createPlaceholderGraphic } from "./placeholder-graphic";

const IFRAME_OFFSCREEN_X = -10000;
const IFRAME_LOAD_TIMEOUT_MS = 10_000;
const DECODED_FRAME_LIMIT = 30;

type HarnessWindow = Window & {
	["__shotstackSeek"]?: (ms: number) => void;
};
const SEEK_KEY = "__shotstackSeek" as const;
const CAPTURE_CONCURRENCY = 4;

function forceLayout(el: HTMLElement): void {
	el.getBoundingClientRect();
}

function createOffscreenIframe(width: number, height: number): HTMLIFrameElement {
	const iframe = document.createElement("iframe");
	iframe.setAttribute("aria-hidden", "true");
	iframe.style.cssText =
		`position:absolute;left:${IFRAME_OFFSCREEN_X}px;top:0;width:${width}px;height:${height}px;` +
		`border:0;margin:0;padding:0;pointer-events:none;background:transparent`;
	return iframe;
}

function waitForIframeLoad(iframe: HTMLIFrameElement, timeoutMs: number = IFRAME_LOAD_TIMEOUT_MS, awaitNextLoad: boolean = false): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!awaitNextLoad && iframe.contentDocument?.readyState === "complete") {
			resolve();
			return;
		}
		let timer: number = 0;
		const onLoad = (): void => {
			window.clearTimeout(timer);
			resolve();
		};
		timer = window.setTimeout(() => {
			iframe.removeEventListener("load", onLoad);
			reject(new Error(`iframe load timed out after ${timeoutMs}ms — user JS may have hung`));
		}, timeoutMs);
		iframe.addEventListener("load", onLoad, { once: true });
	});
}

async function foreignObjectSvgToWebp(svg: string, width: number, height: number): Promise<Uint8Array> {
	const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	const img = new Image();
	img.src = url;
	await img.decode();
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("2D context unavailable for foreignObject rasterise");
	ctx.drawImage(img, 0, 0, width, height);
	const blob = await new Promise<Blob | null>(resolve => {
		canvas.toBlob(resolve, "image/webp", 0.85);
	});
	if (!blob) throw new Error(`canvas.toBlob returned null — taint? (svg bytes=${svg.length})`);
	return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Drives whether stills or the captured frame[] fill the clip's canvas layer. The iframe stays off-screen.
 *
 *   editing   — stills of the playhead's frame. Default for new content.
 *   capturing — stills while frames bake, with a loading placeholder until the first one arrives.
 *   playback  — captured sprite mounted.
 *   stale     — captured frame[] invalidated by content change; stills until the next bake.
 *   failed    — placeholder stays in the clip's canvas layer.
 */
type Html5Mode = "editing" | "capturing" | "playback" | "stale" | "failed";

export class Html5Player extends Player {
	private static captureChain: Promise<unknown> = Promise.resolve();

	private iframe: HTMLIFrameElement | null = null;
	private renderedWidth: number = 0;
	private renderedHeight: number = 0;
	private capturedFrames: Blob[] | null = null;
	private decodedFrames: Map<number, pixi.Texture> = new Map();
	private decodeInFlight: number | null = null;
	private captureInFlight: Promise<Blob[] | null> | null = null;
	private captureFps: number = 30;
	private mode: Html5Mode = "editing";
	private contentHash: string | null = null;
	private capturedHash: string | null = null;
	private lastFrameIdx: number = -1;
	private playbackSprite: pixi.Sprite | null = null;
	private staticSprite: pixi.Sprite | null = null;
	private hasTriggeredCapture: boolean = false;
	private loadingGraphic: pixi.Container | null = null;
	private fallbackGraphic: pixi.Graphics | null = null;
	private loadingSetProgress: ((fraction: number) => void) | null = null;
	private captureFramesDone: number = 0;
	private captureFramesTotal: number = 0;
	private disposed: boolean = false;
	private seekErrorReported: boolean = false;
	private mounting: Promise<void> | null = null;
	private lastReloadId: number = 0;
	private stillChain: Promise<unknown> = Promise.resolve();
	private stillIframe: HTMLIFrameElement | null = null;
	private stillHash: string | null = null;
	private stillTime: number = 0;
	private stillBlob: Blob | null = null;
	private stillTexture: pixi.Texture | null = null;
	private liveStill: pixi.Sprite | null = null;
	private liveStillFrame: number = -1;
	private liveStillInFlight: boolean = false;
	private stillRequest: number | null = null;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Html5);
	}

	private get asset(): Html5Asset {
		return this.clipConfiguration.asset as Html5Asset;
	}

	private get harnessWindow(): HarnessWindow | null {
		return (this.iframe?.contentWindow ?? null) as HarnessWindow | null;
	}

	// A bake holds a fixed number of frames at a fixed rate, so both belong in its key.
	private async hashAsset(): Promise<string> {
		const { asset, captureFps } = this;
		const { frameCount } = computeHtml5FrameCount({
			clipLengthSeconds: this.getLength(),
			jsContent: asset.js,
			cssContent: asset.css,
			fps: captureFps
		});
		const content = await computeHtml5CacheKey({
			html: asset.html ?? "",
			css: asset.css ?? "",
			js: asset.js ?? "",
			width: this.renderedWidth,
			height: this.renderedHeight
		});
		return `${content}:${frameCount}@${captureFps}`;
	}

	private getIframeMountElement(): HTMLElement {
		return this.edit.getCanvas()?.getRootElement() ?? document.body;
	}

	private seekHarness(seconds: number, win: HarnessWindow | null = this.harnessWindow): void {
		const seek = win?.[SEEK_KEY];
		if (typeof seek !== "function") return;
		try {
			seek.call(win, seconds * 1000);
		} catch (err) {
			if (!this.seekErrorReported) {
				this.seekErrorReported = true;
				console.warn("[Html5Player] __shotstackSeek threw (further errors suppressed):", err);
			}
		}
	}

	private emitCaptureFailed(error: unknown, fallback: string): void {
		const message = error instanceof Error ? error.message : String(error);
		try {
			this.edit.getInternalEvents().emit(EditEvent.ClipCaptureFailed, {
				clipId: this.clipId,
				assetType: "html5",
				error: message,
				fallback
			});
		} catch (emitErr) {
			console.warn("[Html5Player] failed to emit ClipCaptureFailed:", emitErr);
		}
	}

	private emitCaptureStarted(): void {
		try {
			this.edit.getInternalEvents().emit(EditEvent.ClipCaptureStarted, {
				clipId: this.clipId,
				assetType: "html5"
			});
		} catch (emitErr) {
			console.warn("[Html5Player] failed to emit ClipCaptureStarted:", emitErr);
		}
	}

	private emitCaptureCompleted(frameCount: number): void {
		try {
			this.edit.getInternalEvents().emit(EditEvent.ClipCaptureCompleted, {
				clipId: this.clipId,
				assetType: "html5",
				frameCount
			});
		} catch (emitErr) {
			console.warn("[Html5Player] failed to emit ClipCaptureCompleted:", emitErr);
		}
	}

	public override load(): Promise<void> {
		return this.trackMount(super.load().then(() => this.mountAsset()));
	}

	// A reload waits on this, so a mount slowed by ingest fetches never runs alongside a second one.
	private trackMount(mount: Promise<void>): Promise<void> {
		this.mounting = mount.finally(() => {
			this.mounting = null;
		});
		return this.mounting;
	}

	private async mountAsset(): Promise<void> {
		try {
			const validation = Html5AssetSchema.safeParse(this.asset);
			if (!validation.success) {
				this.createFallbackGraphic();
				return;
			}
			await this.mountIframe(validation.data);
			this.removeFallbackGraphic();
			this.configureKeyframes();
			// An edit that pre-renders on play leaves the bake to update(), which starts it once the edit plays.
			if (this.edit.getHtml5Prerender() === "on-load") this.beginCapture();
		} catch (error) {
			console.error("Failed to render html5 asset:", error instanceof Error ? `${error.message}\n${error.stack}` : error);
			this.recordLoadError(error);
			this.emitCaptureFailed(error, "static-placeholder");
			this.createFallbackGraphic();
		}
	}

	// Captured frames are SVG images, which can't load remote files, so ingest files are inlined as data URIs.
	// Callers await this only when the asset has ingest URLs, so other assets compose without yielding.
	private async composeWithIngestFiles(asset: Html5Asset): Promise<string> {
		const longestEdge = html5ClipLongestEdge(this.clipConfiguration, this.edit.getResolvedEdit()?.output);
		return composeHtml5IframeSrcdoc(await inlineHtml5IngestAssets(asset, longestEdge));
	}

	private async mountIframe(asset: Html5Asset): Promise<void> {
		const width = this.clipConfiguration.width || this.edit.size.width;
		const height = this.clipConfiguration.height || this.edit.size.height;
		this.renderedWidth = width;
		this.renderedHeight = height;
		this.captureFps = this.edit.getOutputFps() || 30;
		this.contentHash = await this.hashAsset();

		const iframe = createOffscreenIframe(width, height);
		iframe.srcdoc = findHtml5IngestUrls(asset).length > 0 ? await this.composeWithIngestFiles(asset) : composeHtml5IframeSrcdoc(asset);
		// Ingest fetches can outlast the player, and dispose only removes an iframe it can see.
		if (this.disposed) return;
		this.getIframeMountElement().appendChild(iframe);
		await waitForIframeLoad(iframe);

		this.iframe = iframe;
		this.transitionToEditing();
	}

	private async transitionToPlayback(): Promise<void> {
		if (!this.capturedFrames || this.capturedFrames.length === 0 || !this.iframe) return;
		// The playhead's own frame replaces the still, so the switch doesn't jump.
		const idx = Math.min(Math.max(0, Math.floor(this.getPlaybackTime() * this.captureFps)), this.capturedFrames.length - 1);
		const texture = await this.getDecodedFrame(idx);
		if (!texture || this.disposed) return;
		this.removeLiveStill();
		const sprite = new pixi.Sprite(texture);
		this.contentContainer.addChild(sprite);
		this.playbackSprite = sprite;
		this.lastFrameIdx = idx;
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}
		this.removeLoadingGraphic();
		this.mode = "playback";
		// Stills read the bake from here on, so the still page goes once any still using it is done.
		this.stillChain = this.stillChain.then(() => this.dropStillPage());
	}

	private transitionToEditing(): void {
		this.mode = "editing";
		this.removeLoadingGraphic();
	}

	private transitionToStale(): void {
		// Editing and stale show stills too, so a still of the old content goes whatever the mode.
		this.removeLiveStill();
		if (this.mode === "stale" || this.mode === "editing") return;
		if (this.playbackSprite) {
			this.contentContainer.removeChild(this.playbackSprite);
			this.playbackSprite.destroy();
			this.playbackSprite = null;
		}
		this.removeLoadingGraphic();
		this.removeFallbackGraphic();
		this.disposeCapturedFrames();
		this.mode = "stale";
	}

	private transitionToCapturing(): void {
		this.mode = "capturing";
		if (!this.liveStill) this.mountLoadingGraphic();
		this.emitCaptureStarted();
	}

	private transitionToFailed(): void {
		if (this.disposed) return;
		this.mode = "failed";
		this.removeLoadingGraphic();
		this.removeLiveStill();
		this.createFallbackGraphic();
	}

	// ─── capture pipeline ──────────────────────────────────────────────────────

	private async captureFrames(): Promise<Blob[] | null> {
		if (this.capturedFrames && this.capturedHash === this.contentHash) {
			return this.capturedFrames;
		}
		if (this.captureInFlight) {
			return this.captureInFlight;
		}
		const previous = Html5Player.captureChain;
		this.captureInFlight = previous
			.then(() => {
				if (this.disposed) return null;
				return this.runCapture();
			})
			.finally(() => {
				this.captureInFlight = null;
			});
		Html5Player.captureChain = this.captureInFlight.catch(() => undefined);
		return this.captureInFlight;
	}

	private async runCapture(): Promise<Blob[] | null> {
		if (!this.iframe || !this.iframe.contentDocument || !this.iframe.contentWindow) return null;

		if (!this.contentHash) return null;
		const cacheKey = this.contentHash;
		const stale = (): boolean => this.disposed || this.contentHash !== cacheKey;

		const cached = await html5CacheGet(cacheKey);
		if (stale()) return null;
		if (cached) {
			this.captureFramesTotal = cached.frameCount;
			this.captureFramesDone = cached.frameCount;
			this.captureFps = cached.fps;
			this.capturedFrames = cached.pngs;
			this.capturedHash = cacheKey;
			this.emitCaptureCompleted(cached.frameCount);
			return cached.pngs;
		}

		// An earlier capture may have seeked this iframe, and a seeked animation can leave state
		// a fresh page lacks (GSAP writes start values inline once a tween has
		// rendered). The backend captures from a fresh page, so capture does too.
		if (!(await this.loadFreshPage(this.iframe, stale))) return null;

		const { frameCount } = computeHtml5FrameCount({
			clipLengthSeconds: this.getLength(),
			jsContent: this.asset.js,
			cssContent: this.asset.css,
			fps: this.captureFps
		});
		const fps = this.captureFps;
		const W = this.renderedWidth;
		const H = this.renderedHeight;
		this.captureFramesTotal = frameCount;
		this.captureFramesDone = 0;

		const blobs: Blob[] = [];
		for (let i = 0; i < frameCount; i += CAPTURE_CONCURRENCY) {
			await nextFrame();
			if (stale()) return null;
			const batch: Promise<Uint8Array>[] = [];
			for (let j = i; j < Math.min(i + CAPTURE_CONCURRENCY, frameCount); j += 1) {
				this.seekHarness(j / fps);
				forceLayout(this.iframe.contentDocument.body);
				batch.push(foreignObjectSvgToWebp(this.captureIframeAsForeignObjectSvg(W, H), W, H));
			}
			const frames = await Promise.all(batch);
			if (stale()) return null;
			for (const frame of frames) {
				this.captureFramesDone += 1;
				blobs.push(new Blob([frame as BlobPart], { type: "image/webp" }));
			}
		}

		this.capturedFrames = blobs;
		this.capturedHash = cacheKey;
		this.emitCaptureCompleted(frameCount);

		html5CachePut(cacheKey, {
			pngs: blobs,
			fps,
			frameCount,
			width: this.renderedWidth,
			height: this.renderedHeight,
			createdAt: Date.now()
		}).catch(err => console.warn("[Html5Player] cache put failed:", err));

		return blobs;
	}

	private async loadFreshPage(iframe: HTMLIFrameElement, stale: () => boolean): Promise<boolean> {
		const srcdoc = findHtml5IngestUrls(this.asset).length > 0 ? await this.composeWithIngestFiles(this.asset) : composeHtml5IframeSrcdoc(this.asset);
		if (stale()) return false;
		iframe.srcdoc = srcdoc; // eslint-disable-line no-param-reassign -- reloading the iframe it is given is this helper's job
		await waitForIframeLoad(iframe, undefined, true);
		if (stale() || !iframe.contentDocument) return false;

		try {
			await iframe.contentDocument.fonts.ready;
		} catch {
			/* older browsers — proceed */
		}
		await nextFrame();
		return !stale();
	}

	private captureIframeAsForeignObjectSvg(width: number, height: number, iframe: HTMLIFrameElement | null = this.iframe): string {
		if (!iframe?.contentDocument) throw new Error("iframe not ready");
		const doc = iframe.contentDocument;
		const serializer = new XMLSerializer();
		const styles = Array.from(doc.querySelectorAll("style"))
			.map(el => serializer.serializeToString(el))
			.join("");
		const animationOverride = `<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>`;
		const bodyClone = doc.body.cloneNode(true) as HTMLElement;
		// Scripts never run in an SVG image, and their source can hold characters XML forbids, which fail the frame.
		bodyClone.querySelectorAll("script").forEach(script => script.remove());
		// A cloned canvas has no pixels. Painting them as its own background keeps every style that targets the canvas.
		// An SVG image runs without scripting, so it lays a canvas out as fallback content: an inline box with no
		// size of its own. Pinning display and the used size inline restores the layout of the live canvas.
		const sourceCanvases = doc.body.querySelectorAll("canvas");
		const clonedCanvases = bodyClone.querySelectorAll("canvas");
		for (let i = 0; i < clonedCanvases.length; i += 1) {
			const { style } = clonedCanvases[i];
			const used = doc.defaultView?.getComputedStyle(sourceCanvases[i]);
			if (used) {
				style.display = used.display === "inline" ? "inline-block" : used.display;
				style.width = used.width;
				style.height = used.height;
			}
			try {
				style.backgroundImage = `url("${sourceCanvases[i].toDataURL()}")`;
				style.backgroundSize = "100% 100%";
				style.backgroundOrigin = "content-box";
				style.backgroundRepeat = "no-repeat";
			} catch {
				// a tainted canvas can't be read, so it stays blank
			}
		}
		const existingStyle = bodyClone.getAttribute("style") ?? "";
		bodyClone.setAttribute("style", `width:${width}px;height:${height}px;margin:0;overflow:hidden;${existingStyle}`);
		const bodyXml = serializer.serializeToString(bodyClone);
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="${width}" height="${height}">${styles}${animationOverride}${bodyXml}</foreignObject></svg>`;
	}

	private async getDecodedFrame(idx: number): Promise<pixi.Texture | null> {
		if (!this.capturedFrames) return null;
		const existing = this.decodedFrames.get(idx);
		if (existing) {
			this.decodedFrames.delete(idx);
			this.decodedFrames.set(idx, existing);
			return existing;
		}
		const blob = this.capturedFrames[idx];
		if (!blob) return null;
		const bmp = await createImageBitmap(blob);
		if (this.disposed) {
			bmp.close();
			return null;
		}
		const texture = pixi.Texture.from(bmp);
		if (this.disposed) {
			texture.destroy(true);
			return null;
		}
		this.decodedFrames.set(idx, texture);
		this.evictDecodedOverflow(idx);
		return texture;
	}

	private evictDecodedOverflow(protectIdx: number): void {
		while (this.decodedFrames.size > DECODED_FRAME_LIMIT) {
			let candidate: number | undefined;
			for (const k of this.decodedFrames.keys()) {
				if (k !== protectIdx && k !== this.lastFrameIdx) {
					candidate = k;
					break;
				}
			}
			if (candidate === undefined) break;
			this.decodedFrames.get(candidate)?.destroy(true);
			this.decodedFrames.delete(candidate);
		}
	}

	/**
	 * Project the current playhead's frame into the Pixi scene for an off-playback capture.
	 * @internal
	 */
	public override async prepareStaticRender(): Promise<void> {
		try {
			if (this.disposed || !this.iframe || this.mode === "failed") return;
			const seconds = this.getPlaybackTime();
			const frames = this.capturedFrames && this.capturedHash === this.contentHash ? this.capturedFrames : null;
			// The bake queues behind every other clip's, so a still without one renders just its own frame.
			const texture = frames
				? await this.getDecodedFrame(Math.min(Math.max(0, Math.floor(seconds * this.captureFps)), frames.length - 1))
				: await this.renderStill(seconds);
			if (this.disposed) return;
			if (!texture) {
				this.hideForCapture();
				return;
			}
			if (frames && this.playbackSprite) {
				this.playbackSprite.texture = texture;
				return;
			}
			this.stillTexture?.destroy(true);
			this.stillTexture = frames ? null : texture;
			this.hideForCapture();
			if (this.staticSprite) {
				this.staticSprite.texture = texture;
			} else {
				this.staticSprite = new pixi.Sprite(texture);
				// applyFixedDimensions fits the first sprite, which has to be this one and not a hidden still.
				this.contentContainer.addChildAt(this.staticSprite, 0);
				if (this.clipConfiguration.width && this.clipConfiguration.height) this.applyFixedDimensions();
			}
		} catch (err) {
			// A capture failure must leave only this clip blank in the snapshot — never break the whole capture.
			this.hideForCapture();
			console.warn("[Html5Player] prepareStaticRender failed:", err);
		}
	}

	// A transparent still would show these through it, and a failed one leaves the clip blank: the loading bar is
	// editor chrome, and the live still may be of another time.
	private hideForCapture(): void {
		if (this.loadingGraphic) this.loadingGraphic.visible = false;
		if (this.liveStill) this.liveStill.visible = false;
	}

	// Stills of one player share its still page, so they take turns on it.
	private renderStill(seconds: number): Promise<pixi.Texture | null> {
		const run = this.stillChain.then(() => this.runStill(seconds));
		this.stillChain = run.catch(() => undefined);
		return run;
	}

	private async runStill(seconds: number): Promise<pixi.Texture | null> {
		const cacheKey = this.contentHash;
		if (!cacheKey) return null;
		const stale = (): boolean => this.disposed || this.contentHash !== cacheKey;
		const cached = await html5CacheGet(cacheKey);
		if (stale()) return null;
		const fps = cached?.fps ?? this.captureFps;
		const frameCount =
			cached?.pngs.length ??
			computeHtml5FrameCount({ clipLengthSeconds: this.getLength(), jsContent: this.asset.js, cssContent: this.asset.css, fps }).frameCount;
		// Seeking to the bake's frame time makes a still match the frame playback shows there.
		const idx = Math.min(Math.max(0, Math.floor(seconds * fps)), frameCount - 1);
		const blob = cached ? cached.pngs[idx] : await this.captureStillFrame(idx / fps, cacheKey, stale);
		if (!blob || stale()) return null;
		const bmp = await createImageBitmap(blob);
		if (stale()) {
			bmp.close();
			return null;
		}
		return pixi.Texture.from(bmp);
	}

	// A still seeks a page of its own, so the bake's page only ever moves forward from a fresh load. The still page
	// moves forward too: going back reloads it, since a rewound tween leaves its start values inline.
	private async captureStillFrame(seconds: number, cacheKey: string, stale: () => boolean): Promise<Blob | null> {
		// A capture usually asks for the frame the live still has just taken.
		if (this.stillBlob && this.stillHash === cacheKey && this.stillTime === seconds) return this.stillBlob;
		this.stillBlob = null;
		if (!this.stillIframe) {
			this.stillIframe = createOffscreenIframe(this.renderedWidth, this.renderedHeight);
			this.getIframeMountElement().appendChild(this.stillIframe);
		}
		const iframe = this.stillIframe;
		if (this.stillHash !== cacheKey || seconds < this.stillTime) {
			this.stillHash = null;
			if (!(await this.loadFreshPage(iframe, stale))) return null;
			this.stillHash = cacheKey;
		}
		const doc = iframe.contentDocument;
		if (!doc) return null;
		this.stillTime = seconds;
		this.seekHarness(seconds, iframe.contentWindow);
		forceLayout(doc.body);
		const W = this.renderedWidth;
		const H = this.renderedHeight;
		const frame = await foreignObjectSvgToWebp(this.captureIframeAsForeignObjectSvg(W, H, iframe), W, H);
		this.stillBlob = new Blob([frame as BlobPart], { type: "image/webp" });
		return this.stillBlob;
	}

	private dropStillPage(): void {
		this.stillIframe?.remove();
		this.stillIframe = null;
		this.stillHash = null;
		this.stillBlob = null;
	}

	/** @internal */
	public override endStaticRender(): void {
		if (this.loadingGraphic) this.loadingGraphic.visible = true;
		if (this.liveStill) this.liveStill.visible = true;
		if (!this.staticSprite) return;
		this.contentContainer.removeChild(this.staticSprite);
		// A baked frame's texture belongs to the decoded-frame cache, so only a still's own texture goes with the sprite.
		this.staticSprite.destroy();
		this.staticSprite = null;
		this.stillTexture?.destroy(true);
		this.stillTexture = null;
	}

	// Every path that resolves a clip's length lands here. A clip yet to mount reads its length when it does.
	public override setResolvedTiming(timing: ResolvedTiming): void {
		const previousLength = this.getLength();
		super.setResolvedTiming(timing);
		if (timing.length === previousLength || !(this.iframe || this.mounting)) return;
		this.reloadAsset().catch(err => console.warn("[Html5Player] re-bake after a length change failed:", err));
	}

	public override async reloadAsset(): Promise<void> {
		if (this.mounting) {
			await this.mounting;
			await this.reloadAsset();
			return;
		}
		if (this.disposed) return;
		if (!this.iframe) {
			// A failed mount leaves no iframe to reload, so the changed asset gets a fresh mount.
			this.loadError = null;
			await this.trackMount(this.mountAsset());
			return;
		}
		this.lastReloadId += 1;
		const reloadId = this.lastReloadId;
		const newHash = await this.hashAsset();
		// Digests can finish out of order, so only the newest reload may write the key and the page.
		if (reloadId !== this.lastReloadId) return;
		if (newHash === this.contentHash) return;
		this.contentHash = newHash;
		this.transitionToStale();
		this.disposeCapturedFrames();
		this.captureInFlight = null;
		this.hasTriggeredCapture = false;
		this.seekErrorReported = false;
		try {
			const srcdoc =
				findHtml5IngestUrls(this.asset).length > 0 ? await this.composeWithIngestFiles(this.asset) : composeHtml5IframeSrcdoc(this.asset);
			if (this.disposed || this.contentHash !== newHash) return;
			// A capture that started while the files loaded writes this page itself; writing it here would reload the page mid-capture.
			if (this.captureInFlight) return;
			this.iframe.srcdoc = srcdoc;
			await waitForIframeLoad(this.iframe, undefined, true);
			if (this.disposed || this.contentHash !== newHash) return;
			if (this.edit.getHtml5Prerender() === "on-load") this.beginCapture();
		} catch (err) {
			if (this.disposed || this.contentHash !== newHash) return;
			console.warn("[Html5Player] reload iframe load failed:", err);
			this.emitCaptureFailed(err, "static-placeholder");
			this.transitionToFailed();
		}
	}

	private disposeCapturedFrames(): void {
		for (const texture of this.decodedFrames.values()) texture.destroy(true);
		this.decodedFrames.clear();
		this.capturedFrames = null;
		this.capturedHash = null;
		this.lastFrameIdx = -1;
		this.decodeInFlight = null;
	}

	private createFallbackGraphic(): void {
		if (this.fallbackGraphic) return;
		const width = this.clipConfiguration.width || this.edit.size.width;
		const height = this.clipConfiguration.height || this.edit.size.height;
		const graphics = createPlaceholderGraphic(width, height);
		this.fallbackGraphic = graphics;
		this.renderedWidth = width;
		this.renderedHeight = height;
		this.contentContainer.addChild(graphics);
		this.configureKeyframes();
	}

	private removeFallbackGraphic(): void {
		if (!this.fallbackGraphic) return;
		this.contentContainer.removeChild(this.fallbackGraphic);
		this.fallbackGraphic.destroy();
		this.fallbackGraphic = null;
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);
		this.triggerCaptureIfNeeded();
		if (this.mode === "playback") {
			this.driveSpriteTextureSwap();
		} else if (this.iframe && this.mode !== "failed" && this.isActive()) {
			if (this.loadingSetProgress && this.captureFramesTotal > 0) {
				this.loadingSetProgress(this.captureFramesDone / this.captureFramesTotal);
			}
			this.showStillAt(this.getPlaybackTime());
		}
	}

	private beginCapture(): void {
		if (this.disposed || !this.iframe) return;
		if (this.mode === "capturing" || this.mode === "playback") return;
		if (this.captureInFlight) return;
		const hashAtStart = this.contentHash;

		if (this.capturedFrames && this.capturedHash === this.contentHash) {
			this.transitionToPlayback().catch(err => {
				if (this.disposed || this.contentHash !== hashAtStart) return;
				console.warn("[Html5Player] transitionToPlayback failed:", err);
				this.emitCaptureFailed(err, "static-placeholder");
				this.transitionToFailed();
			});
			return;
		}

		this.transitionToCapturing();
		this.captureFrames()
			.then(async frames => {
				if (this.disposed || this.contentHash !== hashAtStart) return;
				const fresh = !!frames && frames.length > 0 && this.capturedHash === hashAtStart;
				if (!fresh) {
					if (this.mode === "capturing") this.transitionToFailed();
					return;
				}
				await this.transitionToPlayback();
			})
			.catch(err => {
				if (this.disposed || this.contentHash !== hashAtStart) return;
				console.warn("[Html5Player] capture failed:", err);
				this.emitCaptureFailed(err, "static-placeholder");
				if (this.mode === "capturing") this.transitionToFailed();
			});
	}

	private triggerCaptureIfNeeded(): void {
		if (this.hasTriggeredCapture) return;
		if (!this.iframe || !this.edit.isPlaying) return;
		if (this.mode !== "editing" && this.mode !== "stale") return;
		this.hasTriggeredCapture = true;
		this.beginCapture();
	}

	private mountLoadingGraphic(): void {
		if (this.loadingGraphic) return;
		const width = this.renderedWidth || this.edit.size.width;
		const height = this.renderedHeight || this.edit.size.height;
		const { container, setProgress } = createCaptureLoadingGraphic(width, height);
		this.loadingGraphic = container;
		this.loadingSetProgress = setProgress;
		this.contentContainer.addChild(container);
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}
	}

	private removeLoadingGraphic(): void {
		if (!this.loadingGraphic) return;
		this.contentContainer.removeChild(this.loadingGraphic);
		this.loadingGraphic.destroy({ children: true });
		this.loadingGraphic = null;
		this.loadingSetProgress = null;
	}

	private driveSpriteTextureSwap(): void {
		if (!this.playbackSprite || !this.capturedFrames) return;
		const idx = Math.min(Math.max(0, Math.floor(this.getPlaybackTime() * this.captureFps)), this.capturedFrames.length - 1);
		if (idx === this.lastFrameIdx) return;

		const cached = this.decodedFrames.get(idx);
		if (cached) {
			// Promote to MRU.
			this.decodedFrames.delete(idx);
			this.decodedFrames.set(idx, cached);
			this.playbackSprite.texture = cached;
			this.lastFrameIdx = idx;
			return;
		}
		if (this.decodeInFlight === idx) return;
		this.decodeInFlight = idx;
		this.getDecodedFrame(idx)
			.then(texture => {
				if (this.decodeInFlight === idx) this.decodeInFlight = null;
				if (!texture || !this.playbackSprite || this.disposed) return;
				const current = Math.min(Math.max(0, Math.floor(this.getPlaybackTime() * this.captureFps)), (this.capturedFrames?.length ?? 1) - 1);
				if (Math.abs(current - idx) > 3) return;
				this.playbackSprite.texture = texture;
				this.lastFrameIdx = idx;
			})
			.catch(err => console.warn("[Html5Player] frame decode failed:", err));
	}

	// One still renders at a time. Positions asked for meanwhile replace each other, so only the newest renders next.
	private showStillAt(seconds: number): void {
		const frame = Math.floor(seconds * this.captureFps);
		if (frame === this.liveStillFrame) return;
		this.liveStillFrame = frame;
		this.stillRequest = seconds;
		if (!this.liveStillInFlight) this.renderLiveStills().catch(err => console.warn("[Html5Player] still failed:", err));
	}

	private async renderLiveStills(): Promise<void> {
		this.liveStillInFlight = true;
		try {
			while (this.stillRequest !== null) {
				const seconds = this.stillRequest;
				const frame = Math.floor(seconds * this.captureFps);
				const hash = this.contentHash;
				this.stillRequest = null;
				const attempt = () =>
					this.renderStill(seconds).catch(err => {
						if (!this.disposed) console.warn("[Html5Player] still failed:", err);
						return null;
					});
				let texture = await attempt();
				// A page can load too slowly once, so a failed still gets one more try while nothing newer is waiting.
				if (!texture && this.liveStillFrame === frame && this.stillRequest === null) texture = await attempt();
				const unbaked = this.mode === "editing" || this.mode === "stale" || this.mode === "capturing";
				if (!texture || this.disposed || !unbaked || this.contentHash !== hash) {
					texture?.destroy(true);
				} else if (this.liveStill) {
					this.liveStill.texture.destroy(true);
					this.liveStill.texture = texture;
				} else {
					this.removeLoadingGraphic();
					this.liveStill = new pixi.Sprite(texture);
					// A capture in progress shows its own copy of the clip.
					this.liveStill.visible = !this.staticSprite;
					this.contentContainer.addChild(this.liveStill);
					if (this.clipConfiguration.width && this.clipConfiguration.height) this.applyFixedDimensions();
				}
			}
		} finally {
			this.liveStillInFlight = false;
		}
	}

	private removeLiveStill(): void {
		this.stillRequest = null;
		this.liveStillFrame = -1;
		if (!this.liveStill) return;
		this.contentContainer.removeChild(this.liveStill);
		this.liveStill.texture.destroy(true);
		this.liveStill.destroy();
		this.liveStill = null;
	}

	public override dispose(): void {
		this.disposed = true;
		this.removeFallbackGraphic();
		super.dispose();
		this.iframe?.remove();
		this.iframe = null;
		this.playbackSprite?.destroy();
		this.playbackSprite = null;
		this.staticSprite?.destroy();
		this.staticSprite = null;
		this.stillTexture?.destroy(true);
		this.stillTexture = null;
		this.removeLiveStill();
		this.dropStillPage();
		this.removeLoadingGraphic();
		this.disposeCapturedFrames();
	}

	public override getSize(): Size {
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			return { width: this.clipConfiguration.width, height: this.clipConfiguration.height };
		}
		return this.getContentSize();
	}

	public override getContentSize(): Size {
		return {
			width: this.renderedWidth || this.edit.size.width,
			height: this.renderedHeight || this.edit.size.height
		};
	}

	protected override getFitScale(): number {
		return 1;
	}

	public override supportsEdgeResize(): boolean {
		return true;
	}

	protected override onDimensionsChanged(): void {
		// Frames keep the size the page mounted at, and applyFixedDimensions fits them to the clip each tick.
	}
}
