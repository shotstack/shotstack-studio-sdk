import type { Player } from "@canvas/players/player";
import type { ResolvedClip } from "@schemas/clip";

import type { EditCommand, CommandContext } from "./types";

type ClipType = ResolvedClip;

export interface SetUpdatedClipOptions {
	trackIndex?: number;
	clipIndex?: number;
	templateConfig?: ClipType; // If provided, sync to originalEdit
}

export class SetUpdatedClipCommand implements EditCommand {
	name = "setUpdatedClip";
	private storedInitialConfig: ClipType | null;
	private storedFinalConfig: ClipType;
	private storedInitialTemplateConfig: ClipType | null = null;
	private storedFinalTemplateConfig: ClipType | null = null;
	private trackIndex: number;
	private clipIndex: number;
	private storedInitialTiming: { start: number; length: number } | null = null;

	constructor(
		private clip: Player,
		private initialClipConfig: ClipType | null,
		private finalClipConfig: ClipType | null,
		options?: SetUpdatedClipOptions
	) {
		this.storedInitialConfig = initialClipConfig ? structuredClone(initialClipConfig) : null;
		this.storedFinalConfig = finalClipConfig ? structuredClone(finalClipConfig) : structuredClone(this.clip.clipConfiguration);
		this.trackIndex = options?.trackIndex ?? -1;
		this.clipIndex = options?.clipIndex ?? -1;
		if (options?.templateConfig) {
			this.storedFinalTemplateConfig = structuredClone(options.templateConfig);
		}
	}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) return;
		if (this.storedFinalConfig) {
			context.restoreClipConfiguration(this.clip, this.storedFinalConfig);
		}

		// Sync timing state if start or length actually changed
		const startChanged = this.storedFinalConfig.start !== this.storedInitialConfig?.start;
		const lengthChanged = this.storedFinalConfig.length !== this.storedInitialConfig?.length;

		if (startChanged || lengthChanged) {
			// Store initial timing for undo
			this.storedInitialTiming = {
				start: this.clip.getStart() / 1000,
				length: this.clip.getLength() / 1000
			};

			this.clip.setTimingIntent({
				start: this.storedFinalConfig.start,
				length: this.storedFinalConfig.length
			});

			this.clip.setResolvedTiming({
				start: this.storedFinalConfig.start * 1000,
				length: this.storedFinalConfig.length * 1000
			});
		}

		context.setUpdatedClip(this.clip);

		// Use provided indices or calculate from clip
		const trackIndex = this.trackIndex >= 0 ? this.trackIndex : this.clip.layer - 1;
		const clips = context.getClips();
		const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
		const clipIndex = this.clipIndex >= 0 ? this.clipIndex : clipsByTrack.indexOf(this.clip);

		// Sync originalEdit if template config provided
		if (this.storedFinalTemplateConfig && trackIndex >= 0 && clipIndex >= 0) {
			// Store previous template for undo
			const prevTemplate = context.getTemplateClip(trackIndex, clipIndex);
			if (prevTemplate) {
				this.storedInitialTemplateConfig = structuredClone(prevTemplate);
			}
			// Update originalEdit with template version
			context.syncTemplateClip(trackIndex, clipIndex, this.storedFinalTemplateConfig);
		}

		// Check if asset src changed
		const previousAsset = this.storedInitialConfig?.asset as { src?: string } | undefined;
		const currentAsset = this.storedFinalConfig?.asset as { src?: string } | undefined;

		if (previousAsset?.src !== currentAsset?.src) {
			// Asset changed - if clip has "auto" length, re-resolve it
			const intent = this.clip.getTimingIntent();
			if (intent.length === "auto") {
				await context.resolveClipAutoLength(this.clip);
			}
		}

		context.emitEvent("clip:updated", {
			previous: { clip: this.storedInitialConfig || this.initialClipConfig, trackIndex, clipIndex },
			current: { clip: this.storedFinalConfig || this.clip.clipConfiguration, trackIndex, clipIndex }
		});
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context || !this.storedInitialConfig) return;

		context.restoreClipConfiguration(this.clip, this.storedInitialConfig);

		// Restore timing state if we modified it
		if (this.storedInitialTiming) {
			this.clip.setTimingIntent({
				start: this.storedInitialTiming.start,
				length: this.storedInitialTiming.length
			});
			this.clip.setResolvedTiming({
				start: this.storedInitialTiming.start * 1000,
				length: this.storedInitialTiming.length * 1000
			});
		}

		context.setUpdatedClip(this.clip);

		// Use provided indices or calculate from clip
		const trackIndex = this.trackIndex >= 0 ? this.trackIndex : this.clip.layer - 1;
		const clips = context.getClips();
		const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
		const clipIndex = this.clipIndex >= 0 ? this.clipIndex : clipsByTrack.indexOf(this.clip);

		// Restore originalEdit if we modified it
		if (this.storedInitialTemplateConfig && trackIndex >= 0 && clipIndex >= 0) {
			context.syncTemplateClip(trackIndex, clipIndex, this.storedInitialTemplateConfig);
		}

		// Check if asset src changed (reverse direction)
		const previousAsset = this.storedFinalConfig?.asset as { src?: string } | undefined;
		const currentAsset = this.storedInitialConfig?.asset as { src?: string } | undefined;

		if (previousAsset?.src !== currentAsset?.src) {
			// Asset changed - if clip has "auto" length, re-resolve it
			const intent = this.clip.getTimingIntent();
			if (intent.length === "auto") {
				await context.resolveClipAutoLength(this.clip);
			}
		}

		context.emitEvent("clip:updated", {
			previous: { clip: this.storedFinalConfig, trackIndex, clipIndex },
			current: { clip: this.storedInitialConfig, trackIndex, clipIndex }
		});
	}
}
