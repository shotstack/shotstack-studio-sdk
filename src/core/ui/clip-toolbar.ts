import { injectShotstackStyles } from "@styles/inject";

import { BaseToolbar } from "./base-toolbar";
import { TimingControl } from "./composites/TimingControl";

/**
 * Toolbar for clip-level properties (timing, linking).
 * Shows compact timing controls for start and length with:
 * - Click-to-cycle mode badges
 * - Scrubbable time values (drag to adjust)
 * - Keyboard increment/decrement (arrow keys)
 */
export class ClipToolbar extends BaseToolbar {
	// Timing controls
	private startControl: TimingControl | null = null;
	private lengthControl: TimingControl | null = null;

	override mount(parent: HTMLElement): void {
		injectShotstackStyles();

		this.container = document.createElement("div");
		this.container.className = "ss-clip-toolbar";

		this.container.innerHTML = `
			<!-- Mode Toggle -->
			<div class="ss-toolbar-mode-toggle" data-mode="clip">
				<button class="ss-toolbar-mode-btn" data-mode="asset" title="Asset properties (Tab)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="2" y="2" width="12" height="12" rx="1.5"/>
						<path d="M2 6h12M6 6v8"/>
					</svg>
				</button>
				<button class="ss-toolbar-mode-btn active" data-mode="clip" title="Clip timing (Tab)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="8" cy="8" r="6"/>
						<path d="M8 5v3l2 2"/>
					</svg>
				</button>
				<span class="ss-toolbar-mode-indicator"></span>
			</div>
			<div class="ss-toolbar-mode-divider"></div>

			<div class="ss-clip-toolbar-section" data-start-mount></div>
			<div class="ss-clip-toolbar-section" data-length-mount></div>
		`;

		parent.insertBefore(this.container, parent.firstChild);

		this.mountComponents();
		this.setupOutsideClickHandler();
	}

	private mountComponents(): void {
		// Mount start timing control
		const startMount = this.container?.querySelector("[data-start-mount]");
		if (startMount) {
			this.startControl = new TimingControl("start");
			this.startControl.onChange(() => this.applyTimingUpdate());
			this.startControl.mount(startMount as HTMLElement);
		}

		// Mount length timing control
		const lengthMount = this.container?.querySelector("[data-length-mount]");
		if (lengthMount) {
			this.lengthControl = new TimingControl("length");
			this.lengthControl.onChange(() => this.applyTimingUpdate());
			this.lengthControl.mount(lengthMount as HTMLElement);
		}
	}

	private applyTimingUpdate(): void {
		if (this.selectedTrackIdx < 0 || this.selectedClipIdx < 0) return;

		const startValue = this.startControl?.getStartValue();
		const lengthValue = this.lengthControl?.getLengthValue();

		// Apply update via edit session
		this.edit.updateClipTiming(this.selectedTrackIdx, this.selectedClipIdx, {
			start: startValue,
			length: lengthValue
		});
	}

	protected override syncState(): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player?.clipConfiguration) return;

		const clip = player.clipConfiguration;

		// Sync start timing
		this.startControl?.setFromClip(clip.start);

		// Sync length timing
		this.lengthControl?.setFromClip(clip.length);
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [];
	}

	override dispose(): void {
		this.startControl?.dispose();
		this.lengthControl?.dispose();

		super.dispose();

		this.startControl = null;
		this.lengthControl = null;
	}
}
