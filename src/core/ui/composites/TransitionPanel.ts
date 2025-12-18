import { UIComponent } from "../primitives/UIComponent";

/**
 * State for transition in/out configuration.
 */
export interface TransitionState {
	tab: "in" | "out";
	inEffect: string;
	inDirection: string;
	inSpeed: number;
	outEffect: string;
	outDirection: string;
	outSpeed: number;
}

/**
 * Parsed transition value from clip config.
 */
export interface ParsedTransition {
	in?: string;
	out?: string;
}

/**
 * A complete transition configuration panel with In/Out tabs,
 * effect selection, direction, and speed controls.
 *
 * This composite replaces ~150 lines of duplicated code in each toolbar
 * (MediaToolbar, TextToolbar, RichTextToolbar).
 *
 * @example
 * ```typescript
 * const transitions = new TransitionPanel();
 * transitions.onChange(state => this.applyTransition(state));
 * transitions.mount(container);
 *
 * // Sync from clip
 * transitions.setFromClip(clip.transition);
 * ```
 */
export class TransitionPanel extends UIComponent<TransitionState> {
	private static readonly EFFECTS = ["", "fade", "zoom", "slide", "wipe", "carousel"];
	private static readonly DIRECTIONS = ["Left", "Right", "Up", "Down"];
	private static readonly SPEEDS = [0.25, 0.5, 1.0, 2.0];

	private state: TransitionState = {
		tab: "in",
		inEffect: "",
		inDirection: "",
		inSpeed: 1.0,
		outEffect: "",
		outDirection: "",
		outSpeed: 1.0
	};

	// DOM references
	private tabButtons: NodeListOf<HTMLButtonElement> | null = null;
	private effectButtons: NodeListOf<HTMLButtonElement> | null = null;
	private directionRow: HTMLDivElement | null = null;
	private directionButtons: NodeListOf<HTMLButtonElement> | null = null;
	private speedLabel: HTMLSpanElement | null = null;
	private speedDecreaseBtn: HTMLButtonElement | null = null;
	private speedIncreaseBtn: HTMLButtonElement | null = null;

	constructor() {
		super({ className: "ss-toolbar-popup ss-toolbar-popup--transition" });
	}

	render(): string {
		const effectButtons = TransitionPanel.EFFECTS.map(e => `<button class="ss-transition-effect" data-effect="${e}">${e || "None"}</button>`).join("");

		const directionButtons = TransitionPanel.DIRECTIONS.map(d => `<button class="ss-transition-dir" data-dir="${d}">${this.directionIcon(d)}</button>`).join(
			""
		);

		return `
			<div class="ss-transition-tabs">
				<button class="ss-transition-tab active" data-tab="in">In</button>
				<button class="ss-transition-tab" data-tab="out">Out</button>
			</div>
			<div class="ss-transition-effects">${effectButtons}</div>
			<div class="ss-transition-direction-row" data-direction-row>
				<span class="ss-transition-label">Direction</span>
				<div class="ss-transition-directions">${directionButtons}</div>
			</div>
			<div class="ss-transition-speed-row">
				<span class="ss-transition-label">Speed</span>
				<div class="ss-transition-speed-stepper">
					<button class="ss-transition-speed-btn" data-speed-decrease>−</button>
					<span class="ss-transition-speed-value">1.00s</span>
					<button class="ss-transition-speed-btn" data-speed-increase>+</button>
				</div>
			</div>
		`;
	}

	protected bindElements(): void {
		this.tabButtons = this.container?.querySelectorAll("[data-tab]") ?? null;
		this.effectButtons = this.container?.querySelectorAll("[data-effect]") ?? null;
		this.directionRow = this.container?.querySelector("[data-direction-row]") ?? null;
		this.directionButtons = this.container?.querySelectorAll("[data-dir]") ?? null;
		this.speedLabel = this.container?.querySelector(".ss-transition-speed-value") ?? null;
		this.speedDecreaseBtn = this.container?.querySelector("[data-speed-decrease]") ?? null;
		this.speedIncreaseBtn = this.container?.querySelector("[data-speed-increase]") ?? null;
	}

	protected setupEvents(): void {
		// Tab switching
		this.events.onAll(this.tabButtons!, "click", (_, el) => {
			this.state.tab = (el as HTMLElement).dataset["tab"] as "in" | "out";
			this.updateUI();
		});

		// Effect selection
		this.events.onAll(this.effectButtons!, "click", (_, el) => {
			const effect = (el as HTMLElement).dataset["effect"] ?? "";
			this.setCurrentEffect(effect);
			this.updateUI();
			this.emit(this.state);
		});

		// Direction selection
		this.events.onAll(this.directionButtons!, "click", (_, el) => {
			const dir = (el as HTMLElement).dataset["dir"] ?? "";
			this.setCurrentDirection(dir);
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
	 * Set state from parsed clip transition.
	 */
	setFromClip(transition: ParsedTransition | undefined): void {
		const parsedIn = this.parseTransitionValue(transition?.in ?? "");
		const parsedOut = this.parseTransitionValue(transition?.out ?? "");

		this.state.inEffect = parsedIn.effect;
		this.state.inDirection = parsedIn.direction;
		this.state.inSpeed = parsedIn.speed;
		this.state.outEffect = parsedOut.effect;
		this.state.outDirection = parsedOut.direction;
		this.state.outSpeed = parsedOut.speed;

		this.updateUI();
	}

	/**
	 * Get the transition value for clip update.
	 */
	getClipValue(): ParsedTransition | undefined {
		const transitionIn = this.buildTransitionValue(this.state.inEffect, this.state.inDirection, this.state.inSpeed);
		const transitionOut = this.buildTransitionValue(this.state.outEffect, this.state.outDirection, this.state.outSpeed);

		if (!transitionIn && !transitionOut) {
			return undefined;
		}

		const result: ParsedTransition = {};
		if (transitionIn) result.in = transitionIn;
		if (transitionOut) result.out = transitionOut;
		return result;
	}

	/**
	 * Get current state.
	 */
	getState(): TransitionState {
		return { ...this.state };
	}

	// ─── Private Methods ─────────────────────────────────────────────────────

	private setCurrentEffect(effect: string): void {
		if (this.state.tab === "in") {
			this.state.inEffect = effect;
			this.state.inDirection = this.needsDirection(effect) ? "Right" : "";
		} else {
			this.state.outEffect = effect;
			this.state.outDirection = this.needsDirection(effect) ? "Right" : "";
		}
	}

	private setCurrentDirection(direction: string): void {
		if (this.state.tab === "in") {
			this.state.inDirection = direction;
		} else {
			this.state.outDirection = direction;
		}
	}

	private stepSpeed(direction: number): void {
		const speeds = TransitionPanel.SPEEDS;
		const currentSpeed = this.state.tab === "in" ? this.state.inSpeed : this.state.outSpeed;

		let currentIdx = speeds.indexOf(currentSpeed);
		if (currentIdx === -1) {
			currentIdx = speeds.findIndex(v => v >= currentSpeed);
			if (currentIdx === -1) currentIdx = speeds.length - 1;
		}

		const newIdx = Math.max(0, Math.min(speeds.length - 1, currentIdx + direction));
		const newSpeed = speeds[newIdx];

		if (this.state.tab === "in") {
			this.state.inSpeed = newSpeed;
		} else {
			this.state.outSpeed = newSpeed;
		}

		this.updateUI();
		this.emit(this.state);
	}

	private needsDirection(effect: string): boolean {
		return ["slide", "wipe", "carousel"].includes(effect);
	}

	private updateUI(): void {
		const { tab } = this.state;
		const effect = tab === "in" ? this.state.inEffect : this.state.outEffect;
		const direction = tab === "in" ? this.state.inDirection : this.state.outDirection;
		const speed = tab === "in" ? this.state.inSpeed : this.state.outSpeed;

		// Update tabs
		this.tabButtons?.forEach(btn => {
			btn.classList.toggle("active", btn.dataset["tab"] === tab);
		});

		// Update effects
		this.effectButtons?.forEach(btn => {
			btn.classList.toggle("active", btn.dataset["effect"] === effect);
		});

		// Show/hide direction row
		const showDirection = this.needsDirection(effect);
		this.directionRow?.classList.toggle("visible", showDirection);

		// Update directions
		this.directionButtons?.forEach(btn => {
			const dir = btn.dataset["dir"] ?? "";
			// Hide vertical directions for wipe
			btn.classList.toggle("hidden", effect === "wipe" && (dir === "Up" || dir === "Down"));
			btn.classList.toggle("active", dir === direction);
		});

		// Update speed
		if (this.speedLabel) {
			this.speedLabel.textContent = `${speed.toFixed(2)}s`;
		}

		// Update stepper states
		const speedIdx = TransitionPanel.SPEEDS.indexOf(speed);
		if (this.speedDecreaseBtn) this.speedDecreaseBtn.disabled = speedIdx <= 0;
		if (this.speedIncreaseBtn) this.speedIncreaseBtn.disabled = speedIdx >= TransitionPanel.SPEEDS.length - 1;
	}

	// ─── Transition Value Parsing/Building ───────────────────────────────────

	private parseTransitionValue(value: string): { effect: string; direction: string; speed: number } {
		if (!value) return { effect: "", direction: "", speed: 1.0 };

		let speedSuffix = "";
		let base = value;
		if (value.endsWith("Fast")) {
			speedSuffix = "Fast";
			base = value.slice(0, -4);
		} else if (value.endsWith("Slow")) {
			speedSuffix = "Slow";
			base = value.slice(0, -4);
		}

		const directions = ["Left", "Right", "Up", "Down"];
		for (const dir of directions) {
			if (base.endsWith(dir)) {
				const effect = base.slice(0, -dir.length);
				const speed = this.suffixToSpeed(speedSuffix, effect);
				return { effect, direction: dir, speed };
			}
		}

		const speed = this.suffixToSpeed(speedSuffix, base);
		return { effect: base, direction: "", speed };
	}

	private buildTransitionValue(effect: string, direction: string, speed: number): string {
		if (!effect) return "";

		const speedSuffix = this.speedToSuffix(speed, effect);

		if (!this.needsDirection(effect)) {
			return effect + speedSuffix;
		}

		return effect + direction + speedSuffix;
	}

	private speedToSuffix(speed: number, effect: string): string {
		const isSlideOrCarousel = effect === "slide" || effect === "carousel";

		if (isSlideOrCarousel) {
			if (speed === 0.5) return "";
			if (speed === 1.0) return "Slow";
			if (speed === 0.25) return "Fast";
			if (speed === 2.0) return "Slow";
		} else {
			if (speed === 1.0) return "";
			if (speed === 2.0) return "Slow";
			if (speed === 0.5) return "Fast";
			if (speed === 0.25) return "Fast";
		}
		return "";
	}

	private suffixToSpeed(suffix: string, effect: string): number {
		const isSlideOrCarousel = effect === "slide" || effect === "carousel";

		if (isSlideOrCarousel) {
			if (suffix === "") return 0.5;
			if (suffix === "Slow") return 1.0;
			if (suffix === "Fast") return 0.25;
		} else {
			if (suffix === "") return 1.0;
			if (suffix === "Slow") return 2.0;
			if (suffix === "Fast") return 0.5;
		}
		return 1.0;
	}

	private directionIcon(dir: string): string {
		const icons: Record<string, string> = { Left: "←", Right: "→", Up: "↑", Down: "↓" };
		return icons[dir] ?? "";
	}
}
