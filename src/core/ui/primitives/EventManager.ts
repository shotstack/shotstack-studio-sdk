import type { Disposable, EventBinding } from "./types";

/**
 * Centralized event listener management that prevents memory leaks.
 *
 * All event listeners registered through EventManager are automatically
 * tracked and can be cleaned up with a single dispose() call.
 *
 * @example
 * ```typescript
 * const events = new EventManager();
 * events.on(button, "click", handleClick);
 * events.onAll(items, "click", handleItemClick);
 * // Later...
 * events.dispose(); // All listeners removed
 * ```
 */
export class EventManager implements Disposable {
	private bindings: EventBinding[] = [];

	/**
	 * Register an event listener on a single element.
	 */
	on<K extends keyof HTMLElementEventMap>(
		element: HTMLElement | null | undefined,
		type: K,
		handler: (e: HTMLElementEventMap[K]) => void,
		options?: AddEventListenerOptions
	): void {
		if (!element) return;
		element.addEventListener(type, handler as EventListener, options);
		this.bindings.push({
			element,
			type,
			handler: handler as EventListener,
			options
		});
	}

	/**
	 * Register an event listener on multiple elements.
	 * The handler receives both the event and the target element.
	 */
	onAll<K extends keyof HTMLElementEventMap>(
		elements: NodeListOf<Element> | Element[] | null | undefined,
		type: K,
		handler: (e: HTMLElementEventMap[K], el: Element) => void
	): void {
		if (!elements) return;
		elements.forEach(el => {
			const wrappedHandler = (e: Event) => handler(e as HTMLElementEventMap[K], el);
			el.addEventListener(type, wrappedHandler);
			this.bindings.push({
				element: el,
				type,
				handler: wrappedHandler
			});
		});
	}

	/**
	 * Register a document-level event listener.
	 */
	onDocument<K extends keyof DocumentEventMap>(type: K, handler: (e: DocumentEventMap[K]) => void, options?: AddEventListenerOptions): void {
		document.addEventListener(type, handler as EventListener, options);
		this.bindings.push({
			element: document,
			type,
			handler: handler as EventListener,
			options
		});
	}

	/**
	 * Remove all registered event listeners.
	 */
	dispose(): void {
		for (const { element, type, handler, options } of this.bindings) {
			element.removeEventListener(type, handler, options);
		}
		this.bindings = [];
	}

	/**
	 * Get the count of registered listeners (useful for debugging).
	 */
	get listenerCount(): number {
		return this.bindings.length;
	}
}
