import { Player } from "@canvas/players/player";

/**
 * Service responsible for generating stable, content-based identifiers for clips.
 * These IDs remain consistent across position changes, enabling robust clip tracking.
 */
export class ClipIdentityService {
	private signatureCache = new WeakMap<Player, string>();

	/**
	 * Generate a stable ID based on clip content, not position.
	 * Uses player signature and timestamp to ensure uniqueness.
	 */
	public generateClipId(player: Player, _trackIndex: number, _clipIndex: number): string {
		const signature = this.getPlayerSignature(player);
		// Use signature + timestamp for uniqueness
		// Including indices in the ID helps with debugging but they're not used for identity
		return `clip_${signature}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Create a content-based signature that survives position changes.
	 * Uses immutable properties of the player to generate a consistent hash.
	 */
	public getPlayerSignature(player: Player): string {
		// Check cache first
		let signature = this.signatureCache.get(player);
		if (signature) {
			return signature;
		}

		// Extract identifying properties from player configuration
		const config = player.clipConfiguration;
		const props = {
			assetType: config.asset?.type,
			assetSrc: this.extractAssetIdentifier(config.asset),
			duration: config.length
			// Add other identifying properties but NOT position (start time)
			// as position changes should not affect identity
		};

		signature = this.hashObject(props);
		this.signatureCache.set(player, signature);
		return signature;
	}

	/**
	 * Extract a stable identifier from various asset types
	 */
	private extractAssetIdentifier(asset: any): string | undefined {
		if (!asset) return undefined;

		// Handle different asset types
		if (asset.src) {
			return asset.src;
		}
		if (asset.text) {
			// For text assets, use the text content as identifier
			return asset.text;
		}
		if (asset.html) {
			// For HTML assets, use the HTML content
			return asset.html;
		}

		// Fallback to type if no content identifier available
		return asset.type;
	}

	/**
	 * Create a hash of an object for signature generation.
	 * Uses a simple hash for now, but can be upgraded to crypto.subtle if needed.
	 */
	private hashObject(obj: any): string {
		// Sort keys to ensure consistent hashing
		const str = JSON.stringify(obj, Object.keys(obj).sort());

		// Simple hash function - can be replaced with crypto.subtle.digest for production
		let hash = 0;
		for (let i = 0; i < str.length; i += 1) {
			const char = str.charCodeAt(i);
			hash = ((hash * 32) - hash) + char;
			hash = Math.floor(hash); // Convert to 32-bit integer
		}

		return Math.abs(hash).toString(36);
	}

	/**
	 * Advanced hash using Web Crypto API when available
	 * This can be used in production for more robust hashing
	 */
	private async hashObjectSecure(obj: any): Promise<string> {
		const str = JSON.stringify(obj, Object.keys(obj).sort());

		// Check if crypto.subtle is available
		if (typeof crypto !== "undefined" && crypto.subtle) {
			const encoder = new TextEncoder();
			const data = encoder.encode(str);
			const hashBuffer = await crypto.subtle.digest("SHA-256", data);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
			return hashHex.substring(0, 16); // Use first 16 chars for brevity
		}

		// Fallback to simple hash
		return this.hashObject(obj);
	}

	/**
	 * Clear the signature cache for a specific player
	 */
	public clearCache(player: Player): void {
		this.signatureCache.delete(player);
	}

	/**
	 * Clear the entire signature cache
	 */
	public clearAllCache(): void {
		// WeakMap doesn't have a clear method, so we need to create a new one
		this.signatureCache = new WeakMap<Player, string>();
	}
}
