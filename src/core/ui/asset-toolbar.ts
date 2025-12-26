import { injectShotstackStyles } from "@styles/inject";

import type { UIController } from "./ui-controller";

export class AssetToolbar {
	private container: HTMLDivElement | null = null;
	private ui: UIController;
	private padding = 12;
	private unsubscribe: (() => void) | null = null;

	constructor(ui: UIController) {
		this.ui = ui;
		injectShotstackStyles();
	}

	setPosition(leftOffset: number): void {
		if (this.container) {
			this.container.style.left = `${Math.max(this.padding, leftOffset - 48 - this.padding)}px`;
		}
	}

	mount(parent: HTMLElement): void {
		this.container?.remove();

		this.container = document.createElement("div");
		this.container.className = "ss-asset-toolbar";

		this.render();

		parent.appendChild(this.container);

		// Listen to UIController for button changes
		this.unsubscribe = this.ui.onButtonsChanged(() => this.render());
	}

	private render(): void {
		if (!this.container) return;

		const buttons = this.ui.getButtons();

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
				if (id) {
					// Emit button click through UIController
					this.ui.emitButtonClick(id);
				}
			});
		});
	}

	dispose(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.container?.remove();
		this.container = null;
	}
}
