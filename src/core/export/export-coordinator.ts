import { Canvas } from "@canvas/shotstack-canvas";
import { ExportCommand } from "@core/commands/export-command";
import { Edit } from "@core/edit-session";
import { sec } from "@core/timing/types";
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource } from "mediabunny";
import * as pixi from "pixi.js";

import { AudioProcessor } from "./audio-processor";
import { findBrowserIssue, findEditIssues } from "./export-preflight";
import { ExportProgressUI } from "./export-progress-ui";
import { ExportError } from "./export-utils";
import { VideoFrameProcessor } from "./video-frame-processor";

interface ExportConfig {
	fps: number;
	size: { width: number; height: number };
	bitrate: number;
	frames: number;
	frameDuration: number;
}

interface EditState {
	wasPlaying: boolean;
	time: number;
	visible: boolean;
	pos: { x: number; y: number };
	scale: { x: number; y: number };
}

export interface ExportBlobOptions {
	signal?: AbortSignal;
	onProgress?: (fraction: number, stage: string) => void;
}

type Progress = (fraction: number, stage: string) => void;

/** How long an export waits for in-flight asset loads before failing with phase `assets`. */
export const ASSET_SETTLE_TIMEOUT_MS = 30_000;

const cancelled = (): ExportError => new ExportError("Export cancelled", "cancelled");

// A stalled asset request can keep a load pending indefinitely, so the wait is bounded and a cancel ends it early.
function waitForLoads(edit: Pick<Edit, "whenSettled" | "getLoadingClipIds">, signal?: AbortSignal): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onAbort = (): void => {};
	const stopped = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			const [clipId] = edit.getLoadingClipIds();
			reject(new ExportError(`A clip's asset didn't finish loading within ${ASSET_SETTLE_TIMEOUT_MS / 1000} seconds`, "assets", { clipId }));
		}, ASSET_SETTLE_TIMEOUT_MS);
		onAbort = () => reject(cancelled());
		if (signal?.aborted) onAbort();
		else signal?.addEventListener("abort", onAbort, { once: true });
	});
	return Promise.race([edit.whenSettled(), stopped]).finally(() => {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	});
}

export class ExportCoordinator {
	private readonly edit: Edit;
	private readonly canvas: Canvas;
	private readonly app: pixi.Application;
	private isExporting = false;
	private videoProcessor = new VideoFrameProcessor();
	private audioProcessor = new AudioProcessor();
	private progressUI = new ExportProgressUI();
	private exportCommand = new ExportCommand();

	constructor(edit: Edit, canvas: Canvas) {
		this.edit = edit;
		this.canvas = canvas;
		this.app = canvas.application;
		document.addEventListener("keydown", this.handleKeyDown);
	}

	async exportBlob(options: ExportBlobOptions = {}): Promise<Blob> {
		return this.encode(this.edit.getEdit().output?.fps ?? 30, options);
	}

	async export(filename = "shotstack-export.mp4", fps?: number): Promise<void> {
		if (this.isExporting) throw new ExportError("Export in progress", "init");

		this.progressUI.create();
		try {
			const blob = await this.encode(fps ?? this.edit.getEdit().output?.fps ?? 30, {
				onProgress: (fraction, stage) => this.progressUI.update(fraction * 100, 100, stage)
			});

			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);

			this.progressUI.update(100, 100, "Complete!");
		} finally {
			this.progressUI.remove();
		}
	}

	private async encode(fps: number, { signal, onProgress }: ExportBlobOptions): Promise<Blob> {
		if (this.isExporting) throw new ExportError("Export in progress", "init");
		const throwIfAborted = (): void => {
			if (signal?.aborted) throw cancelled();
		};
		throwIfAborted();
		const report: Progress = (fraction, stage) => onProgress?.(fraction, stage);

		this.isExporting = true;
		const savedState = this.saveEditState();
		this.edit.setExportMode(true);
		const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

		try {
			this.canvas.pauseTicker();

			this.edit.executeEditCommand(this.exportCommand);

			const cfg = this.prepareConfig(fps);
			report(0, "Preparing...");

			await this.checkExportable(cfg, signal);
			throwIfAborted();
			report(0.1, "Video ready");

			const canvas = document.createElement("canvas");
			canvas.width = cfg.size.width;
			canvas.height = cfg.size.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("No 2D context");

			const videoSource = new CanvasSource(canvas, { codec: "avc", bitrate: cfg.bitrate });
			output.addVideoTrack(videoSource);

			report(0.15, "Mixing audio...");
			const mixedAudio = await this.audioProcessor.renderMix(this.exportCommand.getTracks(), this.edit.totalDuration);
			throwIfAborted();
			let audioSource: AudioBufferSource | null = null;
			if (mixedAudio) {
				audioSource = new AudioBufferSource({ codec: "aac", bitrate: 192_000 });
				output.addAudioTrack(audioSource);
			}

			await output.start();

			if (audioSource && mixedAudio) {
				report(0.2, "Encoding audio...");
				await audioSource.add(mixedAudio);
			}

			report(0.25, "Exporting...");
			await this.processFrames(cfg, videoSource, ctx, report, throwIfAborted);

			await output.finalize();

			const data = (output.target as BufferTarget).buffer;
			if (!data) throw new Error("No video data");

			return new Blob([data], { type: "video/mp4" });
		} catch (error) {
			// An export that stops early would otherwise hold its encoders until garbage collection.
			if (output.state === "pending" || output.state === "started") await output.cancel();
			throw error instanceof ExportError ? error : new ExportError(`Export failed: ${error}`, "export");
		} finally {
			this.isExporting = false;
			this.edit.setExportMode(false);
			this.canvas.resumeTicker();
			this.restoreEditState(savedState);
		}
	}

	private async checkExportable(cfg: ExportConfig, signal?: AbortSignal): Promise<void> {
		await waitForLoads(this.edit, signal);

		const issues = findEditIssues(this.edit);
		const browserIssue = await findBrowserIssue(cfg.size, cfg.bitrate);
		if (browserIssue) issues.push(browserIssue);
		issues.push(...(await this.videoProcessor.initialize(this.exportCommand.getClips())));
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
		throwIfAborted: () => void
	): Promise<void> {
		const container = this.edit.getViewportContainer();
		this.edit.pause();
		Object.assign(container.position, { x: 0, y: 0 });
		Object.assign(container.scale, { x: 1, y: 1 });
		container.visible = true;

		const players = this.videoProcessor.disableVideoPlayback(this.exportCommand.getClips());

		for (let i = 0; i < cfg.frames; i += 1) {
			throwIfAborted();
			const frameTime = i * cfg.frameDuration;
			this.edit.playbackTime = sec(frameTime);

			for (const clip of this.exportCommand.getClips()) {
				clip.update(0, 0);
			}

			for (const player of players) {
				const start = player.getStart?.() || 0;
				const end = player.getEnd?.() || start + (player.getLength?.() || 0);
				if (frameTime >= start && frameTime < end) {
					await this.videoProcessor.replaceVideoTexture(player, frameTime);
				}
			}

			this.app.renderer.render(this.app.stage);

			const pixels = this.app.renderer.extract.pixels({
				target: container,
				frame: new pixi.Rectangle(0, 0, cfg.size.width, cfg.size.height)
			});

			const imageData = new ImageData(new Uint8ClampedArray(pixels.pixels), pixels.width, pixels.height);

			ctx.putImageData(imageData, 0, 0);

			await videoSource.add(i / cfg.fps, 1 / cfg.fps);

			report(0.25 + ((i + 1) / cfg.frames) * 0.75, "Exporting...");
		}
	}

	private handleKeyDown = (e: KeyboardEvent): void => {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.code === "KeyE" && (e.metaKey || e.ctrlKey) && !this.isExporting) {
			e.preventDefault();
			this.export("shotstack-export.mp4", this.edit.getEdit().output?.fps || 30).catch(err => console.error("Export failed:", err));
		}
	};

	dispose(): void {
		document.removeEventListener("keydown", this.handleKeyDown);
		this.videoProcessor.dispose();
		this.progressUI.remove();
	}

	private prepareConfig(fps: number): ExportConfig {
		const outputSize = this.edit.getEdit().output?.size;
		const size = { width: outputSize?.width ?? 1920, height: outputSize?.height ?? 1080 };
		// totalDuration is in seconds
		return {
			fps,
			size,
			bitrate: 5_000_000,
			frames: Math.ceil(this.edit.totalDuration * fps),
			frameDuration: 1 / fps // seconds per frame
		};
	}

	private saveEditState(): EditState {
		const c = this.edit.getViewportContainer();
		return {
			wasPlaying: this.edit.isPlaying,
			time: this.edit.playbackTime,
			visible: c.visible,
			pos: { x: c.position.x, y: c.position.y },
			scale: { x: c.scale.x, y: c.scale.y }
		};
	}

	private restoreEditState(state: EditState): void {
		const c = this.edit.getViewportContainer();
		this.edit.setExportMode(false);
		this.videoProcessor.restore();

		Object.assign(c.position, state.pos);
		Object.assign(c.scale, state.scale);
		c.visible = state.visible;
		this.edit.seek(sec(state.time));
		if (state.wasPlaying) this.edit.play();
	}
}
