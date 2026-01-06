/**
 * @internal Shotstack-only exports
 *
 * These are NOT part of the public SDK API.
 * External consumers should use the main export:
 *   import { Edit } from '@shotstack/studio-sdk';
 *
 * Shotstack products can use the internal export for full functionality:
 *   import { ShotstackEdit } from '@shotstack/studio-sdk/internal';
 */
export { ShotstackEdit } from "@core/shotstack-edit";

// Re-export MergeField types for ShotstackEdit users
export type { MergeField, MergeFieldService } from "@core/merge";
