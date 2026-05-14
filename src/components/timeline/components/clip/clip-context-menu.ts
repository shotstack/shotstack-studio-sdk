import type { Edit } from "@core/edit-session";
import { DELETE_DISABLED_REASON, TOOLBAR_ICONS } from "@core/ui/base-toolbar";

interface OpenState {
	menu: HTMLElement;
	trackIndex: number;
	clipIndex: number;
}

/**
 * Right-click context menu for timeline clips.
 */
export class ClipContextMenu {
	private open: OpenState | null = null;
	private readonly handleContextMenu: (e: MouseEvent) => void;
	private readonly handleDocumentPointerDown: (e: PointerEvent) => void;
	private readonly handleKeyDown: (e: KeyboardEvent) => void;
	private readonly handleScroll: () => void;
	private readonly handleResize: () => void;

	constructor(
		private readonly edit: Edit,
		private readonly tracksContainer: HTMLElement
	) {
		this.handleContextMenu = this.onContextMenu.bind(this);
		this.handleDocumentPointerDown = this.onDocumentPointerDown.bind(this);
		this.handleKeyDown = this.onKeyDown.bind(this);
		this.handleScroll = () => this.hide();
		this.handleResize = () => this.hide();
	}

	mount(): void {
		this.tracksContainer.addEventListener("contextmenu", this.handleContextMenu);
	}

	dispose(): void {
		this.tracksContainer.removeEventListener("contextmenu", this.handleContextMenu);
		this.hide();
	}

	/**
	 * Open the menu programmatically near the given screen coordinates.
	 */
	showAt(clientX: number, clientY: number, trackIndex: number, clipIndex: number): void {
		if (this.open && this.open.trackIndex === trackIndex && this.open.clipIndex === clipIndex) {
			this.hide();
			return;
		}
		this.show(clientX, clientY, trackIndex, clipIndex);
	}

	private onContextMenu(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		const clipEl = target.closest<HTMLElement>(".ss-clip");
		if (!clipEl) return;

		const trackIndexAttr = clipEl.dataset["trackIndex"];
		const clipIndexAttr = clipEl.dataset["clipIndex"];
		if (trackIndexAttr === undefined || clipIndexAttr === undefined) return;

		e.preventDefault();
		this.show(e.clientX, e.clientY, parseInt(trackIndexAttr, 10), parseInt(clipIndexAttr, 10));
	}

	private show(clientX: number, clientY: number, trackIndex: number, clipIndex: number): void {
		this.hide();

		const canDelete = this.edit.canDeleteClip(trackIndex, clipIndex);

		const menu = document.createElement("div");
		menu.className = "ss-clip-context-menu";
		menu.setAttribute("role", "menu");

		const deleteBtn = document.createElement("button");
		deleteBtn.type = "button";
		deleteBtn.className = "ss-clip-context-menu-item ss-clip-context-menu-item--danger";
		deleteBtn.setAttribute("role", "menuitem");
		deleteBtn.dataset["action"] = "delete";
		deleteBtn.disabled = !canDelete;
		if (!canDelete) deleteBtn.title = DELETE_DISABLED_REASON;
		deleteBtn.innerHTML = `<svg class="ss-clip-context-menu-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TOOLBAR_ICONS.trash}</svg><span class="ss-clip-context-menu-label">Delete</span><span class="ss-clip-context-menu-shortcut">Del</span>`;

		deleteBtn.addEventListener("click", () => {
			this.hide();
			this.edit.deleteClip(trackIndex, clipIndex).catch(err => {
				console.warn("[shotstack-studio:clip-context-menu] deleteClip failed", err);
			});
		});

		menu.appendChild(deleteBtn);
		document.body.appendChild(menu);
		this.open = { menu, trackIndex, clipIndex };

		this.positionWithinViewport(clientX, clientY);

		document.addEventListener("pointerdown", this.handleDocumentPointerDown);
		document.addEventListener("keydown", this.handleKeyDown);
		this.tracksContainer.addEventListener("scroll", this.handleScroll, true);
		window.addEventListener("resize", this.handleResize);
	}

	private hide(): void {
		if (!this.open) return;
		this.open.menu.remove();
		this.open = null;
		document.removeEventListener("pointerdown", this.handleDocumentPointerDown);
		document.removeEventListener("keydown", this.handleKeyDown);
		this.tracksContainer.removeEventListener("scroll", this.handleScroll, true);
		window.removeEventListener("resize", this.handleResize);
	}

	private onDocumentPointerDown(e: PointerEvent): void {
		if (!this.open) return;
		if (!this.open.menu.contains(e.target as Node)) {
			this.hide();
		}
	}

	private onKeyDown(e: KeyboardEvent): void {
		if (e.key === "Escape") {
			e.preventDefault();
			this.hide();
		}
	}

	/**
	 * Place the menu near the cursor, clamped to the viewport so it never
	 * spills off-screen near the right or bottom edge.
	 */
	private positionWithinViewport(clientX: number, clientY: number): void {
		if (!this.open) return;
		const { menu } = this.open;
		menu.style.left = "0px";
		menu.style.top = "0px";
		menu.style.visibility = "hidden";

		const { offsetWidth, offsetHeight } = menu;
		const margin = 4;
		const maxX = window.innerWidth - offsetWidth - margin;
		const maxY = window.innerHeight - offsetHeight - margin;
		const x = Math.max(margin, Math.min(clientX, maxX));
		const y = Math.max(margin, Math.min(clientY, maxY));

		menu.style.left = `${x}px`;
		menu.style.top = `${y}px`;
		menu.style.visibility = "";
	}
}
