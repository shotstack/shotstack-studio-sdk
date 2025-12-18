import { CaptionPlayer } from "@canvas/players/caption-player";
import { PlayerType } from "@canvas/players/player";
import { Canvas } from "@canvas/shotstack-canvas";
import { ExportCommand } from "@core/commands/export-command";
import { Edit } from "@core/edit-session";
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource } from "mediabunny";
import * as pixi from "pixi.js";

import { AudioProcessor } from "./audio-processor";
import { ExportProgressUI } from "./export-progress-ui";
import { ExportError, BrowserCompatibilityError } from "./export-utils";
import { VideoFrameProcessor, type VideoPlayerExtended } from "./video-frame-processor";

interface ExportConfig {
	fps: number;
	size: { width: number; height: number };
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

	async export(filename = "shotstack-export.mp4", fps?: number): Promise<void> {
		if (typeof VideoEncoder === "undefined") {
			throw new BrowserCompatibilityError("WebCodecs API not supported", ["VideoEncoder"]);
		}
		if (this.isExporting) throw new ExportError("Export in progress", "init");

		this.isExporting = true;
		const savedState = this.saveEditState();
		this.edit.setExportMode(true);

		try {
			this.progressUI.create();
			this.canvas.pauseTicker();

			this.edit.executeEditCommand(this.exportCommand);
			await this.waitForPendingTranscriptions();

			const cfg = this.prepareConfig(fps ?? this.edit.getEdit().output?.fps ?? 30);
			this.progressUI.update(0, 100, "Preparing...");

			await this.videoProcessor.initialize(this.exportCommand.getClips());
			this.progressUI.update(10, 100, "Video ready");

			const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
			const canvas = document.createElement("canvas");
			canvas.width = cfg.size.width;
			canvas.height = cfg.size.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("No 2D context");

			const videoSource = new CanvasSource(canvas, { codec: "avc", bitrate: 5_000_000 });
			output.addVideoTrack(videoSource);

			this.progressUI.update(15, 100, "Audio...");
			const audioSource = await this.audioProcessor.setupAudioTracks(this.exportCommand.getTracks(), output);

			await output.start();

			if (audioSource) {
				this.progressUI.update(20, 100, "Encoding audio...");
				await this.audioProcessor.processAudioSamples(audioSource);
			}

			this.progressUI.update(25, 100, "Exporting...");
			await this.processFrames(cfg, videoSource, canvas, ctx);

			await output.finalize();

			const data = (output.target as BufferTarget).buffer;
			if (!data) throw new Error("No video data");

			const blob = new Blob([data], { type: "video/mp4" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);

			this.progressUI.update(100, 100, "Complete!");
		} catch (error) {
			throw error instanceof ExportError ? error : new ExportError(`Export failed: ${error}`, "export");
		} finally {
			this.isExporting = false;
			this.edit.setExportMode(false);
			this.canvas.resumeTicker();
			this.progressUI.remove();
			this.restoreEditState(savedState);
		}
	}

	private async processFrames(
		cfg: ExportConfig,
		videoSource: CanvasSource,
		_canvas: HTMLCanvasElement,
		ctx: CanvasRenderingContext2D
	): Promise<void> {
		const container = this.edit.getContainer();
		this.edit.pause();
		Object.assign(container.position, { x: 0, y: 0 });
		Object.assign(container.scale, { x: 1, y: 1 });
		container.visible = true;

		const players = this.videoProcessor.disableVideoPlayback(this.exportCommand.getClips());

		for (let i = 0; i < cfg.frames; i += 1) {
			const frameTime = i * cfg.frameDuration;
			this.edit.playbackTime = frameTime;

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

			this.edit.draw();
			this.app.renderer.render(this.app.stage);

			const pixels = this.app.renderer.extract.pixels({
				target: container,
				frame: new pixi.Rectangle(0, 0, cfg.size.width, cfg.size.height)
			});

			const imageData = new ImageData(new Uint8ClampedArray(pixels.pixels), pixels.width, pixels.height);

			ctx.putImageData(imageData, 0, 0);

			await videoSource.add(i / cfg.fps, 1 / cfg.fps);

			this.progressUI.update(25 + Math.round(((i + 1) / cfg.frames) * 75), 100, "Exporting...");
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
		const size = this.edit.getEdit().output?.size || { width: 1920, height: 1080 };
		const durationSec = this.edit.totalDuration / 1000;
		return {
			fps,
			size,
			frames: Math.ceil(durationSec * fps),
			frameDuration: 1000 / fps
		};
	}

	private saveEditState(): EditState {
		const c = this.edit.getContainer();
		return {
			wasPlaying: this.edit.isPlaying,
			time: this.edit.playbackTime,
			visible: c.visible,
			pos: { x: c.position.x, y: c.position.y },
			scale: { x: c.scale.x, y: c.scale.y }
		};
	}

	private restoreEditState(state: EditState): void {
		const c = this.edit.getContainer();
		this.edit.setExportMode(false);

		for (const clip of this.exportCommand.getClips()) {
			if (this.isVideoPlayer(clip)) {
				const videoClip = clip as VideoPlayerExtended;
				videoClip.skipVideoUpdate = false;
				if (videoClip.originalVideoElement && videoClip.texture) {
					const texture = pixi.Texture.from(videoClip.originalVideoElement);
					videoClip.texture = texture;
					if (videoClip.sprite) videoClip.sprite.texture = texture;
					delete videoClip.originalVideoElement;
					delete videoClip.originalTextureSource;
					delete videoClip.lastReplacedTimestamp;
				} else if (videoClip.originalTextureSource && videoClip.texture) {
					(videoClip.texture as { source: unknown }).source = videoClip.originalTextureSource;
					delete videoClip.originalTextureSource;
					delete videoClip.lastReplacedTimestamp;
				}
			}
		}

		Object.assign(c.position, state.pos);
		Object.assign(c.scale, state.scale);
		c.visible = state.visible;
		this.edit.seek(state.time);
		if (state.wasPlaying) this.edit.play();
	}

	private isVideoPlayer(clip: unknown): clip is VideoPlayerExtended {
		if (!clip || typeof clip !== "object") return false;
		const c = clip as Record<string, unknown>;
		const hasVideoConstructor = c.constructor?.name === "VideoPlayer";
		const texture = c["texture"] as { source?: { resource?: unknown } } | undefined;
		const hasVideoTexture = texture?.source?.resource instanceof HTMLVideoElement;
		return hasVideoConstructor || hasVideoTexture;
	}

	private async waitForPendingTranscriptions(): Promise<void> {
		const clips = this.exportCommand.getClips();
		const transcriptionPromises: Promise<void>[] = [];

		for (const clip of clips) {
			if (clip.playerType === PlayerType.Caption && (clip as CaptionPlayer).isTranscriptionPending()) {
				transcriptionPromises.push((clip as CaptionPlayer).waitForTranscription());
			}
		}

		if (transcriptionPromises.length > 0) {
			this.progressUI.update(0, 100, "Waiting for transcription...");
			await Promise.all(transcriptionPromises);
		}
	}
}
