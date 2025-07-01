import type { Player } from "@entities/base/player";
import { AudioPlayer } from "@entities/players/audio-player";
import { Edit } from "@entities/system/edit";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import * as pixi from "pixi.js";

import type { AudioAsset } from "../schemas/audio-asset";
import { Canvas } from "../shotstack-canvas";


/**
 * Note: @ffmpeg/ffmpeg is a peer dependency and must be installed separately
 * by applications that want to use the browser-based video export functionality.
 * npm install @ffmpeg/ffmpeg
 */

type AudioFileInfo = {
	filename: string;
	start: number;
	duration: number;
	volume: number;
};

type ContainerWithLabel = pixi.Container & {
	label?: string;
};

type ClipContainerWithPlayer = pixi.Container & {
	player?: AudioPlayer;
	clip?: AudioPlayer;
	audioPlayer?: AudioPlayer;
	entity?: AudioPlayer;
};

export class VideoExporter {
	private readonly ffmpeg: FFmpeg;
	private isReady = false;
	private readonly edit: Edit;
	private readonly application: pixi.Application;

	constructor(edit: Edit, canvas: Canvas) {
		this.edit = edit;
		this.application = canvas.application;
		this.ffmpeg = new FFmpeg();
	}

	private async init(): Promise<void> {
		if (!this.isReady) {
			try {
				await this.ffmpeg.load();
				this.isReady = true;
			} catch (error) {
				console.error("FFmpeg initialization failed:", error);
				throw error;
			}
		}
	}

	public async export(filename = "shotstack-export.mp4", fps = 30): Promise<void> {
		if (!this.isReady) {
			await this.init();
		}

		const wasPlaying = this.edit.isPlaying;
		const currentTime = this.edit.playbackTime;

		this.edit.pause();

		const container = this.edit.getContainer();
		const originalVisible = container.visible;
		const { x: originalX, y: originalY } = container.position;
		const { x: originalScaleX, y: originalScaleY } = container.scale;

		container.visible = false;

		const progressOverlay = this.createProgressOverlay();

		try {
			const editSize = (this.edit as any).getSize ? (this.edit as any).getSize() : { width: 1920, height: 1080 };
			const totalFrames = Math.ceil((this.edit.totalDuration * fps) / 1000);
			const frameDuration = 1000 / fps;

			const totalProgress = 100;
			const frameCaptureWeight = 50;
			const ffmpegWeight = 50;

			const calcFrameCaptureProgress = (frame: number) => Math.round((frame / totalFrames) * frameCaptureWeight);

			this.updateProgressOverlay(progressOverlay, 0, totalProgress);

			const outputCanvas = document.createElement("canvas");
			outputCanvas.width = editSize.width;
			outputCanvas.height = editSize.height;
			const ctx = outputCanvas.getContext("2d");

			if (!ctx) {
				throw new Error("Could not get 2D context for canvas");
			}

			const audioPlayers = this.findAudioPlayers();
			this.updateProgressOverlay(progressOverlay, 2, totalProgress);

			const audioFiles: AudioFileInfo[] = [];
			if (audioPlayers.length > 0) {
				this.updateProgressOverlay(progressOverlay, 3, totalProgress);
				for (let i = 0; i < audioPlayers.length; i += 1) {
					const audioFile = await this.processAudioTrack(audioPlayers[i], i);
					if (audioFile) {
						audioFiles.push(audioFile);
					}
					this.updateProgressOverlay(progressOverlay, 4 + i, totalProgress);
				}
			}

			container.position.x = 0;
			container.position.y = 0;
			container.scale.x = 1.0;
			container.scale.y = 1.0;

			// Capture frames
			for (let i = 0; i < totalFrames; i += 1) {
				this.edit.seek(i * frameDuration);
				if ((this.edit as any).tick) {
					(this.edit as any).tick(0, 0);
				} else {
					(this.edit as any).update?.(0, 0);
					(this.edit as any).draw?.();
				}

				try {
					const { extract } = this.application.renderer;
					const pixiCanvas = extract.canvas(container);

					ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
					ctx.drawImage(pixiCanvas as unknown as HTMLCanvasElement, 0, 0);

					const pngDataUrl = outputCanvas.toDataURL("image/png");
					const response = await fetch(pngDataUrl);
					const pngBuffer = await response.arrayBuffer();

					const frameName = `frame_${i.toString().padStart(6, "0")}.png`;
					await this.ffmpeg.writeFile(frameName, new Uint8Array(pngBuffer));
				} catch (err) {
					console.error(`Error capturing frame ${i}:`, err);
				}

				this.updateProgressOverlay(progressOverlay, calcFrameCaptureProgress(i + 1), totalProgress);
			}

			this.updateProgressOverlay(progressOverlay, frameCaptureWeight, totalProgress);

			let ffmpegCommand = ["-framerate", fps.toString(), "-i", "frame_%06d.png"];

			for (const audioFile of audioFiles) {
				ffmpegCommand = ffmpegCommand.concat(["-i", audioFile.filename]);
			}

			ffmpegCommand = ffmpegCommand.concat(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23"]);

			if (audioFiles.length > 0) {
				let filterComplex = "";

				for (let i = 0; i < audioFiles.length; i += 1) {
					const audioFile = audioFiles[i];
					const inputIndex = i + 1;
					const startPadMs = Math.max(0, audioFile.start);

					filterComplex +=
						`[${inputIndex}:a]` +
						`aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,` +
						`apad,` +
						`afade=t=in:st=0:d=0.05,` +
						`atrim=start=0:end=${audioFile.duration / 1000 + 0.1},` +
						`adelay=${startPadMs}|${startPadMs},` +
						`volume=${audioFile.volume}[a${i}];`;
				}

				const mixSuffix =
					audioFiles.length > 1
						? `${audioFiles.map((_, i) => `[a${i}]`).join("")}amix=inputs=${audioFiles.length}:duration=longest:dropout_transition=0.5:normalize=0[aout]`
						: `[a0]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`;

				filterComplex += mixSuffix;

				ffmpegCommand = ffmpegCommand.concat([
					"-filter_complex",
					filterComplex,
					"-map",
					"0:v",
					"-map",
					"[aout]",
					"-c:a",
					"aac",
					"-b:a",
					"192k",
					"-shortest"
				]);
			}

			const tempFilename = "output.mp4";
			ffmpegCommand.push(tempFilename);

			let frameCount = 0;
			const ffmpegLogHandler = ({ message }: { message: string }): void => {
				const frameMatch = message.includes("frame=") && message.includes("fps=") ? message.match(/frame=\s*(\d+)/) : null;

				if (frameMatch?.[1]) {
					const currentFrame = parseInt(frameMatch[1], 10);

					if (!Number.isNaN(currentFrame) && currentFrame > frameCount) {
						frameCount = currentFrame;

						if (currentFrame <= totalFrames) {
							const encodingProgress = Math.round((currentFrame / totalFrames) * ffmpegWeight);
							this.updateProgressOverlay(progressOverlay, frameCaptureWeight + encodingProgress, totalProgress);
						}
					}
				}
			};

			this.ffmpeg.on("log", ffmpegLogHandler);
			await this.ffmpeg.exec(ffmpegCommand);
			this.ffmpeg.off("log", ffmpegLogHandler);

			this.updateProgressOverlay(progressOverlay, frameCaptureWeight + ffmpegWeight, totalProgress);

			const fileData = await this.ffmpeg.readFile(tempFilename);
			const videoData = fileData instanceof Uint8Array ? fileData : new TextEncoder().encode(fileData.toString());

			const blob = new Blob([videoData], { type: "video/mp4" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);

			for (let i = 0; i < totalFrames; i += 1) {
				try {
					await this.ffmpeg.deleteFile(`frame_${i.toString().padStart(6, "0")}.png`);
				} catch {
					// Ignore deletion errors
				}
			}

			for (const audioFile of audioFiles) {
				try {
					await this.ffmpeg.deleteFile(audioFile.filename);
				} catch {
					// Ignore deletion errors
				}
			}

			await this.ffmpeg.deleteFile(tempFilename);
			this.updateProgressOverlay(progressOverlay, totalProgress, totalProgress);
		} catch (error) {
			console.error("Error during export:", error);
			throw error;
		} finally {
			this.removeProgressOverlay(progressOverlay);

			container.position.x = originalX;
			container.position.y = originalY;
			container.scale.x = originalScaleX;
			container.scale.y = originalScaleY;
			container.visible = originalVisible;

			this.edit.seek(currentTime);
			if (wasPlaying) {
				this.edit.play();
			}
		}
	}

	private findAudioPlayers(): AudioPlayer[] {
		const audioPlayers: AudioPlayer[] = [];
		const tracks = (this.edit as any).tracks as Player[][];

		if (tracks && Array.isArray(tracks)) {
			for (let i = 0; i < tracks.length; i += 1) {
				const track = tracks[i];
				if (Array.isArray(track)) {
					for (let j = 0; j < track.length; j += 1) {
						const clip = track[j];
						if (clip instanceof AudioPlayer || clip.constructor.name === "AudioPlayer" || clip.clipConfiguration?.asset?.type === "audio") {
							if (!audioPlayers.includes(clip as unknown as AudioPlayer)) {
								audioPlayers.push(clip as unknown as AudioPlayer);
							}
						}
					}
				}
			}
		}

		this.searchContainerForPlayers(this.edit.getContainer(), audioPlayers);
		return audioPlayers;
	}

	private searchContainerForPlayers(container: pixi.Container, players: AudioPlayer[]): void {
		if (!container) return;

		for (const child of container.children) {
			if (child instanceof pixi.Container) {
				const childWithLabel = child as ContainerWithLabel;

				if (childWithLabel.label?.startsWith("shotstack-track-")) {
					for (const clipContainer of child.children) {
						if (clipContainer instanceof pixi.Container) {
							const clipContainerWithPlayer = clipContainer as ClipContainerWithPlayer;
							const possiblePlayerProps: (keyof ClipContainerWithPlayer)[] = ["player", "clip", "audioPlayer", "entity"];

							for (const prop of possiblePlayerProps) {
								const player = clipContainerWithPlayer[prop];
								if (player instanceof AudioPlayer && !players.includes(player)) {
									players.push(player);
								}
							}
						}
					}
				}

				this.searchContainerForPlayers(child, players);
			}
		}
	}

	private async processAudioTrack(player: AudioPlayer, index: number): Promise<AudioFileInfo | null> {
		try {
			const { clipConfiguration: clipConfig } = player;
			if (!clipConfig?.asset) return null;

			const asset = clipConfig.asset as AudioAsset;
			if (!asset.src) {
				console.warn("Audio asset does not have a valid src property");
				return null;
			}

			const response = await fetch(asset.src);
			if (!response.ok) {
				console.error(`Failed to fetch audio file: ${asset.src}`);
				return null;
			}

			const audioData = await response.arrayBuffer();
			const audioFilename = `audio_${index}.mp3`;

			await this.ffmpeg.writeFile(audioFilename, new Uint8Array(audioData));

			return {
				filename: audioFilename,
				start: player.getStart(),
				duration: player.getLength(),
				volume: player.getVolume()
			};
		} catch (error) {
			console.error(`Error processing audio track ${index}:`, error);
			return null;
		}
	}

	private createProgressOverlay(): HTMLElement {
		const overlay = document.createElement("div");
		overlay.className = "video-export-progress-overlay";

		Object.assign(overlay.style, {
			position: "fixed",
			top: "0",
			left: "0",
			width: "100%",
			height: "100%",
			backgroundColor: "rgba(0, 0, 0, 0.5)",
			zIndex: "9999",
			display: "flex",
			flexDirection: "column",
			justifyContent: "center",
			alignItems: "center",
			color: "white",
			fontFamily: "Arial, sans-serif"
		} as CSSStyleDeclaration);

		const loaderCard = document.createElement("div");
		Object.assign(loaderCard.style, {
			backgroundColor: "#222",
			borderRadius: "8px",
			padding: "20px",
			boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
			width: "300px",
			textAlign: "center"
		} as CSSStyleDeclaration);

		overlay.appendChild(loaderCard);

		const title = document.createElement("h3");
		title.innerText = "Exporting Video";
		title.style.margin = "0 0 15px 0";
		title.style.fontWeight = "normal";
		loaderCard.appendChild(title);

		const progressContainer = document.createElement("div");
		Object.assign(progressContainer.style, {
			width: "100%",
			height: "6px",
			backgroundColor: "#444",
			borderRadius: "3px",
			overflow: "hidden",
			marginBottom: "10px"
		} as CSSStyleDeclaration);

		loaderCard.appendChild(progressContainer);

		const progressBar = document.createElement("div");
		progressBar.className = "video-export-progress-bar";
		Object.assign(progressBar.style, {
			width: "0%",
			height: "100%",
			backgroundColor: "#3498db",
			transition: "width 0.3s"
		} as CSSStyleDeclaration);

		progressContainer.appendChild(progressBar);

		const percent = document.createElement("div");
		percent.className = "video-export-percent";
		percent.innerText = "0%";
		percent.style.fontSize = "12px";
		loaderCard.appendChild(percent);

		document.body.appendChild(overlay);
		return overlay;
	}

	private updateProgressOverlay(overlay: HTMLElement, current: number, total: number): void {
		if (!overlay) return;

		const percent = Math.round((current / total) * 100);
		const progressBar = overlay.querySelector(".video-export-progress-bar") as HTMLElement;
		const percentText = overlay.querySelector(".video-export-percent") as HTMLElement;

		if (progressBar) {
			progressBar.style.width = `${percent}%`;
		}
		if (percentText) {
			percentText.innerText = `${percent}%`;
		}
	}

	private removeProgressOverlay(overlay: HTMLElement): void {
		overlay?.parentNode?.removeChild(overlay);
	}
}
