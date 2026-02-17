import { LumaPlayer } from "@canvas/players/luma-player";
import { type Player, PlayerType } from "@canvas/players/player";
import type { Canvas } from "@canvas/shotstack-canvas";
import * as pixi from "pixi.js";

import { EditEvent, InternalEvent, type EditEventMap, type InternalEventMap } from "./events/edit-events";
import type { EventEmitter } from "./events/event-emitter";

const LUMA_MASK_RESOLUTION = 0.5;

// TODO: Set this based on actual video source frame rate instead of hardcoding 30fps
const LUMA_VIDEO_UPDATE_INTERVAL = 1 / 30;

interface ActiveLumaMask {
	lumaPlayer: LumaPlayer;
	maskSprite: pixi.Sprite;
	tempContainer: pixi.Container;
	contentClip: Player;
	lastVideoTime: number;
}

interface PendingMaskCleanup {
	maskSprite: pixi.Sprite;
	frameCount: number;
}

/**
 * Manages luma mask setup, updates, and cleanup for the Edit class.
 * Luma masks apply grayscale video/image textures as alpha masks to content clips.
 */
export class LumaMaskController {
	private activeLumaMasks: ActiveLumaMask[] = [];
	private pendingMaskCleanup: PendingMaskCleanup[] = [];
	private readonly onClipChangedBound: () => void;
	private readonly onPlayerLoadedBound: (payload: { player: Player; trackIndex: number; clipIndex: number }) => void;

	constructor(
		private getCanvas: () => Canvas | null,
		private getTracks: () => Player[][],
		private events: EventEmitter<EditEventMap & InternalEventMap>
	) {
		this.onClipChangedBound = () => this.rebuildLumaMasksIfNeeded();
		this.onPlayerLoadedBound = payload => this.onPlayerLoaded(payload);
	}

	/**
	 * Initialize luma masking by setting up event listeners.
	 */
	initialize(): void {
		this.setupEventListeners();
	}

	/**
	 * Update luma masks each frame. For video sources, regenerates mask texture.
	 */
	update(): void {
		this.updateLumaMasks();
		this.processPendingMaskCleanup();
	}

	/**
	 * Get the number of active luma masks.
	 */
	getActiveMaskCount(): number {
		return this.activeLumaMasks.length;
	}

	/**
	 * Clean up all luma masks.
	 */
	dispose(): void {
		this.removeEventListeners();

		for (const mask of this.activeLumaMasks) {
			mask.tempContainer.destroy({ children: true });
			mask.maskSprite.destroy({ texture: true });
		}
		this.activeLumaMasks = [];

		for (const item of this.pendingMaskCleanup) {
			try {
				item.maskSprite.parent?.removeChild(item.maskSprite);
				item.maskSprite.destroy({ texture: true });
			} catch {
				// Ignore cleanup errors during dispose
			}
		}
		this.pendingMaskCleanup = [];
	}

	/**
	 * Clean up luma mask when a luma player is being deleted.
	 */
	cleanupForPlayer(player: Player): void {
		const maskIndex = this.activeLumaMasks.findIndex(mask => mask.lumaPlayer === player);
		if (maskIndex === -1) {
			return;
		}

		const mask = this.activeLumaMasks[maskIndex];

		if (mask.contentClip) {
			mask.contentClip.getLumaWrapper().mask = null;
		}

		mask.maskSprite.parent?.removeChild(mask.maskSprite);
		mask.tempContainer.destroy({ children: true });
		this.activeLumaMasks.splice(maskIndex, 1);

		this.pendingMaskCleanup.push({ maskSprite: mask.maskSprite, frameCount: 0 });
	}

	/**
	 * Handle PlayerLoaded event - set up luma mask if player is a luma player.
	 */
	private onPlayerLoaded(payload: { player: Player; trackIndex: number; clipIndex: number }): void {
		const { player, trackIndex } = payload;

		// Only handle luma players
		if (player.playerType !== PlayerType.Luma) {
			return;
		}

		const lumaPlayer = player as LumaPlayer;
		const lumaSprite = lumaPlayer.getSprite();

		// Texture should always be ready when PlayerLoaded fires (after load completes)
		if (!lumaSprite?.texture) {
			console.warn("PlayerLoaded fired for luma player before texture ready");
			return;
		}

		const tracks = this.getTracks();
		if (trackIndex >= tracks.length) {
			return;
		}

		const trackClips = tracks[trackIndex];
		const contentClips = trackClips.filter(clip => clip.playerType !== PlayerType.Luma);

		if (contentClips.length === 0) {
			return;
		}

		// Check if mask already exists (avoid duplicates)
		const existingMask = this.activeLumaMasks.find(m => m.lumaPlayer === lumaPlayer);
		if (existingMask) {
			return;
		}

		this.setupLumaMask(lumaPlayer, lumaSprite.texture, contentClips[0]);

		// Hide the luma player container (lumas are rendered as masks, not visible clips)
		lumaPlayer.getContainer().parent?.removeChild(lumaPlayer.getContainer());
	}

	private setupLumaMask(lumaPlayer: LumaPlayer, lumaTexture: pixi.Texture, contentClip: Player): void {
		const canvas = this.getCanvas();
		if (!canvas) {
			return;
		}

		const { renderer } = canvas.application;
		const { width, height } = contentClip.getSize();

		const tempContainer = new pixi.Container();
		const tempSprite = new pixi.Sprite(lumaTexture);
		tempSprite.width = width;
		tempSprite.height = height;

		const invertFilter = new pixi.ColorMatrixFilter();
		invertFilter.negative(false);
		tempSprite.filters = [invertFilter];
		tempContainer.addChild(tempSprite);

		const maskTexture = renderer.generateTexture({
			target: tempContainer,
			resolution: LUMA_MASK_RESOLUTION
		});

		const maskSprite = new pixi.Sprite(maskTexture);

		contentClip.getContainer().addChild(maskSprite);

		const lumaWrapper = contentClip.getLumaWrapper();
		lumaWrapper.mask = maskSprite;

		this.activeLumaMasks.push({ lumaPlayer, maskSprite, tempContainer, contentClip, lastVideoTime: -1 });
	}

	private updateLumaMasks(): void {
		const canvas = this.getCanvas();
		if (!canvas) return;

		const { renderer } = canvas.application;

		for (const mask of this.activeLumaMasks) {
			if (mask.lumaPlayer.isVideoSource()) {
				const videoTime = mask.lumaPlayer.getVideoCurrentTime();
				const frameChanged = Math.abs(videoTime - mask.lastVideoTime) >= LUMA_VIDEO_UPDATE_INTERVAL;

				if (frameChanged) {
					mask.lastVideoTime = videoTime;

					const oldTexture = mask.maskSprite.texture;
					mask.maskSprite.texture = renderer.generateTexture({
						target: mask.tempContainer,
						resolution: LUMA_MASK_RESOLUTION
					});

					oldTexture.destroy(true);
				}
			}
		}
	}

	private setupEventListeners(): void {
		// PlayerLoaded handles initial mask setup for new luma players
		this.events.on(InternalEvent.PlayerLoaded, this.onPlayerLoadedBound);
		// ClipUpdated handles property changes to existing masks
		this.events.on(EditEvent.ClipUpdated, this.onClipChangedBound);
		// PlayerMovedBetweenTracks re-detaches luma containers after track reparenting
		this.events.on(InternalEvent.PlayerMovedBetweenTracks, this.onClipChangedBound);
		// Note: ClipAdded and ClipRestored trigger PlayerLoaded, so no need to subscribe separately
	}

	private removeEventListeners(): void {
		this.events.off(InternalEvent.PlayerLoaded, this.onPlayerLoadedBound);
		this.events.off(EditEvent.ClipUpdated, this.onClipChangedBound);
		this.events.off(InternalEvent.PlayerMovedBetweenTracks, this.onClipChangedBound);
	}

	private processPendingMaskCleanup(): void {
		for (let i = this.pendingMaskCleanup.length - 1; i >= 0; i -= 1) {
			const item = this.pendingMaskCleanup[i];
			item.frameCount += 1;

			if (item.frameCount >= 3) {
				try {
					item.maskSprite.parent?.removeChild(item.maskSprite);
					item.maskSprite.destroy({ texture: true });
				} catch {
					// Ignore cleanup errors
				}
				this.pendingMaskCleanup.splice(i, 1);
			}
		}
	}

	/**
	 * Update existing luma masks when clip properties change.
	 * This is called in response to ClipUpdated events for already-loaded players.
	 */
	private rebuildLumaMasksIfNeeded(): void {
		const canvas = this.getCanvas();
		if (!canvas) return;

		const tracks = this.getTracks();
		for (let trackIdx = 0; trackIdx < tracks.length; trackIdx += 1) {
			const trackClips = tracks[trackIdx];
			const lumaPlayer = trackClips.find(clip => clip.playerType === PlayerType.Luma) as LumaPlayer | undefined;
			const contentClips = trackClips.filter(clip => clip.playerType !== PlayerType.Luma);

			if (lumaPlayer) {
				// Hide luma player container (lumas are rendered as masks, not visible clips)
				lumaPlayer.getContainer().parent?.removeChild(lumaPlayer.getContainer());
			}

			const existingMask = lumaPlayer && this.activeLumaMasks.find(m => m.lumaPlayer === lumaPlayer);

			// Only set up mask if player is already loaded (texture ready)
			if (lumaPlayer && !existingMask && contentClips.length > 0) {
				const lumaSprite = lumaPlayer.getSprite();
				if (lumaSprite?.texture) {
					this.setupLumaMask(lumaPlayer, lumaSprite.texture, contentClips[0]);
				}
			}
		}
	}
}
