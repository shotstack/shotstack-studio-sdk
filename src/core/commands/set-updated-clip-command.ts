import type { MergeFieldBinding, Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import { getNestedValue } from "@core/shared/utils";
import type { Seconds } from "@core/timing/types";
import type { ResolvedClip } from "@schemas";

import type { EditCommand, CommandContext } from "./types";

type ClipType = ResolvedClip;

export interface SetUpdatedClipOptions {
	trackIndex?: number;
	clipIndex?: number;
}

export class SetUpdatedClipCommand implements EditCommand {
	name = "setUpdatedClip";
	private storedInitialConfig: ClipType | null;
	private storedFinalConfig: ClipType;
	private storedInitialBindings: Map<string, MergeFieldBinding> = new Map();
	private trackIndex: number;
	private clipIndex: number;
	private storedInitialTiming: { start: Seconds; length: Seconds } | null = null;

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
	}

	async execute(context?: CommandContext): Promise<void> {
		if (!context) return;

		// Save bindings before modification (for undo)
		this.storedInitialBindings = new Map(this.clip.getMergeFieldBindings());

		if (this.storedFinalConfig) {
			context.restoreClipConfiguration(this.clip, this.storedFinalConfig);
		}

		// Sync timing state if start or length actually changed
		const startChanged = this.storedFinalConfig.start !== this.storedInitialConfig?.start;
		const lengthChanged = this.storedFinalConfig.length !== this.storedInitialConfig?.length;

		if (startChanged || lengthChanged) {
			// Store initial timing for undo (already in Seconds)
			this.storedInitialTiming = {
				start: this.clip.getStart(),
				length: this.clip.getLength()
			};

			// ResolvedClip.start/length are already Seconds
			this.clip.setTimingIntent({
				start: this.storedFinalConfig.start,
				length: this.storedFinalConfig.length
			});

			this.clip.setResolvedTiming({
				start: this.storedFinalConfig.start,
				length: this.storedFinalConfig.length
			});
		}

		context.setUpdatedClip(this.clip);

		// Detect broken bindings - if value changed from resolvedValue, remove the binding
		for (const [path, { resolvedValue }] of this.storedInitialBindings) {
			const currentValue = getNestedValue(this.clip.clipConfiguration, path);
			if (currentValue !== resolvedValue) {
				this.clip.removeMergeFieldBinding(path);
			}
		}

		// Use provided indices or calculate from clip
		const trackIndex = this.trackIndex >= 0 ? this.trackIndex : this.clip.layer - 1;
		const clips = context.getClips();
		const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
		const clipIndex = this.clipIndex >= 0 ? this.clipIndex : clipsByTrack.indexOf(this.clip);

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

		const previousClip = this.storedInitialConfig ?? this.initialClipConfig ?? this.clip.clipConfiguration;
		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: previousClip, trackIndex, clipIndex },
			current: { clip: this.storedFinalConfig, trackIndex, clipIndex }
		});
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context || !this.storedInitialConfig) return;

		context.restoreClipConfiguration(this.clip, this.storedInitialConfig);

		// Restore timing state if we modified it (already in Seconds)
		if (this.storedInitialTiming) {
			this.clip.setTimingIntent({
				start: this.storedInitialTiming.start,
				length: this.storedInitialTiming.length
			});
			this.clip.setResolvedTiming({
				start: this.storedInitialTiming.start,
				length: this.storedInitialTiming.length
			});
		}

		context.setUpdatedClip(this.clip);

		// Restore saved bindings
		this.clip.setInitialBindings(this.storedInitialBindings);

		// Use provided indices or calculate from clip
		const trackIndex = this.trackIndex >= 0 ? this.trackIndex : this.clip.layer - 1;
		const clips = context.getClips();
		const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
		const clipIndex = this.clipIndex >= 0 ? this.clipIndex : clipsByTrack.indexOf(this.clip);

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

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { clip: this.storedFinalConfig, trackIndex, clipIndex },
			current: { clip: this.storedInitialConfig, trackIndex, clipIndex }
		});
	}
}
