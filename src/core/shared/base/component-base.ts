import type { Edit } from "@edit";
import { Entity } from "@preview/base/entity";
import type { Listener } from "@shared/events/event-emitter";
import type { TimelineEventMap } from "@timeline/timeline-types";

/**
 * Base class for components that need to handle timeline events with automatic binding management.
 * Extends Entity to provide auto-binding utilities that reduce boilerplate code.
 */
export abstract class ComponentBase extends Entity {
	protected edit: Edit;
	private eventBindings: Map<string, Listener<any>> = new Map();

	constructor(edit: Edit) {
		super();
		this.edit = edit;
	}

	/**
	 * Bind an event handler with automatic cleanup management.
	 * The handler will be automatically unbound when the component is disposed.
	 *
	 * @param event - The event name to bind to
	 * @param handler - The event handler function
	 */
	protected bindEvent<K extends keyof TimelineEventMap>(event: K, handler: (data: TimelineEventMap[K]) => void): void {
		const boundHandler: Listener<TimelineEventMap[K]> = handler.bind(this);
		this.edit.events.on(event, boundHandler);
		this.eventBindings.set(event as string, boundHandler);
	}

	/**
	 * Manually unbind a specific event handler.
	 * Usually not needed as dispose() will handle all cleanup.
	 *
	 * @param event - The event name to unbind
	 */
	protected unbindEvent<K extends keyof TimelineEventMap>(event: K): void {
		const handler = this.eventBindings.get(event as string);
		if (handler) {
			this.edit.events.off(event, handler);
			this.eventBindings.delete(event as string);
		}
	}

	/**
	 * Override dispose to automatically clean up all event bindings.
	 * Subclasses should call super.dispose() to ensure proper cleanup.
	 */
	public override dispose(): void {
		// Clean up all event bindings
		this.eventBindings.forEach((handler, event) => {
			this.edit.events.off(event as keyof TimelineEventMap, handler);
		});
		this.eventBindings.clear();

		// Entity is abstract, so we need to call its dispose implementation differently
		// Just clean up the container here since Entity's dispose is abstract
		this.getContainer().removeAllListeners();
		this.getContainer().destroy({ children: true });
	}
}
