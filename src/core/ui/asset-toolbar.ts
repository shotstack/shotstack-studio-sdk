import type { Edit } from "@core/edit";

import { ASSET_TOOLBAR_STYLES } from "./asset-toolbar.css";

const ICONS = {
	text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>`,
	media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
};

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

		this.container.innerHTML = `
			<button class="ss-asset-toolbar-btn" data-action="rich-text" data-tooltip="Add Text">
				${ICONS.text}
			</button>
			<div class="ss-asset-toolbar-divider"></div>
			<button class="ss-asset-toolbar-btn" data-action="media" data-tooltip="Add Media">
				${ICONS.media}
			</button>
		`;

		parent.appendChild(this.container);
		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this.container?.querySelectorAll("[data-action]").forEach(btn => {
			btn.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const { action } = el.dataset;

				switch (action) {
					case "rich-text":
						this.addRichTextClip();
						break;
					case "media":
						this.requestMediaUpload();
						break;
					default:
						break;
				}
			});
		});
	}

	private addRichTextClip(): void {
		const newTrackIndex = 0;

		// Add new track at top (index 0)
		this.edit.addTrack(newTrackIndex, { clips: [] });

		// Add rich-text clip
		this.edit.addClip(newTrackIndex, {
			asset: {
				type: "rich-text",
				text: "Title",
				font: {
					family: "Open Sans Bold",
					size: 72,
					weight: 700,
					color: "#ffffff",
					opacity: 1
				},
				align: {
					horizontal: "center",
					vertical: "middle"
				}
			},
			start: this.edit.playbackTime,
			length: 5,
			width: 500,
			height: 200,
			fit: "none"
		});
	}

	private requestMediaUpload(): void {
		this.edit.events.emit("upload:requested", {
			position: this.edit.playbackTime
		});
	}

	dispose(): void {
		this.container?.remove();
		this.container = null;
	}
}
