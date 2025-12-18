import { LumaPlayer } from "@canvas/players/luma-player";
import { type Player, PlayerType } from "@canvas/players/player";
import type { Canvas } from "@canvas/shotstack-canvas";
import * as pixi from "pixi.js";

import { EditEvent, type EditEventMap } from "./events/edit-events";
import type { EventEmitter } from "./events/event-emitter";

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

	constructor(
		private getCanvas: () => Canvas | null,
		private getTracks: () => Player[][],
		private events: EventEmitter<EditEventMap>
	) {
		this.onClipChangedBound = () => this.rebuildLumaMasksIfNeeded();
	}

	/**
	 * Initialize luma masking after clips are loaded.
	 * Sets up masks and event listeners.
	 */
	initialize(): void {
		this.finalizeLumaMasking();
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
		if (maskIndex === -1) return;

		const mask = this.activeLumaMasks[maskIndex];

		if (mask.contentClip) {
			mask.contentClip.getContentContainer().mask = null;
		}

		mask.maskSprite.parent?.removeChild(mask.maskSprite);
		mask.tempContainer.destroy({ children: true });
		this.activeLumaMasks.splice(maskIndex, 1);

		this.pendingMaskCleanup.push({ maskSprite: mask.maskSprite, frameCount: 0 });
	}

	/**
	 * Set up luma masks for all tracks.
	 * PixiJS masks are inverted vs backend convention (white=visible, not transparent),
	 * so we bake a negative filter into the mask texture via generateTexture().
	 */
	private finalizeLumaMasking(): void {
		const canvas = this.getCanvas();
		if (!canvas) return;

		const tracks = this.getTracks();
		for (const trackClips of tracks) {
			const lumaPlayer = trackClips.find(clip => clip.playerType === PlayerType.Luma) as LumaPlayer | undefined;
			const lumaSprite = lumaPlayer?.getSprite();
			const contentClips = trackClips.filter(clip => clip.playerType !== PlayerType.Luma);

			if (lumaPlayer && lumaSprite?.texture && contentClips.length > 0) {
				this.setupLumaMask(lumaPlayer, lumaSprite.texture, contentClips[0]);
				lumaPlayer.getContainer().parent?.removeChild(lumaPlayer.getContainer());
			}
		}
	}

	private setupLumaMask(lumaPlayer: LumaPlayer, lumaTexture: pixi.Texture, contentClip: Player): void {
		const canvas = this.getCanvas();
		if (!canvas) return;

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
			resolution: 0.5
		});
		const maskSprite = new pixi.Sprite(maskTexture);
		contentClip.getContainer().addChild(maskSprite);
		contentClip.getContentContainer().setMask({ mask: maskSprite });

		this.activeLumaMasks.push({ lumaPlayer, maskSprite, tempContainer, contentClip, lastVideoTime: -1 });
	}

	private updateLumaMasks(): void {
		const canvas = this.getCanvas();
		if (!canvas) return;

		const { renderer } = canvas.application;
		const frameInterval = 1 / 30;

		for (const mask of this.activeLumaMasks) {
			if (mask.lumaPlayer.isVideoSource()) {
				const videoTime = mask.lumaPlayer.getVideoCurrentTime();
				const frameChanged = Math.abs(videoTime - mask.lastVideoTime) >= frameInterval;

				if (frameChanged) {
					mask.lastVideoTime = videoTime;

					const oldTexture = mask.maskSprite.texture;
					mask.maskSprite.texture = renderer.generateTexture({
						target: mask.tempContainer,
						resolution: 0.5
					});

					oldTexture.destroy(true);
				}
			}
		}
	}

	private setupEventListeners(): void {
		this.events.on(EditEvent.ClipAdded, this.onClipChangedBound);
		this.events.on(EditEvent.ClipSplit, this.onClipChangedBound);
		this.events.on(EditEvent.ClipUpdated, this.onClipChangedBound);
		this.events.on(EditEvent.ClipRestored, this.onClipChangedBound);
		this.events.on(EditEvent.ClipDeleted, this.onClipChangedBound);
	}

	private removeEventListeners(): void {
		this.events.off(EditEvent.ClipAdded, this.onClipChangedBound);
		this.events.off(EditEvent.ClipSplit, this.onClipChangedBound);
		this.events.off(EditEvent.ClipUpdated, this.onClipChangedBound);
		this.events.off(EditEvent.ClipRestored, this.onClipChangedBound);
		this.events.off(EditEvent.ClipDeleted, this.onClipChangedBound);
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

	private async rebuildLumaMasksIfNeeded(): Promise<void> {
		const canvas = this.getCanvas();
		if (!canvas) return;

		const tracks = this.getTracks();
		for (let trackIdx = 0; trackIdx < tracks.length; trackIdx += 1) {
			const trackClips = tracks[trackIdx];
			const lumaPlayer = trackClips.find(clip => clip.playerType === PlayerType.Luma) as LumaPlayer | undefined;
			const contentClips = trackClips.filter(clip => clip.playerType !== PlayerType.Luma);

			if (lumaPlayer) {
				lumaPlayer.getContainer().parent?.removeChild(lumaPlayer.getContainer());
			}

			const existingMask = lumaPlayer && this.activeLumaMasks.find(m => m.lumaPlayer === lumaPlayer);

			if (lumaPlayer && !existingMask && contentClips.length > 0) {
				if (!lumaPlayer.getSprite()) {
					await lumaPlayer.load();
				}

				const lumaSprite = lumaPlayer.getSprite();
				if (lumaSprite?.texture) {
					this.setupLumaMask(lumaPlayer, lumaSprite.texture, contentClips[0]);
					lumaPlayer.getContainer().parent?.removeChild(lumaPlayer.getContainer());
				}
			}
		}
	}
}
