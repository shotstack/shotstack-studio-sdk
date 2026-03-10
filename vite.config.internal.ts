/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

const globals = {
	"pixi.js": "PIXI",
	howler: "Howler",
	"opentype.js": "opentype",
	"@ffmpeg/ffmpeg": "FFmpeg",
	harfbuzzjs: "createHarfBuzz",
	"@napi-rs/canvas": "Canvas"
};
const INTERNAL_TYPES_ENTRY_STUB = "export * from './internal'";

export default defineConfig({
	define: {
		"process.env.NODE_ENV": JSON.stringify(process.env["NODE_ENV"] || "development")
	},
	worker: {
		format: "es"
	},
	plugins: [
		dts({
			rollupTypes: true,
			outDir: "dist",
			include: ["src/internal.ts", "src/core/**/*.ts"],
			pathsToAliases: true,
			entryRoot: "src",
			beforeWriteFile: (filePath, content) => {
				if (!filePath.endsWith("/dist/index.d.ts")) {
					return { filePath, content };
				}

				if (content.includes(INTERNAL_TYPES_ENTRY_STUB)) {
					return { filePath, content };
				}

				return {
					filePath: filePath.replace(/\/index\.d\.ts$/, "/internal.d.ts"),
					content
				};
			}
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
			"@templates": resolve(__dirname, "src/templates"),
			"@shotstack/shotstack-canvas": resolve(__dirname, "node_modules/@shotstack/shotstack-canvas/dist/entry.web.js")
		}
	},
	build: {
		target: "esnext",
		emptyOutDir: false,
		lib: {
			entry: resolve(__dirname, "src/internal.ts"),
			name: "ShotstackStudioInternal",
			fileName: format => `internal.${format}.js`,
			formats: ["es", "umd"]
		},
		rollupOptions: {
			external: id => {
				if (id === "pixi.js" || id.startsWith("pixi.js/")) return true;
				if (id.startsWith("@napi-rs/")) return true;
				return ["harfbuzzjs", "opentype.js", "howler", "canvas"].includes(id);
			},
			output: {
				globals,
				inlineDynamicImports: true
			}
		}
	}
});
