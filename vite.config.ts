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
