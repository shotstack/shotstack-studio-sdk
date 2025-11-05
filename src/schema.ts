/**
 * Schema-only exports for validation without WASM initialization
 * Use this import path when you only need schema validation:
 * import { AssetSchema, ClipSchema } from '@shotstack/shotstack-studio/schema'
 */

// Re-export everything from the schemas barrel export
export * from "@schemas/index";
