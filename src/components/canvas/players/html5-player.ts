import { Player, PlayerType } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import { type Size } from "@layouts/geometry";
import type { ResolvedClip } from "@schemas";
import {
	Html5AssetSchema,
	composeHtml5IframeSrcdoc,
	computeHtml5FrameCount,
	detectHtml5DurationWithRetry,
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
	["__shotstackDetectDurationMs"]?: () => number;
};
const SEEK_KEY = "__shotstackSeek" as const;
const DETECT_KEY = "__shotstackDetectDurationMs" as const;
const CAPTURE_CONCURRENCY = 4;

function yieldFrame(): Promise<void> {
	return new Promise<void>(resolve => {
		if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
		else setTimeout(() => resolve(), 0);
	});
}

function forceLayout(el: HTMLElement): void {
	el.getBoundingClientRect();
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
 * Drives whether the live iframe or the captured frame[] is the visible source.
 *
 *   editing   — iframe live, no sprite. Default for new content.
 *   capturing — iframe parked, loading placeholder shown. Triggered by first Play.
 *   playback  — captured sprite mounted, iframe parked. Pixi-side filters apply.
 *   stale     — captured frame[] invalidated by content change; iframe re-shown.
 */
type Html5Mode = "editing" | "capturing" | "playback" | "stale";

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
	private loadingSetProgress: ((fraction: number) => void) | null = null;
	private captureFramesDone: number = 0;
	private captureFramesTotal: number = 0;
	private disposed: boolean = false;
	private seekErrorReported: boolean = false;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Html5);
	}

	private get asset(): Html5Asset {
		return this.clipConfiguration.asset as Html5Asset;
	}

	private get harnessWindow(): HarnessWindow | null {
		return (this.iframe?.contentWindow ?? null) as HarnessWindow | null;
	}

	private hashAsset(): Promise<string> {
		const { asset } = this;
		return computeHtml5CacheKey({
			html: asset.html ?? "",
			css: asset.css ?? "",
			js: asset.js ?? "",
			width: this.renderedWidth,
			height: this.renderedHeight
		});
	}

	private getStudioCanvas(): HTMLCanvasElement | null {
		return this.edit.getCanvas()?.application.canvas ?? null;
	}

	private getIframeMountElement(): HTMLElement {
		return this.edit.getCanvas()?.getRootElement() ?? document.body;
	}

	private parkIframe(): void {
		if (this.iframe) this.iframe.style.left = `${IFRAME_OFFSCREEN_X}px`;
	}

	private seekHarness(seconds: number): void {
		const win = this.harnessWindow;
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

	/**
	 * Returns the harness-reported duration in ms, or null if unavailable.
	 */
	private probeDurationMs(): number | null {
		const detect = this.harnessWindow?.[DETECT_KEY];
		if (typeof detect !== "function") return null;
		try {
			const ms = detect();
			if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) return ms;
		} catch (err) {
			console.warn("[Html5Player] __shotstackDetectDurationMs threw:", err);
		}
		return null;
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

	public override async load(): Promise<void> {
		await super.load();
		try {
			const validation = Html5AssetSchema.safeParse(this.asset);
			if (!validation.success) {
				this.createFallbackGraphic();
				return;
			}
			await this.mountIframe(validation.data);
			this.configureKeyframes();
			this.beginCapture();
		} catch (error) {
			console.error("Failed to render html5 asset:", error instanceof Error ? `${error.message}\n${error.stack}` : error);
			this.createFallbackGraphic();
		}
	}

	private async mountIframe(asset: Html5Asset): Promise<void> {
		const width = this.clipConfiguration.width || this.edit.size.width;
		const height = this.clipConfiguration.height || this.edit.size.height;
		this.renderedWidth = width;
		this.renderedHeight = height;
		this.captureFps = this.edit.getOutputFps() || 30;
		this.contentHash = await this.hashAsset();

		const iframe = document.createElement("iframe");
		iframe.setAttribute("aria-hidden", "true");
		iframe.style.cssText =
			`position:absolute;left:${IFRAME_OFFSCREEN_X}px;top:0;width:${width}px;height:${height}px;` +
			`border:0;margin:0;padding:0;pointer-events:none;transform-origin:top left;` +
			`z-index:50;background:transparent`;
		iframe.srcdoc = composeHtml5IframeSrcdoc(asset);
		this.getIframeMountElement().appendChild(iframe);
		await waitForIframeLoad(iframe);

		this.iframe = iframe;
		this.transitionToEditing();
	}

	private async transitionToPlayback(): Promise<void> {
		if (!this.capturedFrames || this.capturedFrames.length === 0 || !this.iframe) return;
		const firstTexture = await this.getDecodedFrame(0);
		if (!firstTexture || this.disposed) return;
		const sprite = new pixi.Sprite(firstTexture);
		this.contentContainer.addChild(sprite);
		this.playbackSprite = sprite;
		this.lastFrameIdx = 0;
		if (this.clipConfiguration.width && this.clipConfiguration.height) {
			this.applyFixedDimensions();
		}
		this.removeLoadingGraphic();
		this.parkIframe();
		this.mode = "playback";
	}

	private transitionToEditing(): void {
		this.mode = "editing";
		this.removeLoadingGraphic();
	}

	private transitionToStale(): void {
		if (this.mode === "stale" || this.mode === "editing") return;
		if (this.playbackSprite) {
			this.contentContainer.removeChild(this.playbackSprite);
			this.playbackSprite.destroy();
			this.playbackSprite = null;
		}
		this.removeLoadingGraphic();
		this.disposeCapturedFrames();
		this.mode = "stale";
	}

	private transitionToCapturing(): void {
		this.mode = "capturing";
		this.parkIframe();
		this.mountLoadingGraphic();
		this.emitCaptureStarted();
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

		try {
			await this.iframe.contentDocument.fonts.ready;
		} catch {
			/* older browsers — proceed */
		}
		await yieldFrame();
		if (stale()) return null;

		const detectedDurationMs = await detectHtml5DurationWithRetry(() => this.probeDurationMs(), stale);
		if (stale()) return null;

		const { frameCount } = computeHtml5FrameCount({
			detectedDurationMs,
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
			await yieldFrame();
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

	private captureIframeAsForeignObjectSvg(width: number, height: number): string {
		if (!this.iframe?.contentDocument) throw new Error("iframe not ready");
		const doc = this.iframe.contentDocument;
		const styles = Array.from(doc.querySelectorAll("style"))
			.map(el => `<style>${el.textContent ?? ""}</style>`)
			.join("");
		const animationOverride = `<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>`;
		const bodyClone = doc.body.cloneNode(true) as HTMLElement;
		bodyClone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
		const existingStyle = bodyClone.getAttribute("style") ?? "";
		bodyClone.setAttribute("style", `width:${width}px;height:${height}px;margin:0;overflow:hidden;${existingStyle}`);
		const bodyXml = new XMLSerializer().serializeToString(bodyClone);
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
			if (this.disposed || !this.iframe) return;
			const frames = await this.captureFrames();
			if (this.disposed || !frames || frames.length === 0) return;
			const idx = Math.min(Math.max(0, Math.floor(this.getPlaybackTime() * this.captureFps)), frames.length - 1);
			const texture = await this.getDecodedFrame(idx);
			if (this.disposed || !texture) return;
			if (this.playbackSprite) {
				this.playbackSprite.texture = texture;
				return;
			}
			if (this.staticSprite) {
				this.staticSprite.texture = texture;
			} else {
				this.staticSprite = new pixi.Sprite(texture);
				this.contentContainer.addChild(this.staticSprite);
				if (this.clipConfiguration.width && this.clipConfiguration.height) this.applyFixedDimensions();
			}
		} catch (err) {
			// A capture failure must leave only this clip blank in the snapshot — never break the whole capture.
			console.warn("[Html5Player] prepareStaticRender failed:", err);
		}
	}

	/** @internal */
	public override endStaticRender(): void {
		if (!this.staticSprite) return;
		this.contentContainer.removeChild(this.staticSprite);
		// Texture is owned by the decoded-frame cache — destroy the sprite but not the texture.
		this.staticSprite.destroy();
		this.staticSprite = null;
	}

	public override async reloadAsset(): Promise<void> {
		if (!this.iframe) return;
		const newHash = await this.hashAsset();
		if (newHash === this.contentHash) return;
		this.contentHash = newHash;
		this.transitionToStale();
		this.disposeCapturedFrames();
		this.captureInFlight = null;
		this.hasTriggeredCapture = false;
		this.seekErrorReported = false;
		this.iframe.srcdoc = composeHtml5IframeSrcdoc(this.asset);
		try {
			await waitForIframeLoad(this.iframe, undefined, true);
			this.beginCapture();
		} catch (err) {
			console.warn("[Html5Player] reload iframe load failed:", err);
			this.emitCaptureFailed(err, "static-placeholder");
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
		const width = this.clipConfiguration.width || this.edit.size.width;
		const height = this.clipConfiguration.height || this.edit.size.height;
		const graphics = createPlaceholderGraphic(width, height);
		this.renderedWidth = width;
		this.renderedHeight = height;
		this.contentContainer.addChild(graphics);
		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);
		this.triggerCaptureIfNeeded();
		if (this.mode === "playback") {
			this.driveSpriteTextureSwap();
		} else if (this.mode === "capturing") {
			if (this.loadingSetProgress && this.captureFramesTotal > 0) {
				this.loadingSetProgress(this.captureFramesDone / this.captureFramesTotal);
			}
		} else if (this.iframe) {
			this.syncIframePosition();
			if (this.isActive()) this.seekHarness(this.getPlaybackTime());
		}
	}

	private beginCapture(): void {
		if (this.disposed || !this.iframe) return;
		if (this.mode === "capturing" || this.mode === "playback") return;
		if (this.captureInFlight) return;

		if (this.capturedFrames && this.capturedHash === this.contentHash) {
			this.transitionToPlayback().catch(err => {
				console.warn("[Html5Player] transitionToPlayback failed:", err);
				this.transitionToEditing();
			});
			return;
		}

		this.transitionToCapturing();
		const hashAtStart = this.contentHash;
		this.captureFrames()
			.then(async frames => {
				if (this.disposed) return;
				const fresh = !!frames && frames.length > 0 && this.capturedHash === hashAtStart && this.contentHash === hashAtStart;
				if (!fresh) {
					// Stale/empty result — fall back to the live iframe instead of stranding the loader.
					if (this.mode === "capturing") this.transitionToEditing();
					return;
				}
				await this.transitionToPlayback();
			})
			.catch(err => {
				console.warn("[Html5Player] capture failed:", err);
				this.emitCaptureFailed(err, "live-iframe");
				if (this.mode === "capturing") this.transitionToEditing();
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

	// Computes the clip's rect within the Studio root
	private syncIframePosition(): void {
		if (!this.iframe) return;
		if (!this.isActive()) {
			this.parkIframe();
			return;
		}
		const studioCanvas = this.getStudioCanvas();
		if (!studioCanvas) {
			this.parkIframe();
			return;
		}

		const m = this.contentContainer.worldTransform;
		const naturalW = this.renderedWidth;
		const naturalH = this.renderedHeight;
		const tlX = m.tx;
		const tlY = m.ty;
		const brX = m.a * naturalW + m.c * naturalH + m.tx;
		const brY = m.b * naturalW + m.d * naturalH + m.ty;
		const pixiX = Math.min(tlX, brX);
		const pixiY = Math.min(tlY, brY);
		const pixiW = Math.abs(brX - tlX);
		const pixiH = Math.abs(brY - tlY);

		const rect = studioCanvas.getBoundingClientRect();
		const scaleX = rect.width / studioCanvas.width;
		const scaleY = rect.height / studioCanvas.height;
		const left = studioCanvas.offsetLeft + pixiX * scaleX;
		const top = studioCanvas.offsetTop + pixiY * scaleY;
		const w = Math.max(1, pixiW * scaleX);
		const h = Math.max(1, pixiH * scaleY);

		const { style } = this.iframe;
		style.left = `${left}px`;
		style.top = `${top}px`;
		style.width = `${naturalW}px`;
		style.height = `${naturalH}px`;
		style.transform = `scale(${w / naturalW}, ${h / naturalH})`;
		style.opacity = `${this.getOpacity()}`;
	}

	public override dispose(): void {
		this.disposed = true;
		super.dispose();
		this.iframe?.remove();
		this.iframe = null;
		this.playbackSprite?.destroy();
		this.playbackSprite = null;
		this.staticSprite?.destroy();
		this.staticSprite = null;
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
		// iframe content is DOM-native at its natural resolution; clip-level
		// scaling is applied by syncIframePosition per Pixi tick. Nothing to do.
	}
}
