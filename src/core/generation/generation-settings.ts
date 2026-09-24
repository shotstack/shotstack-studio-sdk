import type { Edit } from "@core/edit-session";

export type GenerationSettingsHandler = (request: { clipId: string; model: string }) => void;

export function registerGenerationSettings(edit: Edit, handler: GenerationSettingsHandler): () => void {
	return edit.registerGenerationSettings(handler);
}
