import type { Asset } from "@schemas/asset";

/**
 * Merges original asset (with merge field templates) with current asset (with runtime changes).
 * Current asset properties override original, preserving both merge fields and runtime changes.
 */
export function mergeAssetForExport(originalAsset: Asset | undefined, currentAsset: Asset): Asset {
	if (!originalAsset) return currentAsset;
	return { ...originalAsset, ...currentAsset } as Asset;
}
