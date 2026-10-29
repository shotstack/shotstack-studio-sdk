export interface ContentBounds {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/** The part of the video inside a preview of this size, or null when none of it is. */
export function visibleBounds(content: ContentBounds, width: number, height: number): ContentBounds | null {
	const left = Math.max(content.left, 0);
	const right = Math.min(content.right, width);
	const top = Math.max(content.top, 0);
	const bottom = Math.min(content.bottom, height);
	return right > left && bottom > top ? { left, right, top, bottom } : null;
}

// Long enough that one late frame doesn't flash it, short enough that a real stutter gets explained.
const SHOW_AFTER_MS = 500;
const HIDE_AFTER_MS = 1500;
const EXPANDED_FOR_MS = 4000;
// Narrower than this, the full message would cover too much of the picture.
const NARROW_VIDEO_PX = 400;
const INSET_PX = 12;
// A longer gap between ticks means ticking paused, as in an export or a hidden tab, and says nothing about stutter.
const MAX_TICK_GAP_MS = 100;
const LABEL = "Buffering";
const MESSAGE = "You can keep watching. It'll be smoother once it's loaded.";

/**
 * Explains stuttering html5 playback from the video's bottom-left corner, then collapses to a word. It holds only its
 * own display state, and the canvas feeds it on every tick.
 * @internal
 */
export class BufferingNotice {
	public readonly element: HTMLButtonElement;
	private readonly now: () => number;
	private bufferingSince: number | null = null;
	private smoothSince: number | null = null;
	private lastTickAt: number | null = null;
	private shownAt = 0;
	private shownBefore = false;
	private opensExpanded = false;
	private hovered = false;
	private pinned = false;

	constructor(now: () => number = () => performance.now()) {
		this.now = now;
		this.element = document.createElement("button");
		this.element.type = "button";
		this.element.className = "ss-buffering-notice";
		this.element.hidden = true;
		this.element.setAttribute("aria-label", `${LABEL}. ${MESSAGE}`);
		this.element.setAttribute("aria-expanded", "false");
		this.element.innerHTML =
			'<span class="ss-buffering-notice-spinner" aria-hidden="true"></span><span class="ss-buffering-notice-label"></span><span class="ss-buffering-notice-message"></span>';
		this.element.querySelector(".ss-buffering-notice-label")!.textContent = LABEL;
		this.element.querySelector(".ss-buffering-notice-message")!.textContent = MESSAGE;
		// The canvas root pans on pointerdown, and open popups close on outside clicks.
		this.element.addEventListener("pointerdown", event => event.stopPropagation());
		this.element.addEventListener("click", event => {
			event.stopPropagation();
			this.pinned = !this.pinned;
			this.render();
		});
		this.element.addEventListener("pointerenter", () => {
			this.hovered = true;
			this.render();
		});
		this.element.addEventListener("pointerleave", () => {
			this.hovered = false;
			this.render();
		});
	}

	public mount(root: HTMLElement): void {
		root.appendChild(this.element);
	}

	/** `idle` is paused or fully loaded, and `bounds` is null when none of the video is in view. Either hides it at once. */
	public update(buffering: boolean, idle: boolean, bounds: ContentBounds | null): void {
		const now = this.now();
		// A change happened somewhere after the last tick, so its timer starts there.
		const previous = this.lastTickAt !== null && now - this.lastTickAt <= MAX_TICK_GAP_MS ? this.lastTickAt : now;
		this.lastTickAt = now;
		if (idle || !bounds) {
			this.bufferingSince = null;
			this.smoothSince = null;
			this.hide();
			return;
		}
		if (buffering) {
			this.smoothSince = null;
			this.bufferingSince ??= previous;
			if (this.element.hidden && now - this.bufferingSince >= SHOW_AFTER_MS) this.show(now, bounds);
		} else {
			this.bufferingSince = null;
			this.smoothSince ??= previous;
			if (!this.element.hidden && now - this.smoothSince >= HIDE_AFTER_MS) this.hide();
		}
		if (this.element.hidden) return;
		this.element.style.left = `${bounds.left + INSET_PX}px`;
		this.element.style.top = `${bounds.bottom - INSET_PX}px`;
		this.render();
	}

	public dispose(): void {
		this.element.remove();
	}

	private show(now: number, bounds: ContentBounds): void {
		this.shownAt = now;
		// Once read, a later stutter only needs the word.
		this.opensExpanded = !this.shownBefore && bounds.right - bounds.left >= NARROW_VIDEO_PX;
		this.shownBefore = true;
		this.pinned = false;
		this.element.hidden = false;
	}

	private hide(): void {
		this.pinned = false;
		this.element.hidden = true;
	}

	private render(): void {
		const expanded = this.pinned || this.hovered || (this.opensExpanded && this.now() - this.shownAt < EXPANDED_FOR_MS);
		this.element.classList.toggle("ss-buffering-notice--expanded", expanded);
		this.element.setAttribute("aria-expanded", String(expanded));
	}
}
