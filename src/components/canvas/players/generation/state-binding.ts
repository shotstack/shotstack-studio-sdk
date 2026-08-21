import type { Edit } from "@core/edit-session";
import { InternalEvent } from "@core/events/edit-events";

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
	events.on(InternalEvent.ClipGenerationStarted, onStarted);
	events.on(InternalEvent.ClipGenerationCompleted, onCompleted);
	events.on(InternalEvent.ClipGenerationFailed, onFailed);

	return () => {
		events.off(InternalEvent.ClipGenerationStarted, onStarted);
		events.off(InternalEvent.ClipGenerationCompleted, onCompleted);
		events.off(InternalEvent.ClipGenerationFailed, onFailed);
	};
}
