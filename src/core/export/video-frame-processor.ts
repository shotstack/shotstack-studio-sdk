import { Input, UrlSource, MP4, WEBM, CanvasSink, type InputVideoTrack } from "mediabunny";
import * as pixi from "pixi.js";

import { videoSourceTime } from "./export-timing";
import { BrowserCompatibilityError } from "./export-utils";

export interface VideoPlayerExtended {
	texture?: pixi.Texture & { source?: { resource?: unknown; update?: () => void } };
	sprite?: { texture?: pixi.Texture };
	clipConfiguration?: { asset?: { src?: string; trim?: number; type?: string } };
	skipVideoUpdate?: boolean;
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
	trim: number;
	start: number;
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

	/** Open a decoder per video clip; throws if the browser cannot decode a source. */
	async initialize(clips: ReadonlyArray<unknown>): Promise<void> {
		const players = clips.filter(isVideoPlayer) as VideoPlayerExtended[];

		await Promise.all(
			players.map(async player => {
				const src = this.getVideoKey(player);
				if (src) {
					const input = new Input({ source: new UrlSource(src), formats: [MP4, WEBM] });
					const track = await input.getPrimaryVideoTrack();
					if (track) {
						if (!(await track.canDecode())) {
							throw new BrowserCompatibilityError(`Cannot decode video source: ${src}`, ["VideoDecoder"]);
						}
						this.decoders.set(player, {
							input,
							track,
							sink: new CanvasSink(track, { poolSize: 2 }),
							trim: player.clipConfiguration?.asset?.trim ?? 0,
							start: player.getStart?.() ?? 0,
							originalTexture: player.texture
						});
					}
				}
			})
		);
	}

	/** Point a clip's texture at the decoded source frame for the given timeline time. */
	async replaceVideoTexture(player: VideoPlayerExtended, timestamp: number): Promise<void> {
		const decoder = this.decoders.get(player);
		if (!decoder) return;

		const sourceTime = Math.max(0, videoSourceTime(timestamp, decoder.start, decoder.trim));
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
