/**
 * Virtual Font List
 *
 * Efficiently renders a large list of fonts using virtual scrolling.
 * Only renders visible items plus a small buffer, allowing smooth
 * scrolling of 1500+ fonts without DOM bloat.
 */

import { GOOGLE_FONTS, type GoogleFont, type GoogleFontCategory } from "../fonts/google-fonts";

import { getFontPreviewLoader } from "./font-preview-loader";

/** Height of each font item in pixels */
const ITEM_HEIGHT = 40;

/** Number of items to render above/below visible area */
const BUFFER_COUNT = 5;

export interface VirtualFontListOptions {
	/** Container element to render into */
	container: HTMLElement;
	/** Currently selected font filename */
	selectedFilename?: string;
	/** Callback when a font is selected */
	onSelect?: (font: GoogleFont) => void;
}

/**
 * Virtual scrolling list for fonts.
 * Renders only visible items for optimal performance with large font lists.
 */
export class VirtualFontList {
	private container: HTMLElement;
	private viewport: HTMLElement;
	private content: HTMLElement;
	private items = new Map<number, HTMLElement>();
	private filteredFonts: GoogleFont[] = [...GOOGLE_FONTS];
	private selectedFilename?: string;
	private onSelect?: (font: GoogleFont) => void;
	private scrollTop = 0;
	private viewportHeight = 0;
	private resizeObserver: ResizeObserver;
	private fontLoader = getFontPreviewLoader();

	// Event delegation handler for item clicks
	private handleContentClick = (e: MouseEvent): void => {
		const target = e.target as HTMLElement;
		const item = target.closest(".ss-font-item") as HTMLElement | null;
		if (!item || !item.dataset["index"]) return;

		const index = parseInt(item.dataset["index"], 10);
		const font = this.filteredFonts[index];
		if (!font) return;

		this.selectedFilename = font.filename;
		this.render();
		this.onSelect?.(font);
	};

	constructor(options: VirtualFontListOptions) {
		this.container = options.container;
		this.selectedFilename = options.selectedFilename;
		this.onSelect = options.onSelect;

		// Create viewport (scrollable container)
		this.viewport = document.createElement("div");
		this.viewport.className = "ss-font-list-viewport";
		this.viewport.addEventListener("scroll", this.handleScroll);

		// Create content (sized to full list height)
		this.content = document.createElement("div");
		this.content.className = "ss-font-list-content";
		this.content.addEventListener("click", this.handleContentClick);
		this.viewport.appendChild(this.content);

		this.container.appendChild(this.viewport);

		// Set the viewport as the root for the font loader's IntersectionObserver
		this.fontLoader.setRoot(this.viewport);

		// Observe container size changes
		this.resizeObserver = new ResizeObserver(() => {
			this.viewportHeight = this.viewport.clientHeight;
			this.render();
		});
		this.resizeObserver.observe(this.viewport);

		// Initial render
		requestAnimationFrame(() => {
			this.viewportHeight = this.viewport.clientHeight;
			this.render();
		});
	}

	/**
	 * Filter fonts by search query and/or category.
	 */
	setFilter(query?: string, category?: GoogleFontCategory): void {
		const lowerQuery = query?.toLowerCase().trim() || "";

		this.filteredFonts = GOOGLE_FONTS.filter(font => {
			const matchesQuery = !lowerQuery || font.displayName.toLowerCase().includes(lowerQuery);
			const matchesCategory = !category || font.category === category;
			return matchesQuery && matchesCategory;
		});

		// Reset scroll position when filter changes
		this.viewport.scrollTop = 0;
		this.scrollTop = 0;
		this.render();
	}

	/**
	 * Set the currently selected font.
	 */
	setSelected(filename?: string): void {
		this.selectedFilename = filename;
		this.render();
	}

	/**
	 * Scroll to make a font visible.
	 */
	scrollToFont(filename: string): void {
		const index = this.filteredFonts.findIndex(f => f.filename === filename);
		if (index >= 0) {
			const targetScroll = index * ITEM_HEIGHT - this.viewportHeight / 2 + ITEM_HEIGHT / 2;
			this.viewport.scrollTop = Math.max(0, targetScroll);
		}
	}

	/**
	 * Get the number of fonts in the current filtered view.
	 */
	get fontCount(): number {
		return this.filteredFonts.length;
	}

	/**
	 * Handle scroll events.
	 */
	private handleScroll = (): void => {
		this.scrollTop = this.viewport.scrollTop;
		this.render();
	};

	/**
	 * Render visible items.
	 */
	private render(): void {
		const totalHeight = this.filteredFonts.length * ITEM_HEIGHT;
		this.content.style.height = `${totalHeight}px`;

		// Calculate visible range
		const visibleCount = Math.ceil(this.viewportHeight / ITEM_HEIGHT);
		const startIndex = Math.max(0, Math.floor(this.scrollTop / ITEM_HEIGHT) - BUFFER_COUNT);
		const endIndex = Math.min(this.filteredFonts.length, startIndex + visibleCount + BUFFER_COUNT * 2);

		// Track which items are still needed
		const neededIndices = new Set<number>();
		for (let i = startIndex; i < endIndex; i += 1) {
			neededIndices.add(i);
		}

		// Remove items no longer in view
		for (const [index, element] of this.items) {
			if (!neededIndices.has(index)) {
				this.fontLoader.unobserve(element);
				element.remove();
				this.items.delete(index);
			}
		}

		// Add/update items in view
		for (let i = startIndex; i < endIndex; i += 1) {
			const font = this.filteredFonts[i];
			if (!font) {
				// Skip missing fonts (shouldn't happen, but guard against out-of-bounds)
				// eslint-disable-next-line no-continue
				continue;
			}

			let item = this.items.get(i);

			if (!item) {
				// Create new item
				item = this.createFontItem(font, i);
				this.content.appendChild(item);
				this.items.set(i, item);

				// Start observing for lazy font loading
				this.fontLoader.observe(item);

				// Update when font loads
				this.fontLoader.onLoad(font.displayName, () => {
					if (item) {
						item.classList.add("ss-font-item--loaded");
					}
				});
			} else {
				// Update position if needed
				const expectedTop = i * ITEM_HEIGHT;
				if (item.style.transform !== `translateY(${expectedTop}px)`) {
					item.style.transform = `translateY(${expectedTop}px)`;
				}

				// Update selected state
				const isSelected = font.filename === this.selectedFilename;
				item.classList.toggle("ss-font-item--selected", isSelected);
			}
		}
	}

	/**
	 * Create a font item element.
	 */
	private createFontItem(font: GoogleFont, index: number): HTMLElement {
		const item = document.createElement("div");
		item.className = "ss-font-item";
		item.dataset["fontFamily"] = font.displayName;
		item.dataset["index"] = String(index);
		item.style.transform = `translateY(${index * ITEM_HEIGHT}px)`;

		// Add loaded class if font is already loaded
		if (this.fontLoader.isLoaded(font.displayName)) {
			item.classList.add("ss-font-item--loaded");
		}

		// Add selected class
		if (font.filename === this.selectedFilename) {
			item.classList.add("ss-font-item--selected");
		}

		// Font name preview
		const name = document.createElement("span");
		name.className = "ss-font-item-name";
		name.textContent = font.displayName;
		name.style.fontFamily = `"${font.displayName}", system-ui, sans-serif`;
		item.appendChild(name);

		// Category badge (subtle)
		const category = document.createElement("span");
		category.className = "ss-font-item-category";
		category.textContent = this.formatCategory(font.category);
		item.appendChild(category);

		return item;
	}

	/**
	 * Format category for display.
	 */
	private formatCategory(category: string): string {
		switch (category) {
			case "sans-serif":
				return "Sans";
			case "serif":
				return "Serif";
			case "display":
				return "Display";
			case "handwriting":
				return "Script";
			case "monospace":
				return "Mono";
			default:
				return category;
		}
	}

	/**
	 * Clean up resources.
	 */
	destroy(): void {
		this.content.removeEventListener("click", this.handleContentClick);
		this.viewport.removeEventListener("scroll", this.handleScroll);
		this.resizeObserver.disconnect();

		for (const [, element] of this.items) {
			this.fontLoader.unobserve(element);
		}

		this.items.clear();
		this.viewport.remove();
	}
}
