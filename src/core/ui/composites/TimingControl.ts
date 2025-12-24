import { UIComponent } from "../primitives/UIComponent";

/**
 * Timing control type - determines available modes.
 */
export type TimingType = "start" | "length";

/**
 * Mode configuration for timing controls.
 */
interface TimingMode {
	id: string;
	icon: string; // SVG path
	tooltip: string;
}

/**
 * Start timing modes: Manual or Auto.
 * Icons use 1px strokes for a refined look.
 */
const START_MODES: TimingMode[] = [
	{
		id: "manual",
		icon: `<path d="M4 3v8l5-4-5-4z" fill="currentColor" stroke="none"/><path d="M10 3v8"/>`,
		tooltip: "Manual: Set specific time"
	},
	{
		id: "auto",
		icon: `<path d="M3 7h3M8 7h3"/><circle cx="7" cy="7" r="2" fill="none"/>`,
		tooltip: "Auto: After previous clip"
	}
];

/**
 * Length timing modes: Manual, Auto, or End.
 * Icons use 1px strokes for a refined look.
 */
const LENGTH_MODES: TimingMode[] = [
	{
		id: "manual",
		icon: `<path d="M2 5h10M2 7h7M2 9h10"/>`,
		tooltip: "Manual: Set specific duration"
	},
	{
		id: "auto",
		icon: `<path d="M7 3a4 4 0 1 1-3 1.5" fill="none"/><path d="M4 2v3h3" fill="none"/>`,
		tooltip: "Auto: Asset's natural duration"
	},
	{
		id: "end",
		icon: `<path d="M3 3v8l4-4-4-4z" fill="currentColor" stroke="none"/><path d="M9 3v8"/><path d="M11 3v8"/>`,
		tooltip: "End: Extend to timeline end"
	}
];

/**
 * State for timing control.
 */
export interface TimingControlState {
	mode: string;
	value: number; // milliseconds
}

/**
 * Compact timing control with:
 * - Click-to-cycle mode badge with SVG icons
 * - Scrubbable time value (drag to adjust)
 * - Double-click to enter text edit mode
 * - Arrow key increment/decrement
 * - Smart time formatting (5.2s instead of 0:05.200)
 * - Tooltip on hover (500ms delay)
 */
export class TimingControl extends UIComponent<TimingControlState> {
	private type: TimingType;
	private modes: TimingMode[];
	private state: TimingControlState;

	// DOM references
	private modeBtn: HTMLButtonElement | null = null;
	private valueInput: HTMLInputElement | null = null;
	private tooltipEl: HTMLDivElement | null = null;

	// Scrub state
	private isDragging = false;
	private dragStartX = 0;
	private dragStartValue = 0;
	private tooltipTimeout: number | null = null;

	constructor(type: TimingType) {
		super({ className: "ss-timing-control", attributes: { "data-type": type } });
		this.type = type;
		this.modes = type === "start" ? START_MODES : LENGTH_MODES;
		this.state = { mode: "manual", value: type === "start" ? 0 : 3000 };
	}

	render(): string {
		const mode = this.modes[0];
		const label = this.type === "start" ? "START" : "LENGTH";
		return `
			<button class="ss-timing-mode" data-mode="${mode.id}" title="${mode.tooltip}">
				<span class="ss-timing-label">${label}</span>
				<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
					${mode.icon}
				</svg>
			</button>
			<input
				type="text"
				class="ss-timing-value"
				value="${this.formatTime(this.state.value)}"
				data-ms="${this.state.value}"
				readonly
			/>
			<div class="ss-timing-tooltip">${mode.tooltip}</div>
		`;
	}

	protected bindElements(): void {
		this.modeBtn = this.container?.querySelector(".ss-timing-mode") ?? null;
		this.valueInput = this.container?.querySelector(".ss-timing-value") ?? null;
		this.tooltipEl = this.container?.querySelector(".ss-timing-tooltip") ?? null;
	}

	protected setupEvents(): void {
		// Mode cycling (click to cycle)
		this.events.on(this.modeBtn, "click", e => {
			e.preventDefault();
			this.cycleMode();
		});

		// Tooltip on hover (500ms delay)
		this.events.on(this.modeBtn, "mouseenter", () => this.showTooltipDelayed());
		this.events.on(this.modeBtn, "mouseleave", () => this.hideTooltip());

		// Value input events
		if (this.valueInput) {
			// Scrub: mousedown starts drag
			this.events.on(this.valueInput, "mousedown", (e: Event) => {
				const mouseEvent = e as MouseEvent;
				// Only start drag if not already editing
				if (this.valueInput?.readOnly && this.state.mode === "manual") {
					this.startDrag(mouseEvent);
				}
			});

			// Double-click to enter edit mode
			this.events.on(this.valueInput, "dblclick", () => {
				if (this.state.mode === "manual") {
					this.enterEditMode();
				}
			});

			// Keyboard: arrow keys for increment/decrement
			this.events.on(this.valueInput, "keydown", (e: Event) => {
				this.handleKeydown(e as KeyboardEvent);
			});

			// Blur: exit edit mode
			this.events.on(this.valueInput, "blur", () => {
				if (!this.valueInput?.readOnly) {
					this.exitEditMode();
				}
			});

			// Focus: select all when entering edit mode
			this.events.on(this.valueInput, "focus", () => {
				if (!this.valueInput?.readOnly) {
					requestAnimationFrame(() => this.valueInput?.select());
				}
			});
		}

		// Global mouse events for dragging
		document.addEventListener("mousemove", this.handleMouseMove);
		document.addEventListener("mouseup", this.handleMouseUp);
	}

	// ─── Mode Cycling ────────────────────────────────────────────────────────────

	private cycleMode(): void {
		const currentIndex = this.modes.findIndex(m => m.id === this.state.mode);
		const nextIndex = (currentIndex + 1) % this.modes.length;
		const nextMode = this.modes[nextIndex];

		this.state.mode = nextMode.id;

		// Set default value for non-manual modes
		if (nextMode.id !== "manual") {
			// Keep the last manual value in case user switches back
		}

		this.updateUI();
		this.emit(this.state);
	}

	// ─── Tooltip ─────────────────────────────────────────────────────────────────

	private showTooltipDelayed(): void {
		this.tooltipTimeout = window.setTimeout(() => {
			this.tooltipEl?.classList.add("visible");
		}, 500);
	}

	private hideTooltip(): void {
		if (this.tooltipTimeout) {
			clearTimeout(this.tooltipTimeout);
			this.tooltipTimeout = null;
		}
		this.tooltipEl?.classList.remove("visible");
	}

	// ─── Scrubbing (Drag to Adjust) ──────────────────────────────────────────────

	private startDrag(e: MouseEvent): void {
		if (this.state.mode !== "manual") return;

		this.isDragging = true;
		this.dragStartX = e.clientX;
		this.dragStartValue = this.state.value;

		// Add dragging class to container (unified field highlights)
		this.container?.classList.add("dragging");

		e.preventDefault();
	}

	private handleMouseMove = (e: MouseEvent): void => {
		if (!this.isDragging) return;

		const deltaX = e.clientX - this.dragStartX;

		// Sensitivity: 100ms per pixel, Shift = 1000ms, Alt = 10ms
		let sensitivity = 100;
		if (e.shiftKey) sensitivity = 1000;
		else if (e.altKey) sensitivity = 10;

		const deltaMs = deltaX * sensitivity;
		const newValue = Math.max(0, this.dragStartValue + deltaMs);

		this.state.value = Math.round(newValue);
		this.updateValueDisplay();
	};

	private handleMouseUp = (): void => {
		if (this.isDragging) {
			this.isDragging = false;
			this.container?.classList.remove("dragging");
			this.emit(this.state);
		}
	};

	// ─── Edit Mode (Double-Click) ────────────────────────────────────────────────

	private enterEditMode(): void {
		if (!this.valueInput || this.state.mode !== "manual") return;

		this.valueInput.readOnly = false;
		this.container?.classList.add("editing");
		this.valueInput.focus();
	}

	private exitEditMode(): void {
		if (!this.valueInput) return;

		// Parse and validate input
		const parsed = this.parseTimeString(this.valueInput.value);
		if (parsed !== null && parsed >= 0) {
			this.state.value = parsed;
			this.emit(this.state);
		}

		// Reset to readonly and update display
		this.valueInput.readOnly = true;
		this.container?.classList.remove("editing");
		this.updateValueDisplay();
	}

	// ─── Keyboard Support ────────────────────────────────────────────────────────

	private handleKeydown(e: KeyboardEvent): void {
		if (!this.valueInput) return;

		// Handle edit mode keys
		if (!this.valueInput.readOnly) {
			if (e.key === "Enter") {
				e.preventDefault();
				this.valueInput.blur();
			} else if (e.key === "Escape") {
				e.preventDefault();
				// Revert and exit
				this.valueInput.value = this.formatTime(this.state.value);
				this.valueInput.readOnly = true;
				this.valueInput.classList.remove("editing");
				this.valueInput.blur();
			}
			return;
		}

		// Handle scrub mode keys (arrow increment/decrement)
		if (this.state.mode !== "manual") return;

		let delta = 0;
		let step = 100;
		if (e.shiftKey) step = 1000;
		else if (e.altKey) step = 10;

		if (e.key === "ArrowUp") {
			delta = step;
		} else if (e.key === "ArrowDown") {
			delta = -step;
		} else {
			return;
		}

		e.preventDefault();
		this.state.value = Math.max(0, this.state.value + delta);
		this.updateValueDisplay();
		this.emit(this.state);
	}

	// ─── Time Formatting ─────────────────────────────────────────────────────────

	/**
	 * Smart time formatting (follows CapCut convention):
	 * - < 60s: "5.2s" (unit suffix for clarity)
	 * - 1min+: "1:23.4" (colon implies time)
	 * - 10min+: "12:34"
	 */
	private formatTime(ms: number): string {
		const totalSecs = ms / 1000;

		if (totalSecs < 60) {
			// Show as seconds with unit suffix for clarity
			return `${totalSecs.toFixed(1)}s`;
		}

		if (totalSecs < 600) {
			// Show as M:SS.t
			const mins = Math.floor(totalSecs / 60);
			const secs = totalSecs % 60;
			return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
		}

		// Show as MM:SS (no decimals for long durations)
		const mins = Math.floor(totalSecs / 60);
		const secs = Math.floor(totalSecs % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	}

	/**
	 * Parse various time formats:
	 * - "5", "5.2", "5.2s" → seconds
	 * - "1:23", "1:23.4" → minutes:seconds
	 */
	private parseTimeString(str: string): number | null {
		const trimmed = str.trim().toLowerCase().replace("s", "");

		// Try M:SS.t or M:SS format
		const colonMatch = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
		if (colonMatch) {
			const mins = parseInt(colonMatch[1], 10);
			const secs = parseFloat(colonMatch[2] + (colonMatch[3] ? `.${colonMatch[3]}` : ""));
			return Math.round((mins * 60 + secs) * 1000);
		}

		// Try plain number (seconds)
		const num = parseFloat(trimmed);
		if (!Number.isNaN(num)) {
			return Math.round(num * 1000);
		}

		return null;
	}

	// ─── UI Updates ──────────────────────────────────────────────────────────────

	private updateUI(): void {
		const mode = this.modes.find(m => m.id === this.state.mode) ?? this.modes[0];

		// Update mode button icon
		if (this.modeBtn) {
			this.modeBtn.dataset["mode"] = mode.id;
			this.modeBtn.title = mode.tooltip;
			const svg = this.modeBtn.querySelector("svg");
			if (svg) {
				svg.innerHTML = mode.icon;
			}
		}

		// Update tooltip text
		if (this.tooltipEl) {
			this.tooltipEl.textContent = mode.tooltip;
		}

		// Update value display
		this.updateValueDisplay();

		// Update container data attribute for CSS styling
		this.container?.setAttribute("data-mode", mode.id);
	}

	private updateValueDisplay(): void {
		if (!this.valueInput) return;

		if (this.state.mode === "manual") {
			this.valueInput.value = this.formatTime(this.state.value);
			this.valueInput.dataset["ms"] = this.state.value.toString();
			this.valueInput.classList.remove("auto-mode");
		} else {
			this.valueInput.value = this.state.mode;
			this.valueInput.classList.add("auto-mode");
		}
	}

	// ─── Public API ──────────────────────────────────────────────────────────────

	/**
	 * Set state from clip configuration.
	 */
	setFromClip(value: number | "auto" | "end"): void {
		if (value === "auto") {
			this.state.mode = "auto";
		} else if (value === "end") {
			this.state.mode = "end";
		} else {
			this.state.mode = "manual";
			this.state.value = typeof value === "number" ? value : 0;
		}
		this.updateUI();
	}

	/**
	 * Get value for clip update (start timing).
	 * Returns number | "auto" for start controls.
	 */
	getStartValue(): number | "auto" {
		if (this.state.mode === "auto") return "auto";
		return this.state.value;
	}

	/**
	 * Get value for clip update (length timing).
	 * Returns number | "auto" | "end" for length controls.
	 */
	getLengthValue(): number | "auto" | "end" {
		if (this.state.mode === "auto") return "auto";
		if (this.state.mode === "end") return "end";
		return this.state.value;
	}

	/**
	 * Get current state.
	 */
	getState(): TimingControlState {
		return { ...this.state };
	}

	override dispose(): void {
		document.removeEventListener("mousemove", this.handleMouseMove);
		document.removeEventListener("mouseup", this.handleMouseUp);
		if (this.tooltipTimeout) {
			clearTimeout(this.tooltipTimeout);
		}
		super.dispose();
	}
}
