/**
 * Merge field replacement utility for Shotstack Studio SDK.
 * Applies merge field substitutions to entire data structures.
 * @internal
 */

import type { SerializedMergeField } from "./types";

/**
 * Escapes special regex characters in a string.
 */
function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceMergeFieldsRecursive<T>(obj: T, fields: SerializedMergeField[]): T {
	if (typeof obj === "string") {
		let result: string = obj;
		for (const { find, replace } of fields) {
			// Convert replace value to string (handles unknown type from external schema)
			const replaceStr = typeof replace === "string" ? replace : JSON.stringify(replace);
			result = result.replace(new RegExp(`\\{\\{\\s*${escapeRegExp(find)}\\s*\\}\\}`, "gi"), replaceStr);
		}
		return result as unknown as T;
	}

	if (Array.isArray(obj)) {
		return obj.map(item => replaceMergeFieldsRecursive(item, fields)) as unknown as T;
	}

	if (obj !== null && typeof obj === "object") {
		const result = obj as Record<string, unknown>;
		for (const key of Object.keys(result)) {
			result[key] = replaceMergeFieldsRecursive(result[key], fields);
		}
	}

	return obj;
}

/**
 * Applies merge field replacements to any data structure.
 * Recursively traverses objects and arrays, replacing placeholders in strings.
 *
 * @param data - The data structure to process
 * @param mergeFields - Array of { find, replace } pairs
 * @returns A deep clone of the data with all merge fields replaced
 */
export function applyMergeFields<T>(data: T, mergeFields: SerializedMergeField[]): T {
	if (!mergeFields?.length) return data;
	return replaceMergeFieldsRecursive(structuredClone(data), mergeFields);
}
