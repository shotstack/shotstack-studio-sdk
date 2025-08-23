import type { CanvasKit, Shader } from "canvaskit-wasm";
import type { GradientConfig } from "./types";

export class GradientBuilder {
	private canvasKit: CanvasKit;
	constructor(canvasKit: CanvasKit) {
		this.canvasKit = canvasKit;
	}

	createLinearGradient(config: GradientConfig, x: number, y: number, width: number, height: number): Shader {
		const clampedAngle = Math.max(0, Math.min(360, config.angle ?? 0));
		const angle = (clampedAngle * Math.PI) / 180;
		const centerX = x + width / 2;
		const centerY = y + height / 2;
		const gradientLength = Math.max(width, height);
		const dx = (Math.cos(angle) * gradientLength) / 2;
		const dy = (Math.sin(angle) * gradientLength) / 2;

		const colors: Float32Array[] = [];
		const positions: number[] = [];
		(config.stops || []).forEach(stop => {
			colors.push(this.parseColorToFloat32(stop.color));
			positions.push(Math.max(0, Math.min(1, stop.offset)));
		});

		return this.canvasKit.Shader.MakeLinearGradient(
			[centerX - dx, centerY - dy],
			[centerX + dx, centerY + dy],
			colors,
			positions,
			this.canvasKit.TileMode.Clamp
		);
	}

	createRadialGradient(config: GradientConfig, x: number, y: number, width: number, height: number): Shader {
		const centerX = x + width / 2;
		const centerY = y + height / 2;
		const radius = Math.min(width, height) / 2;

		const colors: Float32Array[] = [];
		const positions: number[] = [];
		(config.stops || []).forEach(stop => {
			colors.push(this.parseColorToFloat32(stop.color));
			positions.push(Math.max(0, Math.min(1, stop.offset)));
		});

		return this.canvasKit.Shader.MakeRadialGradient([centerX, centerY], radius, colors, positions, this.canvasKit.TileMode.Clamp);
	}

	createGradient(config: GradientConfig, bounds: { x: number; y: number; width: number; height: number }): Shader {
		return config.type === "radial"
			? this.createRadialGradient(config, bounds.x, bounds.y, bounds.width, bounds.height)
			: this.createLinearGradient(config, bounds.x, bounds.y, bounds.width, bounds.height);
	}

	private parseColorToFloat32(color: string): Float32Array {
		if (color.startsWith("#")) {
			const hex = color.replace("#", "");
			const r = parseInt(hex.slice(0, 2), 16) / 255;
			const g = parseInt(hex.slice(2, 4), 16) / 255;
			const b = parseInt(hex.slice(4, 6), 16) / 255;
			const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
			return this.canvasKit.Color4f(r, g, b, a);
		}
		const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*(\d*\.?\d+)?\)/);
		if (m) {
			return this.canvasKit.Color4f(parseInt(m[1]) / 255, parseInt(m[2]) / 255, parseInt(m[3]) / 255, parseFloat(m[4] || "1"));
		}
		return this.canvasKit.Color4f(0, 0, 0, 1);
	}
}
