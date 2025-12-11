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
 * Conversion happens at serialization boundary only.
 */
export interface SerializedMergeField {
	find: string;
	replace: string;
}

/** Convert internal MergeField to serialized API format */
export function toSerialized(field: MergeField): SerializedMergeField {
	return { find: field.name, replace: field.defaultValue };
}

/** Convert serialized API format to internal MergeField */
export function fromSerialized(field: SerializedMergeField): MergeField {
	return { name: field.find, defaultValue: field.replace };
}
