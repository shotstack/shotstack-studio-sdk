import { isAiAsset } from "@core/shared/ai-asset-utils";

import type { GenerationConfig, GenerationStatus, GenerationStatusProvider } from "./generation-status";
import {
	type GenerationAssetType,
	type GenerationModelCatalogueResponse,
	type GenerationModelDefinition,
	readGenerationModels
} from "./model-catalogue";

/** Passed to the host handler for one generation. */
export interface AssetGenerationRequest {
	clipId: string;
	/** Snapshot of the clip's asset when generation started. */
	asset: Record<string, unknown>;
	/**
	 * Signalled when the SDK stops waiting for this generation — the clip was removed, or the
	 * edit was reloaded or disposed. Cancel the underlying request if the provider supports it;
	 * otherwise ignore it and let the request finish. Either way the SDK discards the result.
	 */
	signal: AbortSignal;
}

/** Resolves with the URL of the generated asset. */
export type AssetGeneratorHandler = (request: AssetGenerationRequest) => Promise<{ url: string }>;

export interface AssetGeneratorOptions {
	/** Model catalogue with each entry's option schema included. Entries without one are ignored. */
	catalogue?: GenerationModelCatalogueResponse;
}

export interface ClipGenerationState {
	status: "generating" | "failed";
	/** Failure message: the host's when generation failed, the SDK's when the result could not be applied. */
	error?: string;
}

export interface AssetGeneratorDeps {
	getClipAsset: (clipId: string) => Record<string, unknown> | undefined;
	applyGeneratedSrc: (clipId: string, url: string) => Promise<void>;
	emitStarted: (clipId: string) => void;
	emitCompleted: (clipId: string) => void;
	emitFailed: (clipId: string, error: string) => void;
	emitStatusChanged: (clipId: string) => void;
}

/**
 * Owns the generation lifecycle: one host handler, one in-flight request per
 * clip, and the transient state the UI renders. State lives here rather than in
 * the document so it is never autosaved, undone, or restored on reload.
 */
export class AssetGenerator {
	private handler?: AssetGeneratorHandler;
	private models?: readonly GenerationModelDefinition[];
	private statusProvider?: GenerationStatusProvider;
	private statusController: AbortController | null = null;
	private status: { clipId: string; value: GenerationStatus } | null = null;
	private readonly states = new Map<string, ClipGenerationState>();
	private readonly controllers = new Map<string, AbortController>();

	constructor(private readonly deps: AssetGeneratorDeps) {}

	public register(handler: AssetGeneratorHandler, options?: AssetGeneratorOptions): void {
		this.handler = handler;
		this.models = options?.catalogue === undefined ? undefined : readGenerationModels(options.catalogue);
	}

	public registerStatus(provider: GenerationStatusProvider): () => void {
		const callback: GenerationStatusProvider = request => provider(request);
		this.statusProvider = callback;
		this.describe(null);
		return () => {
			if (this.statusProvider !== callback) return;
			this.statusProvider = undefined;
			this.describe(null);
		};
	}

	public getStatus(clipId: string): GenerationStatus | undefined {
		return this.status?.clipId === clipId ? this.status.value : undefined;
	}

	public describe(config: GenerationConfig | null): void {
		this.statusController?.abort();
		this.statusController = null;
		this.setStatus(null);
		if (!config || !this.statusProvider) {
			return;
		}
		const controller = new AbortController();
		this.statusController = controller;
		const settle = (value: GenerationStatus | undefined): void => {
			if (controller.signal.aborted) return;
			this.setStatus(value ? { clipId: config.clipId, value } : null);
		};
		const fail = (error: unknown): void => {
			if (controller.signal.aborted) return;
			console.warn(`Generation status: ${error instanceof Error ? error.message : String(error)}`);
			settle(undefined);
		};
		try {
			const result = this.statusProvider({ ...config, signal: controller.signal });
			if (result instanceof Promise) result.then(settle, fail);
			else settle(result);
		} catch (error) {
			fail(error);
		}
	}

	private setStatus(next: { clipId: string; value: GenerationStatus } | null): void {
		const previous = this.status;
		this.status = next;
		const changed = next ?? previous;
		if (changed) this.deps.emitStatusChanged(changed.clipId);
	}

	public getModels(type: GenerationAssetType): readonly GenerationModelDefinition[] | undefined {
		return this.models?.filter(model => model.type === type);
	}

	public hasHandler(): boolean {
		return this.handler !== undefined;
	}

	public getState(clipId: string): ClipGenerationState | undefined {
		return this.states.get(clipId);
	}

	public async generate(clipId: string): Promise<void> {
		if (!this.handler) {
			throw new Error("No asset generator registered");
		}
		if (this.controllers.has(clipId)) return;

		const asset = this.deps.getClipAsset(clipId);
		if (!asset || !isAiAsset(asset)) {
			throw new Error(`Clip ${clipId} has no generatable asset`);
		}

		const controller = new AbortController();
		this.controllers.set(clipId, controller);
		this.states.set(clipId, { status: "generating" });
		this.deps.emitStarted(clipId);

		try {
			const { url } = await this.handler({
				clipId,
				asset: structuredClone(asset) as Record<string, unknown>,
				signal: controller.signal
			});
			if (controller.signal.aborted) return;
			await this.deps.applyGeneratedSrc(clipId, url);
			if (controller.signal.aborted) return;
			this.states.delete(clipId);
			this.deps.emitCompleted(clipId);
		} catch (error) {
			if (controller.signal.aborted) return;
			const message = error instanceof Error ? error.message : String(error);
			this.states.set(clipId, { status: "failed", error: message });
			this.deps.emitFailed(clipId, message);
		} finally {
			// A run that settles late must not evict the controller of the retry that replaced it.
			if (this.controllers.get(clipId) === controller) this.controllers.delete(clipId);
		}
	}

	public abort(clipId: string): void {
		this.controllers.get(clipId)?.abort();
		this.controllers.delete(clipId);
		this.states.delete(clipId);
	}

	/** Drop generation for clips that are no longer in the edit. */
	public abortMissing(liveClipIds: ReadonlySet<string>): void {
		for (const clipId of [...this.controllers.keys()]) if (!liveClipIds.has(clipId)) this.abort(clipId);
		for (const clipId of [...this.states.keys()]) if (!liveClipIds.has(clipId)) this.states.delete(clipId);
	}

	public abortAll(): void {
		for (const clipId of [...this.controllers.keys()]) this.abort(clipId);
		this.states.clear();
		this.describe(null);
	}
}
