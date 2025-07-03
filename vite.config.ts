import { defineConfig } from "vite";
import { resolve } from "path";

const external = [
	"pixi.js", 
	"howler", 
	"opentype.js",
	"@ffmpeg/ffmpeg"
];

const globals = {
	"pixi.js": "PIXI",
	howler: "Howler",
	"opentype.js": "opentype"
};

export default defineConfig({
	resolve: {
		alias: {
			"@edit": resolve(__dirname, "src/core/edit"),
			"@preview": resolve(__dirname, "src/core/preview"),
			"@timeline": resolve(__dirname, "src/core/timeline"),
			"@shared": resolve(__dirname, "src/core/shared"),
			"@inputs": resolve(__dirname, "src/core/inputs"),
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
		},
	}
});
