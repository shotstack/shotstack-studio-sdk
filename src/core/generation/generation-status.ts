import type { Edit } from "@core/edit-session";

export type GenerationConfig = {
	clipId: string;
	type: "image" | "video" | "audio";
	model?: string;
	options: Record<string, unknown>;
	length: number | undefined;
	prompt: string;
};

export type GenerationStatus = {
	text: string;
	tone?: "neutral" | "warning" | "error";
	onActivate?: () => void;
};

export type GenerationStatusRequest = GenerationConfig & {
	/** Aborted when the configuration changes again or the clip is deselected. */
	signal: AbortSignal;
};

export type GenerationStatusProvider = (request: GenerationStatusRequest) => GenerationStatus | undefined | Promise<GenerationStatus | undefined>;

export function registerGenerationStatus(edit: Edit, provider: GenerationStatusProvider): () => void {
	return edit.registerGenerationStatus(provider);
}
