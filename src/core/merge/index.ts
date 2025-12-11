/**
 * Merge field module for the Shotstack Studio SDK.
 *
 * Provides types, services, and utilities for merge field management.
 */

// Types
export type { MergeField, SerializedMergeField } from "./types";
export { toSerialized, fromSerialized } from "./types";

// Service
export { MergeFieldService, MERGE_FIELD_PATTERN, MERGE_FIELD_TEST_PATTERN } from "./merge-field-service";
export type { MergeFieldEvents } from "./merge-field-service";

// Utility
export { applyMergeFields } from "./merge-fields";
