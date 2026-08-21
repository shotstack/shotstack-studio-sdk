import { isAiAsset } from "@core/shared/ai-asset-utils";

/** Passed to the host handler for one generation. */
export interface AssetGenerationRequest {
	clipId: string;
	/** Snapshot of the clip's asset when generation started. */
	asset: Record<string, unknown>;
	/** Aborted when the clip is deleted or the edit is disposed. */
	signal: AbortSignal;
}

/** Resolves with the URL of the generated asset. */
export type AssetGeneratorHandler = (request: AssetGenerationRequest) => Promise<{ url: string }>;

export interface ClipGenerationState {
	status: "generating" | "failed";
	/** Host-supplied message, shown as-is. */
	error?: string;
}

export interface AssetGeneratorDeps {
	getClipAsset: (clipId: string) => Record<string, unknown> | undefined;
	applyGeneratedSrc: (clipId: string, url: string) => Promise<void>;
	emitStarted: (clipId: string) => void;
	emitCompleted: (clipId: string) => void;
	emitFailed: (clipId: string, error: string) => void;
}

/**
 * Owns the generation lifecycle: one host handler, one in-flight request per
 * clip, and the transient state the UI renders. State lives here rather than in
 * the document so it is never autosaved, undone, or restored on reload.
 */
export class AssetGenerator {
	private handler?: AssetGeneratorHandler;
	private readonly states = new Map<string, ClipGenerationState>();
	private readonly controllers = new Map<string, AbortController>();

	constructor(private readonly deps: AssetGeneratorDeps) {}

	public register(handler: AssetGeneratorHandler): void {
		this.handler = handler;
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
		if (this.states.get(clipId)?.status === "generating") return;

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
			this.states.delete(clipId);
			await this.deps.applyGeneratedSrc(clipId, url);
			this.deps.emitCompleted(clipId);
		} catch (error) {
			if (controller.signal.aborted) return;
			const message = error instanceof Error ? error.message : String(error);
			this.states.set(clipId, { status: "failed", error: message });
			this.deps.emitFailed(clipId, message);
			throw error;
		} finally {
			this.controllers.delete(clipId);
		}
	}

	public abort(clipId: string): void {
		this.controllers.get(clipId)?.abort();
		this.controllers.delete(clipId);
		this.states.delete(clipId);
	}

	public abortAll(): void {
		for (const clipId of [...this.controllers.keys()]) this.abort(clipId);
		this.states.clear();
	}
}
