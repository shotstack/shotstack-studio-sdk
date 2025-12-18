import { UIComponent } from "../primitives/UIComponent";

/**
 * State for effect configuration.
 */
export interface EffectState {
	type: "" | "zoom" | "slide";
	variant: "In" | "Out";
	direction: "Left" | "Right" | "Up" | "Down";
	speed: number;
}

/**
 * A complete effect configuration panel with type selection,
 * variant (In/Out), direction, and speed controls.
 *
 * This composite replaces ~120 lines of duplicated code in each toolbar
 * (MediaToolbar, TextToolbar, RichTextToolbar).
 *
 * @example
 * ```typescript
 * const effects = new EffectPanel();
 * effects.onChange(state => this.applyEffect(state));
 * effects.mount(container);
 *
 * // Sync from clip
 * effects.setFromClip(clip.effect);
 * ```
 */
export class EffectPanel extends UIComponent<EffectState> {
	private static readonly EFFECT_TYPES = ["", "zoom", "slide"];
	private static readonly DIRECTIONS = ["Left", "Right", "Up", "Down"] as const;
	private static readonly SPEEDS = [0.5, 1.0, 2.0];

	private state: EffectState = {
		type: "",
		variant: "In",
		direction: "Right",
		speed: 1.0
	};

	// DOM references
	private typeButtons: NodeListOf<HTMLButtonElement> | null = null;
	private variantRow: HTMLDivElement | null = null;
	private variantButtons: NodeListOf<HTMLButtonElement> | null = null;
	private directionRow: HTMLDivElement | null = null;
	private directionButtons: NodeListOf<HTMLButtonElement> | null = null;
	private speedRow: HTMLDivElement | null = null;
	private speedLabel: HTMLSpanElement | null = null;
	private speedDecreaseBtn: HTMLButtonElement | null = null;
	private speedIncreaseBtn: HTMLButtonElement | null = null;

	constructor() {
		super(); // No wrapper class - mounted inside existing popup container
	}

	render(): string {
		const typeButtons = EffectPanel.EFFECT_TYPES.map(
			t => `<button class="ss-effect-type" data-effect-type="${t}">${t ? t.charAt(0).toUpperCase() + t.slice(1) : "None"}</button>`
		).join("");

		const variantButtons = `
			<button class="ss-effect-variant" data-variant="In">In</button>
			<button class="ss-effect-variant" data-variant="Out">Out</button>
		`;

		const directionButtons = EffectPanel.DIRECTIONS.map(d => `<button class="ss-effect-dir" data-effect-dir="${d}">${this.directionIcon(d)}</button>`).join(
			""
		);

		return `
			<div class="ss-effect-types">${typeButtons}</div>
			<div class="ss-effect-variant-row" data-effect-variant-row>
				<span class="ss-effect-label">Variant</span>
				<div class="ss-effect-variants">${variantButtons}</div>
			</div>
			<div class="ss-effect-direction-row" data-effect-direction-row>
				<span class="ss-effect-label">Direction</span>
				<div class="ss-effect-directions">${directionButtons}</div>
			</div>
			<div class="ss-effect-speed-row" data-effect-speed-row>
				<span class="ss-effect-label">Speed</span>
				<div class="ss-effect-speed-stepper">
					<button class="ss-effect-speed-btn" data-effect-speed-decrease>−</button>
					<span class="ss-effect-speed-value">1s</span>
					<button class="ss-effect-speed-btn" data-effect-speed-increase>+</button>
				</div>
			</div>
		`;
	}

	protected bindElements(): void {
		this.typeButtons = this.container?.querySelectorAll("[data-effect-type]") ?? null;
		this.variantRow = this.container?.querySelector("[data-effect-variant-row]") ?? null;
		this.variantButtons = this.container?.querySelectorAll("[data-variant]") ?? null;
		this.directionRow = this.container?.querySelector("[data-effect-direction-row]") ?? null;
		this.directionButtons = this.container?.querySelectorAll("[data-effect-dir]") ?? null;
		this.speedRow = this.container?.querySelector("[data-effect-speed-row]") ?? null;
		this.speedLabel = this.container?.querySelector(".ss-effect-speed-value") ?? null;
		this.speedDecreaseBtn = this.container?.querySelector("[data-effect-speed-decrease]") ?? null;
		this.speedIncreaseBtn = this.container?.querySelector("[data-effect-speed-increase]") ?? null;
	}

	protected setupEvents(): void {
		// Effect type selection
		this.events.onAll(this.typeButtons!, "click", (_, el) => {
			this.state.type = (el as HTMLElement).dataset["effectType"] as EffectState["type"];
			this.updateUI();
			this.emit(this.state);
		});

		// Variant selection
		this.events.onAll(this.variantButtons!, "click", (_, el) => {
			this.state.variant = (el as HTMLElement).dataset["variant"] as EffectState["variant"];
			this.updateUI();
			this.emit(this.state);
		});

		// Direction selection
		this.events.onAll(this.directionButtons!, "click", (_, el) => {
			this.state.direction = (el as HTMLElement).dataset["effectDir"] as EffectState["direction"];
			this.updateUI();
			this.emit(this.state);
		});

		// Speed controls
		this.events.on(this.speedDecreaseBtn, "click", e => {
			e.stopPropagation();
			this.stepSpeed(-1);
		});
		this.events.on(this.speedIncreaseBtn, "click", e => {
			e.stopPropagation();
			this.stepSpeed(1);
		});
	}

	/**
	 * Set state from clip effect string.
	 */
	setFromClip(effect: string | undefined): void {
		this.parseEffectValue(effect ?? "");
		this.updateUI();
	}

	/**
	 * Get the effect value for clip update.
	 */
	getClipValue(): string | undefined {
		return this.buildEffectValue() || undefined;
	}

	/**
	 * Get current state.
	 */
	getState(): EffectState {
		return { ...this.state };
	}

	// ─── Private Methods ─────────────────────────────────────────────────────

	private stepSpeed(direction: number): void {
		const speeds = EffectPanel.SPEEDS;
		const currentIdx = speeds.indexOf(this.state.speed);
		const newIdx = Math.max(0, Math.min(speeds.length - 1, currentIdx + direction));
		this.state.speed = speeds[newIdx];
		this.updateUI();
		this.emit(this.state);
	}

	private updateUI(): void {
		// Update type buttons
		this.typeButtons?.forEach(btn => {
			btn.classList.toggle("active", btn.dataset["effectType"] === this.state.type);
		});

		// Show/hide variant row (only for zoom)
		this.variantRow?.classList.toggle("visible", this.state.type === "zoom");

		// Update variant buttons
		this.variantButtons?.forEach(btn => {
			btn.classList.toggle("active", btn.dataset["variant"] === this.state.variant);
		});

		// Show/hide direction row (only for slide)
		this.directionRow?.classList.toggle("visible", this.state.type === "slide");

		// Update direction buttons
		this.directionButtons?.forEach(btn => {
			btn.classList.toggle("active", btn.dataset["effectDir"] === this.state.direction);
		});

		// Show/hide speed row (when effect is selected)
		this.speedRow?.classList.toggle("visible", this.state.type !== "");

		// Update speed display
		if (this.speedLabel) {
			this.speedLabel.textContent = `${this.state.speed}s`;
		}

		// Update stepper button states
		const speedIdx = EffectPanel.SPEEDS.indexOf(this.state.speed);
		if (this.speedDecreaseBtn) this.speedDecreaseBtn.disabled = speedIdx <= 0;
		if (this.speedIncreaseBtn) this.speedIncreaseBtn.disabled = speedIdx >= EffectPanel.SPEEDS.length - 1;
	}

	// ─── Effect Value Parsing/Building ───────────────────────────────────────

	private parseEffectValue(effect: string): void {
		if (!effect) {
			this.state.type = "";
			this.state.speed = 1.0;
			return;
		}

		let base = effect;
		if (effect.endsWith("Slow")) {
			this.state.speed = 2.0;
			base = effect.slice(0, -4);
		} else if (effect.endsWith("Fast")) {
			this.state.speed = 0.5;
			base = effect.slice(0, -4);
		} else {
			this.state.speed = 1.0;
		}

		if (base.startsWith("zoom")) {
			this.state.type = "zoom";
			this.state.variant = base === "zoomOut" ? "Out" : "In";
		} else if (base.startsWith("slide")) {
			this.state.type = "slide";
			const dir = base.replace("slide", "") as EffectState["direction"];
			this.state.direction = dir || "Right";
		} else {
			this.state.type = "";
		}
	}

	private buildEffectValue(): string {
		if (this.state.type === "") return "";

		let value = "";
		if (this.state.type === "zoom") {
			value = `zoom${this.state.variant}`;
		} else if (this.state.type === "slide") {
			value = `slide${this.state.direction}`;
		}

		if (this.state.speed === 0.5) value += "Fast";
		else if (this.state.speed === 2.0) value += "Slow";

		return value;
	}

	private directionIcon(dir: string): string {
		const icons: Record<string, string> = { Left: "←", Right: "→", Up: "↑", Down: "↓" };
		return icons[dir] ?? "";
	}
}
