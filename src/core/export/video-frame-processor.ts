import { Input, UrlSource, MP4, WEBM, CanvasSink, type InputVideoTrack } from "mediabunny";
import * as pixi from "pixi.js";

import type { ExportIssue } from "./export-utils";

export interface VideoPlayerExtended {
	clipId?: string | null;
	texture?: pixi.Texture & { source?: { resource?: unknown; update?: () => void } };
	sprite?: { texture?: pixi.Texture };
	clipConfiguration?: { asset?: { src?: string; trim?: number; type?: string } };
	skipVideoUpdate?: boolean;
	getSourceTime(): number;
	getStart?(): number;
	getEnd?(): number;
	getLength?(): number;
}

export function isVideoPlayer(player: unknown): player is VideoPlayerExtended {
	if (!player || typeof player !== "object") return false;
	const p = player as Record<string, unknown>;
	const name = p.constructor?.name;
	if (name === "RichTextPlayer" || name === "RichCaptionPlayer") return false;
	const texture = p["texture"] as { source?: { resource?: unknown } } | undefined;
	return name === "VideoPlayer" || texture?.source?.resource instanceof HTMLVideoElement;
}

interface ClipDecoder {
	input: Input;
	track: InputVideoTrack;
	sink: CanvasSink;
	canvas?: HTMLCanvasElement;
	ctx?: CanvasRenderingContext2D;
	texture?: pixi.Texture;
	originalTexture?: pixi.Texture;
}

/**
 * Supplies each video clip's source frame during export by decoding with WebCodecs
 */
export class VideoFrameProcessor {
	private decoders = new Map<VideoPlayerExtended, ClipDecoder>();

	/** Open a decoder per video clip; a source the browser can't decode comes back as an issue. */
	async initialize(clips: ReadonlyArray<unknown>): Promise<ExportIssue[]> {
		const players = clips.filter(isVideoPlayer) as VideoPlayerExtended[];
		const issues: ExportIssue[] = [];

		await Promise.all(
			players.map(async player => {
				const src = this.getVideoKey(player);
				if (!src) return;
				const input = new Input({ source: new UrlSource(src), formats: [MP4, WEBM] });
				try {
					const track = await input.getPrimaryVideoTrack();
					if (!track) return;
					if (!(await track.canDecode())) throw new Error("No decoder for this codec");
					this.decoders.set(player, {
						input,
						track,
						sink: new CanvasSink(track, { poolSize: 2 }),
						originalTexture: player.texture
					});
				} catch (error) {
					input.dispose();
					console.warn("Export: can't decode video", src, error);
					issues.push({ code: "video-source", message: "This video's format can't be decoded in the browser.", clipId: player.clipId ?? undefined });
				}
			})
		);

		return issues;
	}

	/** Point a clip's texture at the decoded source frame for the edit's current playback time. */
	async replaceVideoTexture(player: VideoPlayerExtended): Promise<void> {
		const decoder = this.decoders.get(player);
		if (!decoder) return;

		// The preview's own mapping, so trim, speed and speed curves land on the same source frame.
		const sourceTime = Math.max(0, player.getSourceTime());
		const wrapped = await decoder.sink.getCanvas(sourceTime);
		if (!wrapped) return;

		if (!decoder.texture) {
			const canvas = document.createElement("canvas");
			canvas.width = wrapped.canvas.width;
			canvas.height = wrapped.canvas.height;
			decoder.canvas = canvas;
			decoder.ctx = canvas.getContext("2d", { alpha: true }) ?? undefined;
			decoder.texture = pixi.Texture.from(canvas);
		}

		decoder.ctx?.drawImage(wrapped.canvas, 0, 0, decoder.canvas!.width, decoder.canvas!.height);
		decoder.texture.source.update();

		// Export drives the texture directly; restored by restore().
		// eslint-disable-next-line no-param-reassign
		player.texture = decoder.texture as VideoPlayerExtended["texture"];
		// eslint-disable-next-line no-param-reassign
		if (player.sprite) player.sprite.texture = decoder.texture;
	}

	/** Pause the live <video> elements and return the export's video players. */
	disableVideoPlayback(clips: ReadonlyArray<unknown>): VideoPlayerExtended[] {
		const players = clips.filter(isVideoPlayer) as VideoPlayerExtended[];
		for (const player of players) {
			const resource = player.texture?.source?.resource;
			if (resource instanceof HTMLVideoElement) resource.pause();
			// The decoder drives frames during export; stop the player's own video update.
			// eslint-disable-next-line no-param-reassign
			player.skipVideoUpdate = true;
		}
		return players;
	}

	/** Restore live textures and release every decoder. Safe to call once after export. */
	restore(): void {
		for (const [player, decoder] of this.decoders) {
			if (decoder.originalTexture) {
				// Put the live texture back, then drop ours.
				// eslint-disable-next-line no-param-reassign
				player.texture = decoder.originalTexture as VideoPlayerExtended["texture"];
				if (player.sprite) {
					// eslint-disable-next-line no-param-reassign
					player.sprite.texture = decoder.originalTexture;
				}
				decoder.texture?.destroy(true);
			}
			// eslint-disable-next-line no-param-reassign
			player.skipVideoUpdate = false;
			decoder.input.dispose();
		}
		this.decoders.clear();
	}

	getVideoKey(player: VideoPlayerExtended): string {
		return player.clipConfiguration?.asset?.src ?? "";
	}

	dispose(): void {
		this.restore();
	}
}
