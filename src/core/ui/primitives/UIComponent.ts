import { EventManager } from "./EventManager";
import type { ChangeCallback, Disposable, Mountable, UIComponentConfig } from "./types";

/**
 * Abstract base class for all UI components.
 *
 * Provides a consistent lifecycle (mount, unmount, dispose), centralized
 * event management, and a callback system for value changes.
 *
 * @typeParam T - The type of value this component emits via onChange
 *
 * @example
 * ```typescript
 * class MySlider extends UIComponent<number> {
 *   render() { return '<input type="range" />'; }
 *   protected bindElements() { this.slider = this.container?.querySelector('input'); }
 *   protected setupEvents() { this.events.on(this.slider, 'input', () => this.emit(value)); }
 * }
 * ```
 */
export abstract class UIComponent<T = void> implements Mountable, Disposable {
	protected container: HTMLElement | null = null;
	protected events: EventManager;
	protected changeCallbacks: ChangeCallback<T>[] = [];
	protected mounted = false;

	constructor(protected config: UIComponentConfig = {}) {
		this.events = new EventManager();
	}

	/**
	 * Return the HTML string for this component.
	 * Called during mount() to populate the container.
	 */
	abstract render(): string;

	/**
	 * Query and store references to DOM elements.
	 * Called after render() during mount().
	 */
	protected abstract bindElements(): void;

	/**
	 * Set up event listeners using this.events.
	 * Called after bindElements() during mount().
	 */
	protected abstract setupEvents(): void;

	/**
	 * Mount the component to a parent element.
	 */
	mount(parent: HTMLElement): void {
		if (this.mounted) return;

		this.container = document.createElement("div");

		if (this.config.className) {
			this.container.className = this.config.className;
		}

		if (this.config.attributes) {
			for (const [key, value] of Object.entries(this.config.attributes)) {
				this.container.setAttribute(key, value);
			}
		}

		this.container.innerHTML = this.render();
		parent.appendChild(this.container);

		this.bindElements();
		this.setupEvents();
		this.mounted = true;
	}

	/**
	 * Remove the component from the DOM without disposing.
	 */
	unmount(): void {
		this.container?.remove();
		this.mounted = false;
	}

	/**
	 * Register a callback for value changes.
	 */
	onChange(callback: ChangeCallback<T>): void {
		this.changeCallbacks.push(callback);
	}

	/**
	 * Emit a value to all registered callbacks.
	 */
	protected emit(value: T): void {
		for (const callback of this.changeCallbacks) {
			callback(value);
		}
	}

	/**
	 * Clean up all resources: event listeners, DOM, callbacks.
	 */
	dispose(): void {
		this.events.dispose();
		this.unmount();
		this.container = null;
		this.changeCallbacks = [];
	}

	/**
	 * Get the root container element.
	 */
	getContainer(): HTMLElement | null {
		return this.container;
	}

	/**
	 * Check if component is currently mounted.
	 */
	isMounted(): boolean {
		return this.mounted;
	}

	/**
	 * Show the component (set display to default).
	 */
	show(): void {
		if (this.container) {
			this.container.style.display = "";
		}
	}

	/**
	 * Hide the component.
	 */
	hide(): void {
		if (this.container) {
			this.container.style.display = "none";
		}
	}

	/**
	 * Toggle visibility.
	 */
	toggle(visible?: boolean): void {
		const shouldShow = visible ?? this.container?.style.display === "none";
		if (shouldShow) {
			this.show();
		} else {
			this.hide();
		}
	}
}
