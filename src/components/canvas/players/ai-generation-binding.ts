import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";

import type { AiPendingOverlay } from "./ai-pending-overlay";

export function aiGenerateHandler(edit: Edit, clipId: string | null): (() => void) | undefined {
	if (!clipId || !edit.hasAssetGenerator()) return undefined;
	return () => {
		edit.generateClipAsset(clipId).catch(() => {
			// Failures surface as clip state; nothing to do here.
		});
	};
}

/** Hosts may register a generator after mount. Cheap to call every frame: only acts on a flip. */
export function createGenerateActionSync(edit: Edit, overlay: AiPendingOverlay, clipId: string | null): () => void {
	let last: boolean | null = null;
	return () => {
		const canGenerate = edit.hasAssetGenerator();
		if (canGenerate === last) return;
		last = canGenerate;
		overlay.setOnGenerate(aiGenerateHandler(edit, clipId));
	};
}

/** Mirrors generation state onto the overlay; returns its unsubscribe. */
export function bindGenerationState(edit: Edit, clipId: string | null, overlay: AiPendingOverlay): () => void {
	if (!clipId) return () => {};

	const onStarted = ({ clipId: id }: { clipId: string }): void => {
		if (id === clipId) overlay.setGenerating(true);
	};
	const onCompleted = ({ clipId: id }: { clipId: string }): void => {
		if (id === clipId) overlay.setGenerating(false);
	};
	const onFailed = ({ clipId: id, error }: { clipId: string; error: string }): void => {
		if (id === clipId) overlay.setFailed(error);
	};

	edit.events.on(EditEvent.ClipGenerationStarted, onStarted);
	edit.events.on(EditEvent.ClipGenerationCompleted, onCompleted);
	edit.events.on(EditEvent.ClipGenerationFailed, onFailed);

	return () => {
		edit.events.off(EditEvent.ClipGenerationStarted, onStarted);
		edit.events.off(EditEvent.ClipGenerationCompleted, onCompleted);
		edit.events.off(EditEvent.ClipGenerationFailed, onFailed);
	};
}
