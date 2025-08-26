// core/text-renderer/gradient-builder.ts
import type { CanvasKit } from "canvaskit-wasm";
import type { GradientConfig } from "./types";

type Bounds = { x: number; y: number; width: number; height: number };
type AngleMode = "css" | "math"; // css: 0deg = up, clockwise; math: 0deg = right, CCW

export class GradientBuilder {
	private canvasKit: CanvasKit;

	constructor(canvasKit: CanvasKit) {
		this.canvasKit = canvasKit;
	}

	createGradientForBounds(config: GradientConfig, bounds: Bounds): unknown {
		const { type, stops, angle = 0 } = config;
		const { x, y, width, height } = bounds;

		const cx = x + width / 2;
		const cy = y + height / 2;

		const norm = this.normalizeStops(stops);
		const colors = norm.map(s => this.parseColorToFloat32(s.color));
		const positions = norm.map(s => s.offset);

		if (type === "linear") {
			// Use the exact backend calculation
			const { p0, p1 } = this.linearEndpoints(cx, cy, width, height, angle);
			return this.canvasKit.Shader.MakeLinearGradient(p0, p1, colors, positions, this.canvasKit.TileMode.Clamp);
		}

		const r = Math.min(width, height) / 2;
		return this.canvasKit.Shader.MakeRadialGradient([cx, cy], r, colors, positions, this.canvasKit.TileMode.Clamp);
	}

	/** Backend parity: createGradient(gradientConfig) using full canvas size */
	createGradient(config: GradientConfig, canvasWidth: number, canvasHeight: number): unknown {
		const { type, stops, angle = 0 } = config;

		const width = canvasWidth;
		const height = canvasHeight;
		const cx = width / 2;
		const cy = height / 2;

		const norm = this.normalizeStops(stops);
		const colors = norm.map(s => this.parseColorToFloat32(s.color));
		const positions = norm.map(s => s.offset);

		if (type === "linear") {
			// Use the exact backend calculation
			const { p0, p1 } = this.linearEndpoints(cx, cy, width, height, angle);
			return this.canvasKit.Shader.MakeLinearGradient(p0, p1, colors, positions, this.canvasKit.TileMode.Clamp);
		}

		const r = Math.min(width, height) / 2;
		return this.canvasKit.Shader.MakeRadialGradient([cx, cy], r, colors, positions, this.canvasKit.TileMode.Clamp);
	}

	// Replace the linearEndpoints method with this simpler, backend-matching approach:
	private linearEndpoints(cx: number, cy: number, width: number, height: number, angleDeg: number): { p0: [number, number]; p1: [number, number] } {
		// Match backend logic exactly
		const clampedAngle = Math.max(0, Math.min(360, angleDeg));
		const angleRad = (clampedAngle * Math.PI) / 180;
		const gradientLength = Math.max(width, height);
		const dx = (Math.cos(angleRad) * gradientLength) / 2;
		const dy = (Math.sin(angleRad) * gradientLength) / 2;

		const p0: [number, number] = [cx - dx, cy - dy];
		const p1: [number, number] = [cx + dx, cy + dy];
		return { p0, p1 };
	}

	private normalizeStops(stops: GradientConfig["stops"] = []) {
		const arr = [...stops].sort((a, b) => a.offset - b.offset);
		if (arr.length === 1) arr.push({ offset: 1, color: arr[0].color });
		// offsets are unitless [0..1]
		return arr.map(s => ({
			offset: Math.max(0, Math.min(1, s.offset)),
			color: s.color
		}));
	}

	private parseColorToFloat32(color: string): Float32Array {
		// HEX6 / HEX8 (#RRGGBB[AA]) preferred; rgba() allowed
		if (color.startsWith("#")) {
			const hex = color.slice(1);
			const r = parseInt(hex.slice(0, 2), 16) / 255;
			const g = parseInt(hex.slice(2, 4), 16) / 255;
			const b = parseInt(hex.slice(4, 6), 16) / 255;
			const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
			return this.canvasKit.Color4f(r, g, b, a);
		}
		const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*(\d*\.?\d+)?\)/);
		if (m) {
			return this.canvasKit.Color4f(+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] !== undefined ? parseFloat(m[4]) : 1);
		}
		// Fallback to opaque black
		return this.canvasKit.Color4f(0, 0, 0, 1);
	}
}
