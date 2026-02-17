/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

const globals = {
	"pixi.js": "PIXI",
	howler: "Howler",
	"opentype.js": "opentype",
	"@ffmpeg/ffmpeg": "FFmpeg",
	harfbuzzjs: "createHarfBuzz"
};

export default defineConfig({
	define: {
		// Make process.env.NODE_ENV available in browser for __DEV__ checks
		"process.env.NODE_ENV": JSON.stringify(process.env["NODE_ENV"] || "development")
	},
	worker: {
		format: "es"
	},
	plugins: [
		dts({
			rollupTypes: true,
			outDir: "dist",
			exclude: ["src/main.ts", "src/shotstack-main.ts"],
			pathsToAliases: true
		})
	],
	resolve: {
		alias: {
			"@core": resolve(__dirname, "src/core"),
			"@canvas": resolve(__dirname, "src/components/canvas"),
			"@timeline": resolve(__dirname, "src/components/timeline"),
			"@shared": resolve(__dirname, "src/core/shared"),
			"@schemas": resolve(__dirname, "src/core/schemas"),
			"@timing": resolve(__dirname, "src/core/timing"),
			"@layouts": resolve(__dirname, "src/core/layouts"),
			"@animations": resolve(__dirname, "src/core/animations"),
			"@events": resolve(__dirname, "src/core/events"),
			"@inputs": resolve(__dirname, "src/core/inputs"),
			"@loaders": resolve(__dirname, "src/core/loaders"),
			"@export": resolve(__dirname, "src/core/export"),
			"@styles": resolve(__dirname, "src/styles"),
			"@templates": resolve(__dirname, "src/templates")
		}
	},
	build: {
		target: "esnext",
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			name: "ShotstackStudio",
			fileName: format => `shotstack-studio.${format}.js`,
			formats: ["es", "umd"]
		},
		rollupOptions: {
			external: id => {
				if (id === "pixi.js" || id.startsWith("pixi.js/")) return true;
				return ["harfbuzzjs", "opentype.js", "howler"].includes(id);
			},
			output: {
				globals,
				inlineDynamicImports: true
			}
		}
	}
});
