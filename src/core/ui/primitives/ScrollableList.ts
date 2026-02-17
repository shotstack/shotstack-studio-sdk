import type { ScrollableListConfig, ScrollableListGroup, ScrollableListItem } from "./types";
import { UIComponent } from "./UIComponent";

/**
 * A scrollable grouped list component.
 *
 * Uses a three-layer DOM structure for reliable scroll containment:
 *
 *   .ss-scrollable-list       (height: Npx, overflow: hidden, flex column)
 *     .ss-scrollable-list-body    (flex: 1, min-height: 0, overflow: hidden)
 *       .ss-scrollable-list-viewport (height: 100%, overflow-y: auto)
 *
 * **Trackpad scrolling note:** The canvas has a capturing wheel handler
 * (shotstack-canvas.ts `onWheel`) that calls `preventDefault()` for zoom/pan.
 * For trackpad scrolling to work, the popup ancestor must use a CSS class
 * exempted in that handler (e.g. `.ss-toolbar-popup`, `.ss-media-toolbar-popup`).
 */
export class ScrollableList extends UIComponent<string> {
	private viewport: HTMLElement | null = null;
	private selectedValue: string | undefined;
	private groups: ScrollableListGroup[];
	private height: number;

	constructor(private listConfig: ScrollableListConfig) {
		super({ className: "ss-scrollable-list", ...listConfig });
		this.groups = listConfig.groups;
		this.height = listConfig.height ?? 300;
		this.selectedValue = listConfig.selectedValue;
	}

	override mount(parent: HTMLElement): void {
		super.mount(parent);
		// Set definite height on the container (NOT max-height)
		if (this.container) {
			this.container.style.height = `${this.height}px`;
		}
	}

	render(): string {
		return `
			<div class="ss-scrollable-list-body">
				<div class="ss-scrollable-list-viewport">
					${this.renderGroups()}
				</div>
			</div>
		`;
	}

	private renderGroups(): string {
		return this.groups
			.map(
				group => `
			<div class="ss-scrollable-list-group">
				<div class="ss-scrollable-list-group-header">
					<span>${group.header}</span>
					${group.headerDetail ? `<span class="ss-scrollable-list-group-detail">${group.headerDetail}</span>` : ""}
				</div>
				${group.items.map(item => this.renderItem(item)).join("")}
			</div>
		`
			)
			.join("");
	}

	private renderItem(item: ScrollableListItem): string {
		const selected = item.value === this.selectedValue ? " ss-scrollable-list-item--selected" : "";
		const dataAttrs = item.data
			? Object.entries(item.data)
					.map(([k, v]) => ` data-${k}="${v}"`)
					.join("")
			: "";
		return `<div class="ss-scrollable-list-item${selected}" data-value="${item.value}"${dataAttrs}>${item.label}</div>`;
	}

	protected bindElements(): void {
		this.viewport = this.container?.querySelector(".ss-scrollable-list-viewport") ?? null;
	}

	protected setupEvents(): void {
		// Event delegation: single click listener on the viewport
		this.events.on(this.viewport, "click", (e: MouseEvent) => {
			const item = (e.target as HTMLElement).closest<HTMLElement>(".ss-scrollable-list-item");
			if (!item) return;

			const { value } = item.dataset;
			if (value !== undefined) {
				this.setSelected(value);
				this.emit(value);
			}
		});
	}

	/**
	 * Update the selected value and visual state.
	 */
	setSelected(value: string | undefined): void {
		this.selectedValue = value;

		if (!this.viewport) return;

		// Remove previous selection
		const prev = this.viewport.querySelector(".ss-scrollable-list-item--selected");
		prev?.classList.remove("ss-scrollable-list-item--selected");

		// Apply new selection
		if (value !== undefined) {
			const next = this.viewport.querySelector(`[data-value="${CSS.escape(value)}"]`);
			next?.classList.add("ss-scrollable-list-item--selected");
		}
	}

	/**
	 * Scroll the selected item into view.
	 */
	scrollToSelected(): void {
		if (!this.viewport || this.selectedValue === undefined) return;

		const item = this.viewport.querySelector(`[data-value="${CSS.escape(this.selectedValue)}"]`);
		item?.scrollIntoView({ block: "center" });
	}

	/**
	 * Get the data attributes of the currently selected item.
	 */
	getSelectedData(): Record<string, string> | undefined {
		if (!this.viewport || this.selectedValue === undefined) return undefined;

		const item = this.viewport.querySelector<HTMLElement>(`[data-value="${CSS.escape(this.selectedValue)}"]`);
		if (!item) return undefined;

		const data: Record<string, string> = {};
		for (const key of Object.keys(item.dataset)) {
			if (key !== "value") {
				data[key] = item.dataset[key]!;
			}
		}
		return data;
	}
}
