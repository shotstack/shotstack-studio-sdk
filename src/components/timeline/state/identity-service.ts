import { Player } from "@canvas/players/player";

/**
 * Service for generating stable, content-based identifiers for clips
 */
export class ClipIdentityService {
	private signatureCache = new WeakMap<Player, string>();

	private readonly ID_PREFIX = "clip";
	private readonly ID_LENGTH = 9;

	/**
	 * Generate a stable ID based on clip content
	 */
	public generateClipId(player: Player): string {
		const signature = this.getPlayerSignature(player);
		const timestamp = Date.now();
		const random = Math.random().toString(36).slice(2, 2 + this.ID_LENGTH);
		return `${this.ID_PREFIX}_${signature}_${timestamp}_${random}`;
	}

	/**
	 * Create a content-based signature from player properties
	 */
	public getPlayerSignature(player: Player): string {
		return this.signatureCache.get(player) || this.createSignature(player);
	}

	private createSignature(player: Player): string {
		const config = player.clipConfiguration;
		const signature = this.hashObject({
			assetType: config.asset?.type,
			assetSrc: this.extractAssetIdentifier(config.asset),
			duration: config.length
		});

		this.signatureCache.set(player, signature);
		return signature;
	}

	private extractAssetIdentifier(asset: any): string | undefined {
		if (!asset) return undefined;
		return asset.src || asset.text || asset.html || asset.type;
	}

	private hashObject(obj: any): string {
		const str = JSON.stringify(obj, Object.keys(obj).sort());
		let hash = 0;

		for (const char of str) {
			hash = Math.floor(hash * 31 + char.charCodeAt(0));
		}

		return Math.abs(hash).toString(36);
	}

	public clearCache = (player: Player): void => this.signatureCache.delete(player);
	public clearAllCache = (): void => { this.signatureCache = new WeakMap(); };
}
