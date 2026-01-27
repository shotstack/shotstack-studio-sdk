import * as pixi from "pixi.js";

import { type AiIconType, AI_ICON_FILL_PATHS } from "./ai-icons";

export type { AiIconType };

export interface AiPendingOverlayOptions {
	mode: "badge" | "panel";
	icon: AiIconType;
	width: number;
	height: number;
}

/**
 * Aurora curtain layer definition.
 */
interface AuroraLayer {
	color: number;
	baseAlpha: number;
	baseY: number;
	rayHeight: number;
	phase: number;
	scrollSpeed: number;
	waves: [number, number, number][];
	graphics: pixi.Graphics;
}

function layeredSine(x: number, t: number, phase: number, waves: [number, number, number][]): number {
	let sum = 0;
	for (const [freq, amp, speed] of waves) {
		sum += Math.sin(x * freq + t * speed + phase) * amp;
	}
	return sum;
}

const LAYER_SPECS: Omit<AuroraLayer, "graphics">[] = [
	{
		color: 0x06b6d4,
		baseAlpha: 0.12,
		baseY: 0.35,
		rayHeight: 0.45,
		phase: 0,
		scrollSpeed: 0.08,
		waves: [
			[2.0, 0.08, 0.15],
			[4.5, 0.04, 0.25],
			[9.0, 0.015, 0.4]
		]
	},
	{
		color: 0x10b981,
		baseAlpha: 0.18,
		baseY: 0.3,
		rayHeight: 0.5,
		phase: 1.2,
		scrollSpeed: 0.12,
		waves: [
			[1.5, 0.1, 0.18],
			[3.8, 0.05, 0.3],
			[8.0, 0.02, 0.5],
			[14.0, 0.008, 0.7]
		]
	},
	{
		color: 0x34d399,
		baseAlpha: 0.15,
		baseY: 0.28,
		rayHeight: 0.35,
		phase: 2.8,
		scrollSpeed: 0.1,
		waves: [
			[2.2, 0.07, 0.2],
			[5.5, 0.035, 0.35],
			[11.0, 0.012, 0.55]
		]
	},
	{
		color: 0x7c3aed,
		baseAlpha: 0.14,
		baseY: 0.45,
		rayHeight: 0.4,
		phase: 4.1,
		scrollSpeed: 0.09,
		waves: [
			[1.8, 0.09, 0.12],
			[4.2, 0.045, 0.28],
			[9.5, 0.018, 0.45]
		]
	},
	{
		color: 0xec4899,
		baseAlpha: 0.1,
		baseY: 0.5,
		rayHeight: 0.3,
		phase: 5.5,
		scrollSpeed: 0.14,
		waves: [
			[2.5, 0.06, 0.22],
			[6.0, 0.03, 0.38],
			[12.0, 0.01, 0.6]
		]
	}
];

const COLUMN_COUNT = 64;

const BADGE_SIZE = 48;
const BADGE_ICON_SIZE = 28;
const BADGE_INSET = 10;

/**
 * Visual overlay indicating an AI asset is awaiting generation.
 */
export class AiPendingOverlay {
	private container: pixi.Container;
	private layers: AuroraLayer[] = [];
	private auroraLayer!: pixi.Container;
	private time = 0;
	private rafId: number | null = null;
	private lastTime: number | null = null;

	constructor(private options: AiPendingOverlayOptions) {
		this.container = new pixi.Container();
		this.build();
		this.startAnimation();
	}

	getContainer(): pixi.Container {
		return this.container;
	}

	resize(width: number, height: number): void {
		if (width === this.options.width && height === this.options.height) return;
		this.options.width = width;
		this.options.height = height;
		this.rebuild();
	}

	dispose(): void {
		this.stopAnimation();
		this.container.destroy({ children: true });
	}

	// ── private ──────────────────────────────────────────

	private rebuild(): void {
		this.container.removeChildren();
		this.layers = [];
		this.build();
	}

	private startAnimation(): void {
		const tick = (now: number) => {
			if (this.lastTime !== null) {
				const deltaSec = (now - this.lastTime) / 1000;
				this.time += deltaSec;
				this.drawAurora();
			}
			this.lastTime = now;
			this.rafId = requestAnimationFrame(tick);
		};
		this.rafId = requestAnimationFrame(tick);
	}

	private stopAnimation(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	private build(): void {
		const { mode, width, height } = this.options;

		if (mode === "panel") {
			const bg = new pixi.Graphics();
			bg.roundRect(0, 0, width, height, 4);
			bg.fill({ color: "#1E1B2E", alpha: 1 });
			this.container.addChild(bg);
		} else {
			const scrim = new pixi.Graphics();
			scrim.rect(0, 0, width, height);
			scrim.fill({ color: "#000000", alpha: 0.25 });
			this.container.addChild(scrim);
		}

		this.auroraLayer = new pixi.Container();

		this.layers = LAYER_SPECS.map(spec => {
			const graphics = new pixi.Graphics();
			this.auroraLayer.addChild(graphics);
			return { ...spec, graphics };
		});

		const strength = Math.min(Math.max(Math.min(width, height) * 0.04, 12), 40);
		const blurFilter = new pixi.BlurFilter({ strength, quality: 4 });
		this.auroraLayer.filters = [blurFilter];

		const mask = new pixi.Graphics();
		if (mode === "panel") {
			mask.roundRect(0, 0, width, height, 4);
		} else {
			mask.rect(0, 0, width, height);
		}
		mask.fill({ color: "#ffffff" });
		this.auroraLayer.addChild(mask);
		this.auroraLayer.mask = mask;

		this.container.addChild(this.auroraLayer);
		this.drawAurora();

		this.buildBadge();
	}

	/**
	 * Render all aurora layers as vertical strip columns.
	 */
	private drawAurora(): void {
		const { width, height } = this.options;
		const t = this.time;
		const colWidth = width / COLUMN_COUNT;

		for (const layer of this.layers) {
			layer.graphics.clear();

			const breath = Math.sin(t * 0.3 + layer.phase * 1.7) * 0.5 + 0.5;
			const layerAlpha = layer.baseAlpha * (0.7 + 0.3 * breath);

			const scrollOffset = t * layer.scrollSpeed;

			for (let i = 0; i < COLUMN_COUNT; i += 1) {
				const xNorm = i / COLUMN_COUNT;
				const xWave = xNorm * Math.PI * 2 + scrollOffset;

				const waveOffset = layeredSine(xWave, t, layer.phase, layer.waves);
				const topY = (layer.baseY + waveOffset) * height;

				const heightMod = 0.6 + 0.4 * Math.sin(xWave * 3.7 + t * 0.2 + layer.phase * 2.3);
				const rayH = layer.rayHeight * height * heightMod;

				const rayIntensity = 0.4 + 0.6 * (Math.sin(xWave * 5.0 + t * 0.15 + layer.phase * 3.1) * 0.5 + 0.5) ** 0.7;

				const alpha = layerAlpha * rayIntensity;
				const x = i * colWidth;

				layer.graphics.rect(x, topY, colWidth + 1, rayH);
				layer.graphics.fill({ color: layer.color, alpha });
			}
		}
	}

	private buildBadge(): void {
		const { width, icon } = this.options;

		const badge = new pixi.Container();
		badge.position.set(width - BADGE_SIZE - BADGE_INSET, BADGE_INSET);

		const bg = new pixi.Graphics();
		bg.circle(BADGE_SIZE / 2, BADGE_SIZE / 2, BADGE_SIZE / 2);
		bg.fill({ color: "#000000", alpha: 0.5 });
		badge.addChild(bg);

		const iconGraphics = new pixi.Graphics();
		iconGraphics.svg(`<svg viewBox="0 0 24 24"><path d="${AI_ICON_FILL_PATHS[icon]}" fill="#C084FC" /></svg>`);
		const scale = BADGE_ICON_SIZE / 24;
		const offset = (BADGE_SIZE - BADGE_ICON_SIZE) / 2;
		iconGraphics.scale.set(scale, scale);
		iconGraphics.position.set(offset, offset);
		badge.addChild(iconGraphics);

		this.container.addChild(badge);
	}
}
