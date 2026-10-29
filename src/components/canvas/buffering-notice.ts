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
const INSET_PX = 12;
// A longer gap between ticks means ticking paused, as in an export or a hidden tab, and says nothing about stutter.
const MAX_TICK_GAP_MS = 100;

/**
 * Labels stuttering html5 playback "Buffering" in the video's bottom-left corner. It holds only its own display
 * state, and the canvas feeds it on every tick.
 * @internal
 */
export class BufferingNotice {
	public readonly element: HTMLDivElement;
	private readonly now: () => number;
	private bufferingSince: number | null = null;
	private smoothSince: number | null = null;
	private lastTickAt: number | null = null;

	constructor(now: () => number = () => performance.now()) {
		this.now = now;
		this.element = document.createElement("div");
		this.element.className = "ss-buffering-notice";
		this.element.hidden = true;
		// The toolbar's status line already tells assistive tech that playback is preparing.
		this.element.setAttribute("aria-hidden", "true");
		this.element.innerHTML = '<span class="ss-buffering-notice-spinner"></span>';
		this.element.append("Buffering");
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
			this.element.hidden = true;
			return;
		}
		if (buffering) {
			this.smoothSince = null;
			this.bufferingSince ??= previous;
			if (now - this.bufferingSince >= SHOW_AFTER_MS) this.element.hidden = false;
		} else {
			this.bufferingSince = null;
			this.smoothSince ??= previous;
			if (now - this.smoothSince >= HIDE_AFTER_MS) this.element.hidden = true;
		}
		if (this.element.hidden) return;
		this.element.style.left = `${bounds.left + INSET_PX}px`;
		this.element.style.top = `${bounds.bottom - INSET_PX}px`;
	}

	public dispose(): void {
		this.element.remove();
	}
}
