import type { AiPendingOverlay } from "@canvas/players/generation/pending-overlay";
import { bindGenerationState } from "@canvas/players/generation/state-binding";
import type { Edit } from "@core/edit-session";
import { EventEmitter } from "@core/events/event-emitter";
import { EditEvent, type EditEventMap } from "@core/events/edit-events";

function setup(state: { status: "generating" | "failed"; error?: string }) {
	const events = new EventEmitter<EditEventMap>();
	const edit = {
		getClipGenerationState: jest.fn(() => state),
		getInternalEvents: jest.fn(() => events)
	} as unknown as Edit;
	const overlay = {
		setGenerating: jest.fn(),
		setFailed: jest.fn()
	} as unknown as AiPendingOverlay;
	return { edit, events, overlay };
}

describe("generation state binding", () => {
	it("initialises from current state and follows matching events", () => {
		const { edit, events, overlay } = setup({ status: "generating" });
		const unbind = bindGenerationState(edit, "clip-1", overlay);

		expect(overlay.setGenerating).toHaveBeenCalledWith(true);
		events.emit(EditEvent.ClipGenerationFailed, { clipId: "clip-1", error: "model unavailable" });
		expect(overlay.setFailed).toHaveBeenCalledWith("model unavailable");

		unbind();
		events.emit(EditEvent.ClipGenerationStarted, { clipId: "clip-1" });
		expect(overlay.setGenerating).toHaveBeenCalledTimes(1);
	});

	it("uses a generic message when failed state has no error", () => {
		const { edit, overlay } = setup({ status: "failed" });

		bindGenerationState(edit, "clip-1", overlay);

		expect(overlay.setFailed).toHaveBeenCalledWith("Generation failed");
	});
});
