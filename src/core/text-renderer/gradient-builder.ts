import type { CanvasKit, Shader, Canvas } from "canvaskit-wasm";
import type { GradientConfig } from "./types";

export class GradientBuilder {
	private canvasKit: CanvasKit;

	constructor(canvasKit: CanvasKit) {
		this.canvasKit = canvasKit;
	}

	createLinearGradient(config: GradientConfig, x: number, y: number, width: number, height: number): Shader {
		const angle = ((config.angle || 0) * Math.PI) / 180;
		const centerX = x + width / 2;
		const centerY = y + height / 2;

		const gradientLength = Math.max(width, height);
		const dx = (Math.cos(angle) * gradientLength) / 2;
		const dy = (Math.sin(angle) * gradientLength) / 2;

		const colors: Float32Array[] = [];
		const positions: number[] = [];

		config.stops.forEach(stop => {
			colors.push(this.parseColorToFloat32(stop.color));
			positions.push(stop.offset);
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

		config.stops.forEach(stop => {
			colors.push(this.parseColorToFloat32(stop.color));
			positions.push(stop.offset);
		});

		return this.canvasKit.Shader.MakeRadialGradient([centerX, centerY], radius, colors, positions, this.canvasKit.TileMode.Clamp);
	}

	createGradient(config: GradientConfig, bounds: { x: number; y: number; width: number; height: number }): Shader {
		if (config.type === "radial") {
			return this.createRadialGradient(config, bounds.x, bounds.y, bounds.width, bounds.height);
		} else {
			return this.createLinearGradient(config, bounds.x, bounds.y, bounds.width, bounds.height);
		}
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

		if (color.startsWith("rgba")) {
			const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*(\d*\.?\d+)?\)/);
			if (match) {
				return this.canvasKit.Color4f(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255, parseFloat(match[4] || "1"));
			}
		}

		if (color.startsWith("rgb")) {
			const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
			if (match) {
				return this.canvasKit.Color4f(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255, 1);
			}
		}

		return this.canvasKit.Color4f(0, 0, 0, 1);
	}
}
