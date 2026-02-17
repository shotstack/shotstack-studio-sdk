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
	/** HTML attributes to apply to the label element (e.g. data-merge-path) */
	labelAttributes?: Record<string, string>;
}

/**
 * Merge field label configuration.
 * Replaces a static property label with one that supports merge field binding.
 */
export interface MergeFieldLabelConfig extends UIComponentConfig {
	/** Display label for the property (e.g. "Opacity") */
	label: string;
	/** Dot-notation path to the clip property (e.g. "asset.font.opacity") */
	propertyPath: string;
	/** Prefix for auto-generated field names (e.g. "TEXT_OPACITY") */
	namePrefix: string;
}

/**
 * A single item in a ScrollableList.
 */
export interface ScrollableListItem {
	/** Value identifier (emitted on selection) */
	value: string;
	/** Display label */
	label: string;
	/** Optional data attributes to apply to the item element */
	data?: Record<string, string>;
}

/**
 * A group of items with a header in a ScrollableList.
 */
export interface ScrollableListGroup {
	/** Group header text */
	header: string;
	/** Optional secondary text displayed alongside the header */
	headerDetail?: string;
	/** Items in this group */
	items: ScrollableListItem[];
}

/**
 * Configuration for the ScrollableList component.
 */
export interface ScrollableListConfig extends UIComponentConfig {
	/** Groups of items to display */
	groups: ScrollableListGroup[];
	/** Fixed height in pixels (required for scroll containment) */
	height?: number;
	/** Currently selected value */
	selectedValue?: string;
}
