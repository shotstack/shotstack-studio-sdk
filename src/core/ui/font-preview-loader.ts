/**
 * Font Preview Loader
 *
 * Lazily loads Google Fonts as they become visible in the viewport.
 * Uses IntersectionObserver for visibility detection and a loading queue
 * to limit concurrent font downloads and prevent browser freezing.
 */

import { GOOGLE_FONTS_BY_NAME } from "../fonts/google-fonts";

/** Maximum concurrent font downloads */
const MAX_CONCURRENT_LOADS = 3;

/** Preload fonts when within this distance of viewport */
const ROOT_MARGIN = "100px";

/**
 * Manages lazy loading of Google Fonts for preview purposes.
 * Uses IntersectionObserver to detect when font items enter the viewport
 * and loads them with a concurrency limit.
 */
export class FontPreviewLoader {
	private loadingQueue: string[] = [];
	private loadedFonts = new Set<string>();
	private pendingFonts = new Set<string>();
	private activeLoads = 0;
	private observer: IntersectionObserver | null = null;
	private observerRoot: Element | null = null;
	private callbacks = new Map<string, Set<() => void>>();

	constructor() {
		this.createObserver(null);
	}

	/**
	 * Set the root element for the IntersectionObserver.
	 * Call this when using the loader inside a scrollable container.
	 */
	setRoot(root: Element | null): void {
		if (this.observerRoot === root) return;
		this.observerRoot = root;
		this.createObserver(root);
	}

	/**
	 * Create or recreate the IntersectionObserver with the given root.
	 */
	private createObserver(root: Element | null): void {
		if (this.observer) {
			this.observer.disconnect();
		}
		this.observer = new IntersectionObserver(
			entries => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const element = entry.target as HTMLElement;
						const fontName = element.dataset["fontFamily"];
						if (fontName) {
							this.enqueue(fontName);
						}
					}
				}
			},
			{ root, rootMargin: ROOT_MARGIN }
		);
	}

	/**
	 * Start observing an element for visibility.
	 * When visible, the font specified in data-font-family will be loaded.
	 */
	observe(element: HTMLElement): void {
		this.observer?.observe(element);
	}

	/**
	 * Stop observing an element.
	 */
	unobserve(element: HTMLElement): void {
		this.observer?.unobserve(element);
	}

	/**
	 * Check if a font has been loaded.
	 */
	isLoaded(fontName: string): boolean {
		return this.loadedFonts.has(fontName);
	}

	/**
	 * Register a callback to be called when a font is loaded.
	 * If the font is already loaded, callback is called immediately.
	 */
	onLoad(fontName: string, callback: () => void): void {
		if (this.loadedFonts.has(fontName)) {
			callback();
			return;
		}

		let callbacks = this.callbacks.get(fontName);
		if (!callbacks) {
			callbacks = new Set();
			this.callbacks.set(fontName, callbacks);
		}
		callbacks.add(callback);
	}

	/**
	 * Remove a load callback.
	 */
	offLoad(fontName: string, callback: () => void): void {
		const callbacks = this.callbacks.get(fontName);
		if (callbacks) {
			callbacks.delete(callback);
			if (callbacks.size === 0) {
				this.callbacks.delete(fontName);
			}
		}
	}

	/**
	 * Preload a font immediately (bypasses intersection observer).
	 * Useful for loading the currently selected font.
	 */
	async preload(fontName: string): Promise<void> {
		if (this.loadedFonts.has(fontName) || this.pendingFonts.has(fontName)) {
			return;
		}

		// Add to front of queue for priority loading
		this.loadingQueue.unshift(fontName);
		this.pendingFonts.add(fontName);
		await this.processQueue();
	}

	/**
	 * Add a font to the loading queue.
	 */
	private enqueue(fontName: string): void {
		if (this.loadedFonts.has(fontName) || this.pendingFonts.has(fontName)) {
			return;
		}

		this.loadingQueue.push(fontName);
		this.pendingFonts.add(fontName);
		this.processQueue();
	}

	/**
	 * Process the loading queue with concurrency limit.
	 */
	private async processQueue(): Promise<void> {
		while (this.activeLoads < MAX_CONCURRENT_LOADS && this.loadingQueue.length > 0) {
			const fontName = this.loadingQueue.shift();
			if (fontName) {
				this.activeLoads += 1;

				// Don't await - allow parallel loading
				this.loadFont(fontName)
					.catch(() => {
						// Font loading failed - remove from pending
						this.pendingFonts.delete(fontName);
					})
					.finally(() => {
						this.activeLoads -= 1;
						this.processQueue();
					});
			}
		}
	}

	/**
	 * Load a single font using the FontFace API.
	 */
	private async loadFont(fontName: string): Promise<void> {
		const font = GOOGLE_FONTS_BY_NAME.get(fontName);
		if (!font) {
			this.pendingFonts.delete(fontName);
			return;
		}

		try {
			// Note: We don't use document.fonts.check() because it returns true for
			// system fonts with the same name (e.g., Roboto is built into Chrome/Android).
			// We always load from our URL to ensure the correct Google Font is used.
			const fontFace = new FontFace(fontName, `url(${font.url})`, {
				weight: String(font.weight),
				style: "normal"
			});

			await fontFace.load();
			document.fonts.add(fontFace);
			this.markLoaded(fontName);
		} catch {
			// Failed to load font - silently continue
			this.pendingFonts.delete(fontName);
		}
	}

	/**
	 * Mark a font as loaded and notify callbacks.
	 */
	private markLoaded(fontName: string): void {
		this.loadedFonts.add(fontName);
		this.pendingFonts.delete(fontName);

		const callbacks = this.callbacks.get(fontName);
		if (callbacks) {
			for (const callback of callbacks) {
				callback();
			}
			this.callbacks.delete(fontName);
		}
	}

	/**
	 * Clean up resources.
	 */
	destroy(): void {
		this.observer?.disconnect();
		this.loadingQueue = [];
		this.callbacks.clear();
	}
}

// Singleton instance for the application
let instance: FontPreviewLoader | null = null;

/**
 * Get the shared FontPreviewLoader instance.
 */
export function getFontPreviewLoader(): FontPreviewLoader {
	if (!instance) {
		instance = new FontPreviewLoader();
	}
	return instance;
}
