/**
 * Font Picker Component
 *
 * A refined, editorial-style font picker for the video editing SDK.
 * Features search, category filtering, recently used fonts, and
 * virtual scrolling for smooth performance with 200+ fonts.
 */

import {
	GOOGLE_FONTS,
	GOOGLE_FONTS_BY_FILENAME,
	GOOGLE_FONTS_BY_NAME,
	GOOGLE_FONT_CATEGORIES,
	type GoogleFont,
	type GoogleFontCategory
} from "../fonts/google-fonts";

// Re-export for convenience
export type { GoogleFont } from "../fonts/google-fonts";
import { VirtualFontList } from "./virtual-font-list";
import { getFontPreviewLoader } from "./font-preview-loader";

/** LocalStorage key for recently used fonts */
const RECENT_FONTS_KEY = "ss-recent-fonts";

/** Maximum number of recent fonts to track */
const MAX_RECENT_FONTS = 6;

/** Icon fonts that should not appear in recently used (they don't render as text) */
const ICON_FONT_NAMES = new Set([
	"Material Icons",
	"Material Symbols Outlined",
	"Material Symbols Rounded",
	"Material Symbols Sharp"
]);

export interface FontPickerOptions {
	/** Currently selected font filename */
	selectedFilename?: string;
	/** Callback when a font is selected */
	onSelect?: (font: GoogleFont) => void;
	/** Callback when picker is closed */
	onClose?: () => void;
}

/**
 * Font Picker UI component.
 * Renders a dropdown with search, categories, and scrollable font list.
 */
export class FontPicker {
	private element: HTMLElement;
	private searchInput: HTMLInputElement;
	private categoryTabs: HTMLElement;
	private recentSection: HTMLElement;
	private listContainer: HTMLElement;
	private virtualList: VirtualFontList;
	private selectedFilename?: string;
	private onSelect?: (font: GoogleFont) => void;
	private onClose?: () => void;
	private activeCategory?: GoogleFontCategory;
	private searchQuery = "";
	private recentFonts: string[] = [];
	private fontLoader = getFontPreviewLoader();

	constructor(options: FontPickerOptions) {
		this.selectedFilename = options.selectedFilename;
		this.onSelect = options.onSelect;
		this.onClose = options.onClose;

		this.loadRecentFonts();
		this.element = this.createElement();
		this.searchInput = this.element.querySelector(".ss-font-picker-search-input") as HTMLInputElement;
		this.categoryTabs = this.element.querySelector(".ss-font-picker-categories") as HTMLElement;
		this.recentSection = this.element.querySelector(".ss-font-picker-recent") as HTMLElement;
		this.listContainer = this.element.querySelector(".ss-font-picker-list") as HTMLElement;

		// Create virtual list
		this.virtualList = new VirtualFontList({
			container: this.listContainer,
			selectedFilename: this.selectedFilename,
			onSelect: (font) => this.handleFontSelect(font)
		});

		// Update recent section
		this.updateRecentSection();

		// Focus search on open
		requestAnimationFrame(() => {
			this.searchInput.focus();
		});
	}

	/**
	 * Get the picker element for mounting.
	 */
	getElement(): HTMLElement {
		return this.element;
	}

	/**
	 * Set the currently selected font.
	 */
	setSelected(filename?: string): void {
		this.selectedFilename = filename;
		this.virtualList.setSelected(filename);

		if (filename) {
			this.virtualList.scrollToFont(filename);
		}
	}

	/**
	 * Create the picker DOM structure.
	 */
	private createElement(): HTMLElement {
		const picker = document.createElement("div");
		picker.className = "ss-font-picker";

		picker.innerHTML = `
			<div class="ss-font-picker-header">
				<div class="ss-font-picker-search">
					<svg class="ss-font-picker-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="11" cy="11" r="8"/>
						<path d="M21 21l-4.35-4.35"/>
					</svg>
					<input
						type="text"
						class="ss-font-picker-search-input"
						placeholder="Search fonts..."
						spellcheck="false"
						autocomplete="off"
					/>
				</div>
				<div class="ss-font-picker-categories">
					<button class="ss-font-picker-category ss-font-picker-category--active" data-category="">All</button>
					<button class="ss-font-picker-category" data-category="sans-serif">Sans</button>
					<button class="ss-font-picker-category" data-category="serif">Serif</button>
					<button class="ss-font-picker-category" data-category="display">Display</button>
					<button class="ss-font-picker-category" data-category="handwriting">Script</button>
					<button class="ss-font-picker-category" data-category="monospace">Mono</button>
				</div>
			</div>
			<div class="ss-font-picker-recent"></div>
			<div class="ss-font-picker-divider"></div>
			<div class="ss-font-picker-list"></div>
			<div class="ss-font-picker-footer">
				<span class="ss-font-picker-count"></span>
			</div>
		`;

		// Bind events
		this.bindEvents(picker);

		return picker;
	}

	/**
	 * Bind event listeners.
	 */
	private bindEvents(picker: HTMLElement): void {
		// Search input
		const searchInput = picker.querySelector(".ss-font-picker-search-input") as HTMLInputElement;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.applyFilter();
		});

		// Clear search on escape
		searchInput.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				if (this.searchQuery) {
					this.searchQuery = "";
					searchInput.value = "";
					this.applyFilter();
				} else {
					this.onClose?.();
				}
			}
		});

		// Category tabs
		const categoryButtons = picker.querySelectorAll(".ss-font-picker-category");
		categoryButtons.forEach((button) => {
			button.addEventListener("click", () => {
				const category = (button as HTMLElement).dataset["category"] as GoogleFontCategory | "";
				this.setCategory(category || undefined);

				// Update active state
				categoryButtons.forEach((b) => b.classList.remove("ss-font-picker-category--active"));
				button.classList.add("ss-font-picker-category--active");
			});
		});

		// Prevent clicks from closing (handled by parent)
		picker.addEventListener("click", (e) => {
			e.stopPropagation();
		});
	}

	/**
	 * Set the active category filter.
	 */
	private setCategory(category?: GoogleFontCategory): void {
		this.activeCategory = category;
		this.applyFilter();
	}

	/**
	 * Apply current search and category filters.
	 */
	private applyFilter(): void {
		this.virtualList.setFilter(this.searchQuery, this.activeCategory);
		this.updateFooter();

		// Hide recent section when searching
		if (this.searchQuery) {
			this.recentSection.style.display = "none";
			(this.element.querySelector(".ss-font-picker-divider") as HTMLElement).style.display = "none";
		} else {
			this.recentSection.style.display = "";
			(this.element.querySelector(".ss-font-picker-divider") as HTMLElement).style.display = "";
		}
	}

	/**
	 * Update the footer with font count.
	 */
	private updateFooter(): void {
		const count = this.virtualList.fontCount;
		const footer = this.element.querySelector(".ss-font-picker-count") as HTMLElement;
		footer.textContent = `${count} font${count !== 1 ? "s" : ""}`;
	}

	/**
	 * Handle font selection.
	 */
	private handleFontSelect(font: GoogleFont): void {
		this.selectedFilename = font.filename;
		this.addToRecentFonts(font.displayName);
		this.onSelect?.(font);
	}

	/**
	 * Load recently used fonts from localStorage.
	 */
	private loadRecentFonts(): void {
		try {
			const stored = localStorage.getItem(RECENT_FONTS_KEY);
			if (stored) {
				this.recentFonts = JSON.parse(stored);
			}
		} catch {
			this.recentFonts = [];
		}
	}

	/**
	 * Add a font to the recently used list.
	 */
	private addToRecentFonts(fontName: string): void {
		// Don't track icon fonts - they don't render as text
		if (ICON_FONT_NAMES.has(fontName)) return;

		// Remove if already exists
		this.recentFonts = this.recentFonts.filter((f) => f !== fontName);

		// Add to front
		this.recentFonts.unshift(fontName);

		// Limit size
		if (this.recentFonts.length > MAX_RECENT_FONTS) {
			this.recentFonts = this.recentFonts.slice(0, MAX_RECENT_FONTS);
		}

		// Save to localStorage
		try {
			localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(this.recentFonts));
		} catch {
			// Ignore storage errors
		}

		// Update UI
		this.updateRecentSection();
	}

	/**
	 * Update the recently used fonts section.
	 */
	private updateRecentSection(): void {
		if (this.recentFonts.length === 0) {
			this.recentSection.style.display = "none";
			(this.element.querySelector(".ss-font-picker-divider") as HTMLElement).style.display = "none";
			return;
		}

		this.recentSection.style.display = "";
		(this.element.querySelector(".ss-font-picker-divider") as HTMLElement).style.display = "";

		this.recentSection.innerHTML = `
			<div class="ss-font-picker-recent-label">Recently Used</div>
			<div class="ss-font-picker-recent-list"></div>
		`;

		const list = this.recentSection.querySelector(".ss-font-picker-recent-list") as HTMLElement;

		for (const fontName of this.recentFonts) {
			// Skip icon fonts - they don't render as text
			if (ICON_FONT_NAMES.has(fontName)) continue;

			const font = GOOGLE_FONTS_BY_NAME.get(fontName);
			if (!font) continue;

			const chip = document.createElement("button");
			chip.className = "ss-font-picker-recent-chip";
			chip.style.fontFamily = `"${fontName}", system-ui, sans-serif`;
			chip.textContent = fontName;

			if (font.filename === this.selectedFilename) {
				chip.classList.add("ss-font-picker-recent-chip--selected");
			}

			// Preload the font for preview
			this.fontLoader.preload(fontName);

			// Add loaded class when font loads
			this.fontLoader.onLoad(fontName, () => {
				chip.classList.add("ss-font-picker-recent-chip--loaded");
			});

			chip.addEventListener("click", () => {
				this.handleFontSelect(font);
			});

			list.appendChild(chip);
		}
	}

	/**
	 * Clean up resources.
	 */
	destroy(): void {
		this.virtualList.destroy();
		this.element.remove();
	}
}

/**
 * Get the display name for a font filename.
 * Used to show human-readable name in the toolbar.
 */
export function getFontDisplayName(filename: string): string {
	const font = GOOGLE_FONTS_BY_FILENAME.get(filename);
	return font?.displayName ?? filename;
}

/**
 * Get a GoogleFont by its filename.
 */
export function getFontByFilename(filename: string): GoogleFont | undefined {
	return GOOGLE_FONTS_BY_FILENAME.get(filename);
}

/**
 * Get a GoogleFont by its display name.
 */
export function getFontByName(name: string): GoogleFont | undefined {
	return GOOGLE_FONTS_BY_NAME.get(name);
}
