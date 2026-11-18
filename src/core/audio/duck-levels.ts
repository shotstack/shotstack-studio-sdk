import { InternalEvent, type InternalEventMap } from "@core/events/edit-events";
import type { EventEmitter } from "@core/events/event-emitter";
import type { ResolvedClip, ResolvedEdit } from "@schemas";
import {
	duckLevel,
	integratedLoudness,
	planDuckMeasurements,
	scanDucking,
	type DuckMeasurement,
	type LoudnessWindow
} from "@shotstack/shotstack-canvas/duck";

import { decodeLoudnessBlocks } from "./loudness";

// `URL.canParse` needs Chrome 120, Safari 17 or Firefox 115.
function isUrl(src: string): boolean {
	try {
		return Boolean(new URL(src));
	} catch {
		return false;
	}
}

/** Each ducking clip's dip levels, measured from its files' loudness the way the server render measures them. */
export class DuckLevelService {
	// Kept for the session's lifetime, failures included, so a file is fetched at most once.
	private readonly blocks = new Map<string, Float64Array | null>();
	private readonly requested = new Set<string>();
	private readonly batches = new Set<Promise<void>>();
	private plans: Array<[clipId: string, measurements: DuckMeasurement[]]> = [];
	private levels = new Map<string, ReadonlyMap<string, number>>();
	private levelsKey = "[]";
	private disposed = false;

	constructor(
		private readonly events: EventEmitter<InternalEventMap>,
		private readonly decode: typeof decodeLoudnessBlocks = decodeLoudnessBlocks
	) {}

	public refresh(resolved: ResolvedEdit): void {
		const { aliases, ducking } = scanDucking(resolved);
		this.plans = ducking.map(({ clip }) => [(clip as ResolvedClip).id, planDuckMeasurements(clip, aliases)]);

		// A merge field still waiting for its value is not a URL yet, so there is nothing to fetch.
		const sources = this.plans
			.flatMap(([, measurements]) => measurements)
			.filter(({ speech, bed }) => isUrl(speech.src) && isUrl(bed.src))
			.flatMap(({ speech, bed }) => [speech.src, bed.src]);
		const decodes = [...new Set(sources)]
			.filter(src => !this.requested.has(src))
			.map(src => {
				this.requested.add(src);
				// A rejection counts as unmeasurable, or its batch would never settle.
				return this.decode(src)
					.catch(() => null)
					.then(blocks => {
						this.blocks.set(src, blocks);
					});
			});

		if (decodes.length > 0) {
			const batch: Promise<void> = Promise.all(decodes).then(() => {
				this.batches.delete(batch);
				this.update();
			});
			this.batches.add(batch);
		}
		this.update();
	}

	public levelsFor(clipId: string): ReadonlyMap<string, number> | undefined {
		return this.levels.get(clipId);
	}

	/** Resolves once every decode started so far has landed and its levels have been announced. */
	public async whenSettled(): Promise<void> {
		while (this.batches.size > 0) await Promise.all(this.batches);
	}

	public dispose(): void {
		this.disposed = true;
	}

	private update(): void {
		if (this.disposed) return;
		const levels = new Map(
			this.plans.map(([clipId, measurements]) => [clipId, this.levelsOf(measurements)] as const).filter(([, refs]) => refs.size > 0)
		);
		const key = JSON.stringify([...levels].map(([clipId, refs]) => [clipId, [...refs]]));
		if (key === this.levelsKey) return;

		this.levels = levels;
		this.levelsKey = key;
		this.events.emit(InternalEvent.DuckLevelsChanged, {});
	}

	// A dip whose speech or bed has no measurable loudness gets no entry, so it falls back to the default level.
	private levelsOf(measurements: DuckMeasurement[]): Map<string, number> {
		const levels = new Map<string, number>();
		for (const { ref, speech, bed, speechVolume } of measurements) {
			const speechLufs = this.loudness(speech);
			const bedLufs = this.loudness(bed);
			if (speechLufs !== null && bedLufs !== null) levels.set(ref, duckLevel(speechLufs, speechVolume, bedLufs));
		}
		return levels;
	}

	private loudness({ src, start, end }: LoudnessWindow): number | null {
		const blocks = this.blocks.get(src);
		return blocks ? integratedLoudness(blocks, start, end) : null;
	}
}
