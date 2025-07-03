import { EventEmitter } from "./event-emitter";

export type AssetLoadInfoStatus = "pending" | "loading" | "success" | "failed";

export type AssetLoadInfo = {
	progress: number;
	status: AssetLoadInfoStatus;
};

export type AssetLoadInfoUpdatedPayload = {
	registry: Record<string, AssetLoadInfo>;
};

export type AssetEventMap = {
	onAssetLoadInfoUpdated: AssetLoadInfoUpdatedPayload;
};

export class AssetLoadTracker extends EventEmitter<AssetEventMap> {
	public registry: Record<string, AssetLoadInfo>;

	constructor() {
		super();

		this.registry = {};
	}
}
