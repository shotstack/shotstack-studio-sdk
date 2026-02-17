/**
 * Font Picker Component
 *
 * A refined, editorial-style font picker for the video editing SDK.
 * Features search, category filtering, recently used fonts, and
 * virtual scrolling for smooth performance with 200+ fonts.
 *
 * Trackpad scrolling works because the picker is mounted inside a
 * `.ss-toolbar-popup` ancestor, which is exempted from the canvas's
 * capturing wheel handler (shotstack-canvas.ts `onWheel`).
 */

import { GOOGLE_FONTS_BY_FILENAME, GOOGLE_FONTS_BY_NAME, type FontInfo, type GoogleFontCategory } from "../fonts/google-fonts";

import { getFontPreviewLoader } from "./font-preview-loader";
import { VirtualFontList } from "./virtual-font-list";

// Re-export for convenience
export type { FontInfo } from "../fonts/google-fonts";

/** LocalStorage key for recently used fonts */
const RECENT_FONTS_KEY = "ss-recent-fonts";

/** Maximum number of recent fonts to track */
const MAX_RECENT_FONTS = 6;

/** Icon fonts that should not appear in recently used (they don't render as text) */
const ICON_FONT_NAMES = new Set(["Material Icons", "Material Symbols Outlined", "Material Symbols Rounded", "Material Symbols Sharp"]);

/** Check if a font URL is from Google Fonts */
const isGoogleFont = (src: string): boolean => src.includes("fonts.gstatic.com");

/** Check if a font URL is a built-in Shotstack font */
const isBuiltInFont = (src: string): boolean => src.includes("templates.shotstack.io");

/** Check if a font URL is a custom font (not Google or built-in) */
const isCustomFont = (src: string): boolean => !isGoogleFont(src) && !isBuiltInFont(src);

/** Extract display name from a font URL */
const extractFontDisplayName = (url: string): string => {
	const filename = url.split("/").pop() ?? "";
	const withoutExtension = filename.replace(/\.(ttf|otf|woff|woff2)$/i, "");
	// Remove weight suffixes like -Bold, -Regular, etc.
	const baseFamily = withoutExtension.replace(/-(Bold|Light|Regular|Italic|Medium|SemiBold|Black|Thin|ExtraLight|ExtraBold|Heavy)$/i, "");
	return baseFamily;
};

export interface FontPickerOptions {
	/** Currently selected font filename */
	selectedFilename?: string;
	/** Callback when a font is selected */
	onSelect?: (font: FontInfo) => void;
	/** Callback when picker is closed */
	onClose?: () => void;
	/** Timeline fonts for detecting custom fonts */
	timelineFonts?: Array<{ src: string }>;
	/** Font metadata from binary parsing (URL → family name) */
	fontMetadata?: ReadonlyMap<string, { baseFamilyName: string; weight: number }>;
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
	private customSection: HTMLElement;
	private customDivider: HTMLElement;
	private listContainer: HTMLElement;
	private virtualList: VirtualFontList;
	private selectedFilename?: string;
	private onSelect?: (font: FontInfo) => void;
	private onClose?: () => void;
	private activeCategory?: GoogleFontCategory;
	private searchQuery = "";
	private recentFonts: string[] = [];
	private timelineFonts: Array<{ src: string }> = [];
	private fontMetadata?: ReadonlyMap<string, { baseFamilyName: string; weight: number }>;
	private fontLoader = getFontPreviewLoader();

	constructor(options: FontPickerOptions) {
		this.selectedFilename = options.selectedFilename;
		this.onSelect = options.onSelect;
		this.onClose = options.onClose;
		this.timelineFonts = options.timelineFonts ?? [];
		this.fontMetadata = options.fontMetadata;

		this.loadRecentFonts();
		this.element = this.createElement();
		this.searchInput = this.element.querySelector(".ss-font-picker-search-input") as HTMLInputElement;
		this.categoryTabs = this.element.querySelector(".ss-font-picker-categories") as HTMLElement;
		this.recentSection = this.element.querySelector(".ss-font-picker-recent") as HTMLElement;
		this.customSection = this.element.querySelector(".ss-font-picker-custom") as HTMLElement;
		this.customDivider = this.element.querySelector(".ss-font-picker-custom-divider") as HTMLElement;
		this.listContainer = this.element.querySelector(".ss-font-picker-list") as HTMLElement;

		// Create virtual list
		this.virtualList = new VirtualFontList({
			container: this.listContainer,
			selectedFilename: this.selectedFilename,
			onSelect: font => this.handleFontSelect(font)
		});

		// Update sections
		this.updateRecentSection();
		this.updateCustomSection();

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
			<div class="ss-font-picker-custom"></div>
			<div class="ss-font-picker-custom-divider"></div>
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
		searchInput.addEventListener("keydown", e => {
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
		categoryButtons.forEach(button => {
			button.addEventListener("click", () => {
				const category = (button as HTMLElement).dataset["category"] as GoogleFontCategory | "";
				this.setCategory(category || undefined);

				// Update active state
				categoryButtons.forEach(b => b.classList.remove("ss-font-picker-category--active"));
				button.classList.add("ss-font-picker-category--active");
			});
		});

		// Prevent clicks from closing (handled by parent)
		picker.addEventListener("click", e => {
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

		// Hide sections when searching
		if (this.searchQuery) {
			this.recentSection.style.display = "none";
			this.customSection.style.display = "none";
			(this.element.querySelector(".ss-font-picker-divider") as HTMLElement).style.display = "none";
			this.customDivider.style.display = "none";
		} else {
			this.recentSection.style.display = "";
			(this.element.querySelector(".ss-font-picker-divider") as HTMLElement).style.display = "";
			// Re-evaluate custom section visibility
			this.updateCustomSection();
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
	private handleFontSelect(font: FontInfo): void {
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
		this.recentFonts = this.recentFonts.filter(f => f !== fontName);

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

		// Filter out icon fonts and fonts not found in the registry
		const validFonts = this.recentFonts
			.filter(fontName => !ICON_FONT_NAMES.has(fontName))
			.map(fontName => ({ fontName, font: GOOGLE_FONTS_BY_NAME.get(fontName) }))
			.filter((entry): entry is { fontName: string; font: FontInfo } => entry.font !== undefined);

		for (const { fontName, font } of validFonts) {
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
	 * Resolve the display name for a custom font URL.
	 * Prefers the binary-parsed family name from fontMetadata, falls back to URL filename extraction.
	 */
	private resolveCustomFontName(src: string): string {
		const name = this.fontMetadata?.get(src)?.baseFamilyName ?? extractFontDisplayName(src);
		return name.replace(/^["']+|["']+$/g, "");
	}

	/**
	 * Update the custom fonts section.
	 * Shows non-Google fonts from timeline.fonts.
	 */
	private updateCustomSection(): void {
		// Get custom fonts from timeline (non-Google, non-built-in)
		const customFonts = this.timelineFonts.filter(font => isCustomFont(font.src));

		// Hide section if no custom fonts
		if (customFonts.length === 0) {
			this.customSection.style.display = "none";
			this.customDivider.style.display = "none";
			return;
		}

		this.customSection.style.display = "";
		this.customDivider.style.display = "";

		this.customSection.innerHTML = `
			<div class="ss-font-picker-custom-label">Custom Fonts</div>
			<div class="ss-font-picker-custom-list"></div>
		`;

		const list = this.customSection.querySelector(".ss-font-picker-custom-list") as HTMLElement;

		for (const font of customFonts) {
			const displayName = this.resolveCustomFontName(font.src);
			const item = this.createCustomFontItem(font.src, displayName);
			list.appendChild(item);
		}
	}

	/**
	 * Create a custom font item element.
	 */
	private createCustomFontItem(src: string, displayName: string): HTMLElement {
		const item = document.createElement("div");
		item.className = "ss-font-picker-custom-item";
		item.dataset["fontSrc"] = src;

		// Font name preview (shows text in the font itself)
		const name = document.createElement("span");
		name.className = "ss-font-picker-custom-item-name";
		name.textContent = displayName;
		name.style.fontFamily = `"${displayName}", system-ui, sans-serif`;
		item.appendChild(name);

		// "Custom" badge
		const badge = document.createElement("span");
		badge.className = "ss-font-picker-custom-item-badge";
		badge.textContent = "Custom";
		item.appendChild(badge);

		// Check if this is the selected font
		if (this.selectedFilename && this.isMatchingCustomFont(src, this.selectedFilename)) {
			item.classList.add("ss-font-picker-custom-item--selected");
		}

		// Load font for preview
		this.loadCustomFontForPreview(src, displayName, item);

		// Click handler
		item.addEventListener("click", () => {
			this.handleCustomFontSelect(src, displayName);
		});

		return item;
	}

	/**
	 * Check if a font URL matches the selected filename.
	 */
	private isMatchingCustomFont(src: string, selectedFilename: string): boolean {
		const binaryName = this.fontMetadata?.get(src)?.baseFamilyName;
		if (binaryName && binaryName === selectedFilename) return true;

		const urlFilename =
			src
				.split("/")
				.pop()
				?.replace(/\.(ttf|otf|woff|woff2)$/i, "") ?? "";
		const displayName = extractFontDisplayName(src);
		return urlFilename === selectedFilename || displayName === selectedFilename;
	}

	/**
	 * Load a custom font for preview using the FontFace API.
	 */
	private async loadCustomFontForPreview(src: string, displayName: string, item: HTMLElement): Promise<void> {
		try {
			// Check if font is already loaded
			if (document.fonts.check(`16px "${displayName}"`)) {
				item.classList.add("ss-font-picker-custom-item--loaded");
				return;
			}

			// Load the font via FontFace API
			const fontFace = new FontFace(displayName, `url(${src})`, {
				weight: "400",
				style: "normal"
			});

			await fontFace.load();
			document.fonts.add(fontFace);
			item.classList.add("ss-font-picker-custom-item--loaded");
		} catch {
			// Failed to load - still show but without font preview
			item.classList.add("ss-font-picker-custom-item--loaded");
		}
	}

	/**
	 * Handle custom font selection.
	 */
	private handleCustomFontSelect(src: string, displayName: string): void {
		// Create a FontInfo object for consistency
		// Custom fonts are assumed to support variable weights (user controls the font file)
		const resolvedName = this.resolveCustomFontName(src);
		const customFont: FontInfo = {
			displayName,
			filename: resolvedName,
			category: "sans-serif", // Default category for custom fonts
			url: src,
			weight: 400,
			isVariable: true
		};

		this.selectedFilename = customFont.filename;
		// Don't add to recent fonts (custom fonts are already special)
		this.onSelect?.(customFont);
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
 * Get a FontInfo by its filename.
 */
export function getFontByFilename(filename: string): FontInfo | undefined {
	return GOOGLE_FONTS_BY_FILENAME.get(filename);
}

/**
 * Get a FontInfo by its display name.
 */
export function getFontByName(name: string): FontInfo | undefined {
	return GOOGLE_FONTS_BY_NAME.get(name);
}
