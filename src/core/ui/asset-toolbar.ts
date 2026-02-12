import { injectShotstackStyles } from "@styles/inject";

import { makeToolbarDraggable, type ToolbarDragHandle, type ToolbarDragState } from "./toolbar-drag";
import type { UIController } from "./ui-controller";

export class AssetToolbar {
	private container: HTMLDivElement | null = null;
	private buttonsContainer: HTMLDivElement | null = null;
	private ui: UIController;
	private unsubscribe: (() => void) | null = null;
	private dragResult: ToolbarDragHandle | null = null;

	constructor(ui: UIController) {
		this.ui = ui;
		injectShotstackStyles();
	}

	/** @internal */
	getDragState(): ToolbarDragState | null {
		return this.dragResult?.getState() ?? null;
	}

	/** @internal */
	setPosition(screenX: number, screenY: number): void {
		if (this.container) {
			this.container.style.left = `${screenX}px`;
			this.container.style.top = `${screenY}px`;
		}
	}

	mount(parent: HTMLElement, options?: { onDragReset?: () => void }): void {
		this.container?.remove();

		this.container = document.createElement("div");
		this.container.className = "ss-asset-toolbar";

		// Create a dedicated wrapper for buttons so render() doesn't destroy the drag handle
		this.buttonsContainer = document.createElement("div");
		this.buttonsContainer.className = "ss-asset-toolbar-buttons";
		this.container.appendChild(this.buttonsContainer);

		this.render();

		parent.appendChild(this.container);

		// Wire up drag (handle prepended automatically)
		if (options?.onDragReset) {
			this.dragResult = makeToolbarDraggable({
				container: this.container,
				onReset: options.onDragReset
			});
		}

		// Listen to UIController for button changes
		this.unsubscribe = this.ui.onButtonsChanged(() => this.render());
	}

	private render(): void {
		if (!this.container || !this.buttonsContainer) return;

		const buttons = this.ui.getButtons();

		// Hide toolbar if no buttons registered
		this.container.style.display = buttons.length === 0 ? "none" : "flex";

		this.buttonsContainer.innerHTML = buttons
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
		this.buttonsContainer?.querySelectorAll("[data-button-id]").forEach(btn => {
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
		this.dragResult?.dispose();
		this.dragResult = null;
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.container?.remove();
		this.container = null;
		this.buttonsContainer = null;
	}
}
