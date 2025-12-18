/**
 * Core interfaces for the UI primitives system.
 * These provide the foundation for composable toolbar components.
 */

/**
 * Configuration options common to all UI components.
 */
export interface UIComponentConfig {
	/** CSS class name(s) to apply to the container */
	className?: string;
	/** HTML attributes to apply to the container */
	attributes?: Record<string, string>;
}

/**
 * Interface for components that can be cleaned up.
 */
export interface Disposable {
	dispose(): void;
}

/**
 * Interface for components that can be mounted to the DOM.
 */
export interface Mountable {
	mount(parent: HTMLElement): void;
	unmount(): void;
}

/**
 * Callback type for value change notifications.
 */
export type ChangeCallback<T> = (value: T) => void;

/**
 * Event binding record for EventManager tracking.
 */
export interface EventBinding {
	element: EventTarget;
	type: string;
	handler: EventListener;
	options?: AddEventListenerOptions;
}

/**
 * Slider control configuration.
 */
export interface SliderConfig extends UIComponentConfig {
	label: string;
	min: number;
	max: number;
	step?: number;
	initialValue?: number;
	formatValue?: (value: number) => string;
}
