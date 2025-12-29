/**
 * Merge field types for the Shotstack Studio SDK.
 *
 * Merge fields allow dynamic content substitution using {{ FIELD_NAME }} syntax.
 * Values are replaced at render time, enabling template-based video generation.
 */

/**
 * A merge field definition used throughout the SDK.
 */
export interface MergeField {
	/** Field identifier (uppercase convention: MY_FIELD) */
	name: string;

	/** Default value used for preview when no runtime value is provided */
	defaultValue: string;

	/** Optional description for UI display */
	description?: string;
}

/**
 * Serialized format for JSON export (matches Shotstack API).
 * The replace value can be any type - strings, numbers, booleans, objects.
 */
export interface SerializedMergeField {
	find: string;
	replace: unknown;
}

/** Convert internal MergeField to serialized API format */
export function toSerialized(field: MergeField): SerializedMergeField {
	return { find: field.name, replace: field.defaultValue };
}

/** Convert serialized API format to internal MergeField */
export function fromSerialized(field: SerializedMergeField): MergeField {
	// Coerce unknown replace value to string for internal SDK use
	const replaceValue = typeof field.replace === "string" ? field.replace : JSON.stringify(field.replace);
	return { name: field.find, defaultValue: replaceValue };
}
