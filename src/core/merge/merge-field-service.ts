/**
 * Centralized service for merge field management.
 *
 * Provides CRUD operations, string resolution, and event emission
 * for merge fields throughout the SDK.
 */

import type { EventEmitter } from "@core/events/event-emitter";

import { type MergeField, type SerializedMergeField, fromSerialized, toSerialized } from "./types";

/** Regex pattern for merge field detection and extraction */
export const MERGE_FIELD_PATTERN = /\{\{\s*([A-Z_0-9]+)\s*\}\}/gi;

/** Regex pattern for testing if a string contains any merge field */
export const MERGE_FIELD_TEST_PATTERN = /\{\{\s*[A-Z_0-9]+\s*\}\}/i;

/** Event payloads emitted by the merge field service */
export interface MergeFieldEvents {
	"mergefield:registered": { field: MergeField };
	"mergefield:updated": { field: MergeField };
	"mergefield:removed": { name: string };
	"mergefield:changed": { fields: MergeField[] };
}

export class MergeFieldService {
	private fields: Map<string, MergeField> = new Map();
	private events: EventEmitter;

	constructor(events: EventEmitter) {
		this.events = events;
	}

	// ─── CRUD Operations ────────────────────────────────────────────────────────

	/**
	 * Register or update a merge field.
	 * @param field The merge field to register
	 * @param options.silent If true, suppresses event emission (for command-based operations)
	 */
	register(field: MergeField, options?: { silent?: boolean }): void {
		const isNew = !this.fields.has(field.name);
		this.fields.set(field.name, field);

		if (!options?.silent) {
			this.events.emit(isNew ? "mergefield:registered" : "mergefield:updated", { field });
			this.events.emit("mergefield:changed", { fields: this.getAll() });
		}
	}

	/**
	 * Remove a merge field by name.
	 * @param name The field name to remove
	 * @param options.silent If true, suppresses event emission (for command-based operations)
	 */
	remove(name: string, options?: { silent?: boolean }): boolean {
		const removed = this.fields.delete(name);
		if (removed && !options?.silent) {
			this.events.emit("mergefield:removed", { name });
			this.events.emit("mergefield:changed", { fields: this.getAll() });
		}
		return removed;
	}

	/** Get a merge field by name */
	get(name: string): MergeField | undefined {
		return this.fields.get(name);
	}

	/** Get all registered merge fields */
	getAll(): MergeField[] {
		return Array.from(this.fields.values());
	}

	/** Clear all merge fields */
	clear(): void {
		this.fields.clear();
	}

	// ─── String Operations ──────────────────────────────────────────────────────

	/**
	 * Apply merge field substitutions to a string.
	 * Replaces {{ FIELD_NAME }} patterns with their default values.
	 */
	resolve(input: string): string {
		if (!input || this.fields.size === 0) return input;

		return input.replace(MERGE_FIELD_PATTERN, (match, fieldName: string) => {
			const field = this.fields.get(fieldName);
			return field?.defaultValue ?? match;
		});
	}

	/**
	 * Check if a string contains unresolved merge fields.
	 * Returns true if any {{ FIELD_NAME }} patterns remain after resolution.
	 */
	hasUnresolved(input: string): boolean {
		if (!input) return false;
		const resolved = this.resolve(input);
		return MERGE_FIELD_TEST_PATTERN.test(resolved);
	}

	/**
	 * Extract the first merge field name from a string.
	 * Returns null if no merge field pattern is found.
	 */
	extractFieldName(input: string): string | null {
		if (!input) return null;
		const match = MERGE_FIELD_TEST_PATTERN.exec(input);
		if (!match) return null;

		const nameMatch = match[0].match(/\{\{\s*([A-Z_0-9]+)\s*\}\}/i);
		return nameMatch ? nameMatch[1] : null;
	}

	/** Check if a string is a merge field template (contains {{ FIELD }}) */
	isMergeFieldTemplate(input: string): boolean {
		return MERGE_FIELD_TEST_PATTERN.test(input);
	}

	/** Create a merge field template string from a field name */
	createTemplate(fieldName: string): string {
		return `{{ ${fieldName} }}`;
	}

	// ─── Serialization ──────────────────────────────────────────────────────────

	/** Export fields in Shotstack API format ({ find, replace }) */
	toSerializedArray(): SerializedMergeField[] {
		return this.getAll().map(toSerialized);
	}

	/** Import fields from Shotstack API format (does not emit event - called during loadEdit) */
	loadFromSerialized(fields: SerializedMergeField[]): void {
		this.fields.clear();
		for (const f of fields) {
			this.fields.set(f.find, fromSerialized(f));
		}
	}

	// ─── Utility ────────────────────────────────────────────────────────────────

	/** Generate a unique field name with a given prefix (e.g., MEDIA_1, MEDIA_2) */
	generateUniqueName(prefix: string): string {
		const existingNames = new Set(this.fields.keys());
		let counter = 1;
		while (existingNames.has(`${prefix}_${counter}`)) {
			counter += 1;
		}
		return `${prefix}_${counter}`;
	}
}
