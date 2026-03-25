import { resolve } from "path";
import type { UserConfig } from "vite";

export const globals: Record<string, string> = {
	"pixi.js": "PIXI",
	"pixi.js/app": "PIXI",
	"pixi.js/events": "PIXI",
	"pixi.js/graphics": "PIXI",
	"pixi.js/text": "PIXI",
	"pixi.js/text-html": "PIXI",
	"pixi.js/sprite-tiling": "PIXI",
	"pixi.js/filters": "PIXI",
	"pixi.js/mesh": "PIXI",
	"pixi-filters": "PIXI",
	howler: "Howler",
	"opentype.js": "opentype",
	"@ffmpeg/ffmpeg": "FFmpeg",
	harfbuzzjs: "createHarfBuzz",
	"@napi-rs/canvas": "Canvas"
};

export function external(id: string): boolean {
	if (id === "pixi.js" || id.startsWith("pixi.js/")) return true;
	if (id === "pixi-filters" || id.startsWith("pixi-filters/")) return true;
	if (id.startsWith("@napi-rs/")) return true;
	return ["harfbuzzjs", "opentype.js", "howler", "canvas"].includes(id);
}

export function aliases(dirname: string): Record<string, string> {
	return {
		"@core": resolve(dirname, "src/core"),
		"@canvas": resolve(dirname, "src/components/canvas"),
		"@timeline": resolve(dirname, "src/components/timeline"),
		"@shared": resolve(dirname, "src/core/shared"),
		"@schemas": resolve(dirname, "src/core/schemas"),
		"@timing": resolve(dirname, "src/core/timing"),
		"@layouts": resolve(dirname, "src/core/layouts"),
		"@animations": resolve(dirname, "src/core/animations"),
		"@events": resolve(dirname, "src/core/events"),
		"@inputs": resolve(dirname, "src/core/inputs"),
		"@loaders": resolve(dirname, "src/core/loaders"),
		"@export": resolve(dirname, "src/core/export"),
		"@styles": resolve(dirname, "src/styles"),
		"@templates": resolve(dirname, "src/templates"),
		"@shotstack/shotstack-canvas": resolve(dirname, "node_modules/@shotstack/shotstack-canvas/dist/entry.web.js")
	};
}

export function sharedConfig(dirname: string): Partial<UserConfig> {
	return {
		define: {
			"process.env.NODE_ENV": JSON.stringify(process.env["NODE_ENV"] || "development")
		},
		worker: {
			format: "es" as const
		},
		resolve: {
			alias: aliases(dirname)
		}
	};
}
