import type { Edit } from "@core/edit";

/** Preset font sizes used by text toolbars */
export const FONT_SIZES = [6, 8, 10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96, 128];

/** Built-in font families */
export const BUILT_IN_FONTS = [
	"Arapey",
	"Clear Sans",
	"Didact Gothic",
	"Montserrat",
	"MovLette",
	"Open Sans",
	"Permanent Marker",
	"Roboto",
	"Sue Ellen Francisco",
	"Work Sans"
];

/** Shared SVG icon paths for toolbars */
export const TOOLBAR_ICONS = {
	alignLeft: `<path d="M3 5h12v2H3V5zm0 4h18v2H3V9zm0 4h12v2H3v-2zm0 4h18v2H3v-2z"/>`,
	alignCenter: `<path d="M3 5h18v2H3V5zm3 4h12v2H6V9zm-3 4h18v2H3v-2zm3 4h12v2H6v-2z"/>`,
	alignRight: `<path d="M9 5h12v2H9V5zm-6 4h18v2H3V9zm6 4h12v2H9v-2zm-6 4h18v2H3v-2z"/>`,
	anchorTop: `<line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 5 19 12"/>`,
	anchorMiddle: `<line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 9 12 5 19 9"/><polyline points="5 15 12 19 19 15"/>`,
	anchorBottom: `<line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/>`,
	sizeUp: `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
	sizeDown: `<line x1="5" y1="12" x2="19" y2="12"/>`,
	spacing: `<path d="M17.952 15.75a.75.75 0 0 1 .535.238l2.147 2.146a1.255 1.255 0 0 1 0 1.77l-2.147 2.145a.75.75 0 0 1-1.06-1.06l1.22-1.22H5.352l1.22 1.22a.753.753 0 0 1 .019 1.078.752.752 0 0 1-1.08-.018l-2.146-2.146a1.255 1.255 0 0 1-.342-.64 1.253 1.253 0 0 1-.02-.225L3 19.018c0-.02.002-.041.004-.062a1.25 1.25 0 0 1 .09-.416 1.25 1.25 0 0 1 .27-.406l2.147-2.146a.751.751 0 0 1 1.279.53c0 .2-.08.39-.22.53l-1.22 1.22h13.298l-1.22-1.22a.752.752 0 0 1-.02-1.078.752.752 0 0 1 .544-.22ZM15.854 3c.725 0 1.313.588 1.313 1.313v1.31a.782.782 0 0 1-1.563 0v-.956a.104.104 0 0 0-.104-.104l-2.754.005.007 8.245c0 .252.206.457.459.457h.996a.782.782 0 0 1 0 1.563H9.736a.781.781 0 0 1 0-1.563h.996a.458.458 0 0 0 .458-.457l-.006-8.245-2.767-.005a.104.104 0 0 0-.104.104v.976a.781.781 0 0 1-1.563 0v-1.33C6.75 3.587 7.338 3 8.063 3h7.791Z"/>`,
	fontColor: `<path d="M4 20h16"/><path d="M12 4l6 12H6L12 4z" fill="currentColor"/>`,
	background: `<path d="M462.089,151.673h-88.967c2.115,10.658,2.743,21.353,1.806,31.918h85.05v247.93H212.051v-59.488l-11.615,11.609 c-5.921,5.733-12.882,10.113-20.304,13.591v36.4c0,16.423,13.363,29.79,29.791,29.79h252.166c16.425,0,29.79-13.367,29.79-29.79 V181.467C491.879,165.039,478.514,151.673,462.089,151.673z"/><path d="M333.156,201.627c-1.527-3.799-0.837-6.296,0.225-10.065c0.311-1.124,0.613-2.205,0.855-3.3 c3.189-14.43,1.178-31.357-5.57-46.378c-8.859-19.715-24.563-41.406-44.258-61.103c-32.759-32.773-67.686-52.324-93.457-52.324 c-9.418,0-16.406,2.624-21.658,6.136L9.937,192.753c-26.248,27.201,3.542,81.343,42.343,120.142 c32.738,32.738,67.667,52.289,93.419,52.289c13.563,0,22.081-5.506,26.943-10.192l109.896-109.863 c-0.998,3.653-1.478,6.683-1.478,9.243c0,20.097,16.359,36.459,36.475,36.459c20.115,0,36.494-16.362,36.494-36.459 C354.029,250.907,354.029,240.375,333.156,201.627z"/>`,
	stroke: `<rect x="5" y="5" width="14" height="14" rx="2"/>`,
	edit: `<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>`,
	chevron: `<path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
	transition: `<path d="M12 3v18"/><path d="M5 12H2l3-3 3 3H5"/><path d="M19 12h3l-3 3-3-3h3"/>`,
	effect: `<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M1 12h4M19 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>`
};

/**
 * Abstract base class for toolbars providing shared lifecycle, popup management,
 * and UI helper methods.
 */
export abstract class BaseToolbar {
	protected container: HTMLDivElement | null = null;
	protected edit: Edit;
	protected selectedTrackIdx = -1;
	protected selectedClipIdx = -1;
	protected clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

	constructor(edit: Edit) {
		this.edit = edit;
	}

	/**
	 * Mount the toolbar to a parent element.
	 * Subclasses must implement to build their specific HTML structure.
	 */
	abstract mount(parent: HTMLElement): void;

	/**
	 * Show the toolbar for a specific clip.
	 * Subclasses can override to add custom behavior.
	 */
	show(trackIndex: number, clipIndex: number): void {
		this.selectedTrackIdx = trackIndex;
		this.selectedClipIdx = clipIndex;
		this.syncState();
		if (this.container) {
			this.container.classList.add("visible");
			this.container.style.display = ""; // Clear inline style, let CSS control
		}
	}

	/**
	 * Hide the toolbar.
	 */
	hide(): void {
		if (this.container) {
			this.container.classList.remove("visible");
			this.container.style.display = ""; // Clear inline style, let CSS control
		}
		this.closeAllPopups();
		this.selectedTrackIdx = -1;
		this.selectedClipIdx = -1;
	}

	/**
	 * Dispose the toolbar and clean up resources.
	 * Subclasses should call super.dispose() and then null their own references.
	 */
	dispose(): void {
		if (this.clickOutsideHandler) {
			document.removeEventListener("click", this.clickOutsideHandler);
			this.clickOutsideHandler = null;
		}

		this.container?.remove();
		this.container = null;
	}

	/**
	 * Check if a popup is currently visible (handles both CSS class and inline style patterns).
	 */
	protected isPopupOpen(popup: HTMLElement | null): boolean {
		if (!popup) return false;
		return popup.classList.contains("visible") || popup.style.display === "block";
	}

	/**
	 * Toggle a popup's visibility, closing all others first.
	 * Uses CSS class-based visibility. Optional callback fires when popup opens.
	 */
	protected togglePopup(popup: HTMLElement | null, onOpen?: () => void): void {
		const isOpen = this.isPopupOpen(popup);

		this.closeAllPopups();

		if (!isOpen && popup) {
			popup.classList.add("visible");
			popup.style.display = ""; // eslint-disable-line no-param-reassign -- Clear inline style, let CSS control
			onOpen?.();
		}
	}

	/**
	 * Close all popups.
	 * Uses CSS class-based visibility.
	 */
	protected closeAllPopups(): void {
		for (const popup of this.getPopupList()) {
			if (popup) {
				popup.classList.remove("visible");
				popup.style.display = ""; // Clear inline style, let CSS control
			}
		}
	}

	/**
	 * Set up a document click handler to close popups when clicking outside.
	 */
	protected setupOutsideClickHandler(): void {
		this.clickOutsideHandler = (e: MouseEvent) => {
			if (!this.container?.contains(e.target as Node)) {
				this.closeAllPopups();
			}
		};
		document.addEventListener("click", this.clickOutsideHandler);
	}

	/**
	 * Create a slider input handler with value display update.
	 */
	protected createSliderHandler(
		slider: HTMLInputElement | null,
		valueDisplay: HTMLSpanElement | null,
		callback: (value: number) => void,
		formatter: (value: number) => string = String
	): void {
		slider?.addEventListener("input", e => {
			const val = parseFloat((e.target as HTMLInputElement).value);
			if (valueDisplay) {
				Object.assign(valueDisplay, { textContent: formatter(val) });
			}
			callback(val);
		});
	}

	/**
	 * Set active state on a button element.
	 */
	protected setButtonActive(btn: HTMLElement | null, active: boolean): void {
		btn?.classList.toggle("active", active);
	}

	/**
	 * Sync UI state with current clip configuration.
	 * Subclasses must implement.
	 */
	protected abstract syncState(): void;

	/**
	 * Get the list of popup elements for popup management.
	 * Subclasses must implement.
	 */
	protected abstract getPopupList(): (HTMLElement | null)[];
}
