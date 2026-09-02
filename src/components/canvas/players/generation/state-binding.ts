import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";

import type { AiPendingOverlay } from "./pending-overlay";

export function bindGenerationState(edit: Edit, clipId: string | null, overlay: AiPendingOverlay): () => void {
	if (!clipId) return () => {};
	const state = edit.getClipGenerationState(clipId);
	if (state?.status === "generating") overlay.setGenerating(true);
	if (state?.status === "failed") overlay.setFailed(state.error ?? "Generation failed");

	const onStarted = ({ clipId: id }: { clipId: string }): void => {
		if (id === clipId) overlay.setGenerating(true);
	};
	const onCompleted = ({ clipId: id }: { clipId: string }): void => {
		if (id === clipId) overlay.setGenerating(false);
	};
	const onFailed = ({ clipId: id, error }: { clipId: string; error: string }): void => {
		if (id === clipId) overlay.setFailed(error);
	};

	const events = edit.getInternalEvents();
	events.on(EditEvent.ClipGenerationStarted, onStarted);
	events.on(EditEvent.ClipGenerationCompleted, onCompleted);
	events.on(EditEvent.ClipGenerationFailed, onFailed);

	return () => {
		events.off(EditEvent.ClipGenerationStarted, onStarted);
		events.off(EditEvent.ClipGenerationCompleted, onCompleted);
		events.off(EditEvent.ClipGenerationFailed, onFailed);
	};
}
