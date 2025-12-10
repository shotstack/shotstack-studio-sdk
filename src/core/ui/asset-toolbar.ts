import type { Edit } from "@core/edit";

import { ASSET_TOOLBAR_STYLES } from "./asset-toolbar.css";

export class AssetToolbar {
	private container: HTMLDivElement | null = null;
	private styleElement: HTMLStyleElement | null = null;
	private edit: Edit;
	private padding = 12;

	constructor(edit: Edit) {
		this.edit = edit;
		this.injectStyles();
	}

	setPosition(leftOffset: number): void {
		if (this.container) {
			this.container.style.left = `${Math.max(this.padding, leftOffset - 48 - this.padding)}px`;
		}
	}

	private injectStyles(): void {
		if (document.getElementById("ss-asset-toolbar-styles")) return;

		this.styleElement = document.createElement("style");
		this.styleElement.id = "ss-asset-toolbar-styles";
		this.styleElement.textContent = ASSET_TOOLBAR_STYLES;
		document.head.appendChild(this.styleElement);
	}

	mount(parent: HTMLElement): void {
		this.container = document.createElement("div");
		this.container.className = "ss-asset-toolbar";

		this.render();

		parent.appendChild(this.container);

		this.edit.events.on("toolbar:buttons:changed", () => this.render());
	}

	private render(): void {
		if (!this.container) return;

		const buttons = this.edit.getToolbarButtons();

		// Hide toolbar if no buttons registered
		this.container.style.display = buttons.length === 0 ? "none" : "flex";

		this.container.innerHTML = buttons
			.map(
				btn => `
			${btn.dividerBefore ? '<div class="ss-asset-toolbar-divider"></div>' : ""}
			<button class="ss-asset-toolbar-btn" data-button-id="${btn.id}" data-tooltip="${btn.tooltip}">
				${btn.icon}
			</button>
		`
			)
			.join("");

		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this.container?.querySelectorAll("[data-button-id]").forEach(btn => {
			btn.addEventListener("click", () => {
				const id = (btn as HTMLElement).dataset["buttonId"];
				const config = this.edit.getToolbarButtons().find(b => b.id === id);
				if (!config) return;

				const selectedClip = this.edit.getSelectedClipInfo();
				this.edit.events.emit(config.event, {
					position: this.edit.playbackTime,
					selectedClip: selectedClip ? { trackIndex: selectedClip.trackIndex, clipIndex: selectedClip.clipIndex } : null
				});
			});
		});
	}

	dispose(): void {
		this.container?.remove();
		this.container = null;
	}
}
