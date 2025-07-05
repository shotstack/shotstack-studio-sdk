/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from "vite";
import { resolve } from "path";

const external = ["pixi.js", "howler", "opentype.js", "@ffmpeg/ffmpeg"];

const globals = {
	"pixi.js": "PIXI",
	howler: "Howler",
	"opentype.js": "opentype"
};

export default defineConfig({
	resolve: {
		alias: {
			"@core": resolve(__dirname, "src/core"),
			"@canvas": resolve(__dirname, "src/components/canvas"),
			"@schemas": resolve(__dirname, "src/core/schemas"),
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
			external,
			output: {
				globals
			}
		}
	}
});
