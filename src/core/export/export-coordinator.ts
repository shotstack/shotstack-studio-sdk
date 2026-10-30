import { Canvas } from "@canvas/shotstack-canvas";
import { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import { sec } from "@core/timing/types";
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource } from "mediabunny";
import * as pixi from "pixi.js";

import { AudioProcessor } from "./audio-processor";
import { findBrowserIssue, findEditIssues } from "./export-preflight";
import { ExportProgressUI } from "./export-progress-ui";
import { AUDIO_BITRATE, ExportError, exportBitrate } from "./export-utils";
import { VideoFrameProcessor } from "./video-frame-processor";

interface ExportConfig {
	fps: number;
	size: { width: number; height: number };
	bitrate: number;
	frames: number;
	frameDuration: number;
	muted: boolean;
}

export interface ExportBlobOptions {
	signal?: AbortSignal;
	onProgress?: (fraction: number, stage: string) => void;
}

type Progress = (fraction: number, stage: string) => void;

/** How long an export waits for in-flight asset loads before failing with phase `assets`. */
export const ASSET_SETTLE_TIMEOUT_MS = 30_000;

const cancelled = (): ExportError => new ExportError("Export cancelled", "cancelled");

// Per edit, not per exporter: two exports of one edit would both move its playhead and swap its video textures.
const exporting = new WeakSet<Edit>();

// Rejects as soon as the signal aborts; the work itself runs on and its result is ignored.
function untilAborted<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
	let onAbort = (): void => {};
	const aborted = new Promise<never>((_, reject) => {
		onAbort = () => reject(cancelled());
		if (signal?.aborted) onAbort();
		else signal?.addEventListener("abort", onAbort, { once: true });
	});
	return Promise.race([work, aborted]).finally(() => signal?.removeEventListener("abort", onAbort));
}

// A stalled asset request can keep a load pending indefinitely, so the wait is bounded and a cancel ends it early.
function waitForLoads(edit: Pick<Edit, "whenSettled" | "getLoadingClipIds">, signal?: AbortSignal): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			const [clipId] = edit.getLoadingClipIds();
			reject(new ExportError(`A clip's asset didn't finish loading within ${ASSET_SETTLE_TIMEOUT_MS / 1000} seconds`, "assets", { clipId }));
		}, ASSET_SETTLE_TIMEOUT_MS);
	});
	return untilAborted(Promise.race([edit.whenSettled(), timedOut]), signal).finally(() => clearTimeout(timer));
}

export class ExportCoordinator {
	private readonly edit: Edit;
	private readonly app: pixi.Application;
	private videoProcessor = new VideoFrameProcessor();
	private audioProcessor = new AudioProcessor();
	private progressUI = new ExportProgressUI();

	constructor(edit: Edit, canvas: Canvas) {
		this.edit = edit;
		this.app = canvas.application;
		document.addEventListener("keydown", this.handleKeyDown);
	}

	async exportBlob(options: ExportBlobOptions = {}): Promise<Blob> {
		return this.encode(this.edit.getOutputFps(), options);
	}

	async export(filename = "shotstack-export.mp4", fps?: number): Promise<void> {
		if (exporting.has(this.edit)) throw new ExportError("Export in progress", "init");

		this.progressUI.create();
		try {
			const blob = await this.encode(fps ?? this.edit.getOutputFps(), {
				onProgress: (fraction, stage) => this.progressUI.update(fraction * 100, 100, stage)
			});

			try {
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = filename;
				a.click();
				URL.revokeObjectURL(url);
			} catch (error) {
				throw new ExportError(`Export failed: ${error}`, "export");
			}

			this.progressUI.update(100, 100, "Complete!");
		} finally {
			this.progressUI.remove();
		}
	}

	private async encode(fps: number, { signal, onProgress }: ExportBlobOptions): Promise<Blob> {
		if (exporting.has(this.edit)) throw new ExportError("Export in progress", "init");
		const throwIfAborted = (): void => {
			if (signal?.aborted) throw cancelled();
		};
		throwIfAborted();
		const report: Progress = (fraction, stage) => onProgress?.(fraction, stage);

		let output: Output | undefined;
		let changed = false;
		const markChanged = (): void => {
			changed = true;
		};
		let stopWatching = (): void => {};
		// The editor stays live during export; anything checked, mixed or drawn before a change no longer matches the edit.
		const throwIfStopped = (): void => {
			throwIfAborted();
			if (changed) throw new ExportError("The edit or playback changed during export", "export");
		};

		exporting.add(this.edit);
		try {
			stopWatching = this.edit.events.on(EditEvent.EditChanged, markChanged);
			output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
			const cfg = this.prepareConfig(fps);
			report(0, "Preparing...");

			await this.checkExportable(cfg, signal);
			throwIfStopped();
			report(0.1, "Video ready");

			const canvas = document.createElement("canvas");
			canvas.width = cfg.size.width;
			canvas.height = cfg.size.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("No 2D context");

			const videoSource = new CanvasSource(canvas, {
				codec: "avc",
				bitrate: cfg.bitrate,
				// Chrome, Safari and Firefox all encode canvas frames as limited range, but Safari reports full range,
				// which players honour by showing white as grey.
				onEncodedPacket: (_packet, meta) => {
					const colorSpace = meta?.decoderConfig?.colorSpace;
					if (colorSpace) colorSpace.fullRange = false;
				}
			});
			output.addVideoTrack(videoSource);

			report(0.15, "Mixing audio...");
			const mixedAudio = cfg.muted ? null : await untilAborted(this.audioProcessor.renderMix(this.edit.getTracks(), this.edit.totalDuration), signal);
			throwIfStopped();
			let audioSource: AudioBufferSource | null = null;
			if (mixedAudio) {
				audioSource = new AudioBufferSource({ codec: "aac", bitrate: AUDIO_BITRATE });
				output.addAudioTrack(audioSource);
			}

			await output.start();

			if (audioSource && mixedAudio) {
				report(0.2, "Encoding audio...");
				await audioSource.add(mixedAudio);
			}

			report(0.25, "Exporting...");
			await this.processFrames(cfg, videoSource, ctx, report, throwIfStopped, markChanged);

			await output.finalize();
			throwIfAborted();

			const data = (output.target as BufferTarget).buffer;
			if (!data) throw new Error("No video data");

			return new Blob([data], { type: "video/mp4" });
		} catch (error) {
			// An export that stops early would otherwise hold its encoders until garbage collection.
			if (output && (output.state === "pending" || output.state === "started")) {
				// A failed cancel must not replace the error that stopped the export.
				await output.cancel().catch(() => {});
			}
			// The host asked to stop, so an error that races the cancel still reports as cancelled.
			if (signal?.aborted) throw cancelled();
			throw error instanceof ExportError ? error : new ExportError(`Export failed: ${error}`, "export");
		} finally {
			stopWatching();
			exporting.delete(this.edit);
			// Releases decoders the checks opened when the export stops before drawing a frame.
			this.videoProcessor.restore();
		}
	}

	private async checkExportable(cfg: ExportConfig, signal?: AbortSignal): Promise<void> {
		await waitForLoads(this.edit, signal);

		const issues = findEditIssues(this.edit, cfg.bitrate);
		const audio = !cfg.muted && this.audioProcessor.hasAudio(this.edit.getTracks());
		const browserIssue = await untilAborted(findBrowserIssue(cfg.size, cfg.bitrate, audio), signal);
		if (browserIssue) issues.push(browserIssue);
		issues.push(...(await untilAborted(this.videoProcessor.initialize(this.edit.getTracks().flat(), signal), signal)));
		if (issues.length > 0) {
			throw new ExportError("This edit can't be exported in the browser", "unsupported", {}, undefined, issues);
		}

		for (const [trackIndex, track] of this.edit.getTracks().entries()) {
			for (const [clipIndex, player] of track.entries()) {
				const failure = this.edit.getClipError(trackIndex, clipIndex)?.error ?? (player.needsResolution ? "its source isn't ready yet" : null);
				if (failure) throw new ExportError(`A clip couldn't be loaded: ${failure}`, "assets", { clipId: player.clipId });
			}
		}
	}

	private async processFrames(
		cfg: ExportConfig,
		videoSource: CanvasSource,
		ctx: CanvasRenderingContext2D,
		report: Progress,
		throwIfStopped: () => void,
		onPlayback: () => void
	): Promise<void> {
		const container = this.edit.getViewportContainer();
		const clips = this.edit.getTracks().flat();
		const { isPlaying: wasPlaying, playbackTime } = this.edit;

		// Each frame moves every clip to that frame's time. Stopping the app keeps the screen on the last
		// frame it drew, so the user never sees those moves; extract renders off-screen either way.
		const tickerWasRunning = this.app.ticker.started;
		this.app.stop();
		const stopWatching: Array<() => void> = [];
		// Into a new texture pixi adds the stencil buffer at the first mask, mid-frame, and Firefox then draws that
		// frame's masked containers blank. A target that has its stencil from the start draws every frame.
		const frameTexture = pixi.RenderTexture.create({
			width: cfg.size.width,
			height: cfg.size.height,
			resolution: 1,
			antialias: this.app.renderer.view.antialias
		});
		const frameTarget = new pixi.RenderTarget({ colorTextures: [frameTexture], stencil: true, depth: true });
		const frameTransform = new pixi.Matrix();

		try {
			this.edit.pause();
			// From here the export owns the playhead, so a play, pause or seek by anyone else stops it.
			stopWatching.push(this.edit.events.on(EditEvent.PlaybackPlay, onPlayback), this.edit.events.on(EditEvent.PlaybackPause, onPlayback));
			const players = this.videoProcessor.disableVideoPlayback(clips);

			for (let i = 0; i < cfg.frames; i += 1) {
				throwIfStopped();
				const frameTime = i * cfg.frameDuration;
				this.edit.playbackTime = sec(frameTime);

				for (const clip of clips) {
					clip.update(0, 0);
				}

				for (const player of players) {
					const start = player.getStart?.() || 0;
					const end = player.getEnd?.() || start + (player.getLength?.() || 0);
					if (frameTime >= start && frameTime < end) {
						await this.videoProcessor.replaceVideoTexture(player);
					}
				}

				// update() only starts rich text and caption draws; finish this frame's before reading pixels.
				const active = clips.filter(clip => clip.isActive());
				try {
					await Promise.all(active.map(clip => clip.prepareStaticRender()));
					throwIfStopped();
					// The identity transform stands in for the container's own, so the editor's pan and zoom never reach
					// these pixels; the texture's resolution pins them to output pixels.
					this.app.renderer.render({ container, target: frameTarget, transform: frameTransform, clearColor: [0, 0, 0, 0] });
					const pixels = this.app.renderer.extract.pixels(frameTexture);

					ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.pixels), pixels.width, pixels.height), 0, 0);
				} finally {
					for (const clip of active) clip.endStaticRender();
				}

				await videoSource.add(i / cfg.fps, 1 / cfg.fps);

				report(0.25 + ((i + 1) / cfg.frames) * 0.75, "Exporting...");
			}
		} finally {
			// Restoring the playhead below seeks, which must not count as a change.
			for (const stop of stopWatching) stop();
			// Before restoring playback, so a throw there can't leave the editor frozen. start() only schedules a frame.
			if (tickerWasRunning) this.app.start();
			frameTarget.destroy();
			frameTexture.destroy(true);
			this.videoProcessor.restore();
			this.edit.seek(sec(playbackTime));
			if (wasPlaying) this.edit.play();
		}
	}

	private handleKeyDown = (e: KeyboardEvent): void => {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.code === "KeyE" && (e.metaKey || e.ctrlKey) && !exporting.has(this.edit)) {
			e.preventDefault();
			this.export("shotstack-export.mp4", this.edit.getOutputFps()).catch(err => console.error("Export failed:", err));
		}
	};

	dispose(): void {
		document.removeEventListener("keydown", this.handleKeyDown);
		this.videoProcessor.dispose();
		this.progressUI.remove();
	}

	private prepareConfig(fps: number): ExportConfig {
		// The size the canvas lays clips out in: the resolution preset shaped by aspectRatio, else output.size.
		const size = { width: this.edit.size.width, height: this.edit.size.height };
		// totalDuration is in seconds
		return {
			fps,
			size,
			bitrate: exportBitrate(size),
			frames: Math.ceil(this.edit.totalDuration * fps),
			frameDuration: 1 / fps, // seconds per frame
			muted: this.edit.getEdit().output?.mute === true
		};
	}
}
