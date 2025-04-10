import * as pixi from "pixi.js";

import { AssetLoadTracker, type AssetLoadInfoStatus } from "../events/asset-load-tracker";

export class AssetLoader {
	public loadTracker: AssetLoadTracker;

	constructor() {
		this.loadTracker = new AssetLoadTracker();
	}

	public async load<TResolvedAsset>(identifier: string, loadOptions: pixi.UnresolvedAsset): Promise<TResolvedAsset | null> {
		this.updateAssetLoadMetadata(identifier, "pending", 0);

		try {
			const resolvedAsset = await pixi.Assets.load<TResolvedAsset>(loadOptions, progress => {
				this.updateAssetLoadMetadata(identifier, "loading", progress);
			});
			this.updateAssetLoadMetadata(identifier, "success", 1);
			return resolvedAsset;
		} catch (error) {
			this.updateAssetLoadMetadata(identifier, "failed", 1);
			return null;
		}
	}

	public getProgress(): number {
		const identifiers = Object.keys(this.loadTracker.registry);
		const totalProgress = identifiers.reduce((acc, identifier) => acc + this.loadTracker.registry[identifier].progress, 0);

		return totalProgress / identifiers.length;
	}

	private updateAssetLoadMetadata(identifier: string, status: AssetLoadInfoStatus, progress: number): void {
		if (!this.loadTracker.registry[identifier]) {
			this.loadTracker.registry[identifier] = { progress, status };
		} else {
			this.loadTracker.registry[identifier].progress = progress;
			this.loadTracker.registry[identifier].status = status;
		}

		const assetLoadStatusRegistry = { ...this.loadTracker.registry };
		this.loadTracker.emit("onAssetLoadInfoUpdated", { registry: assetLoadStatusRegistry });
	}
}
