import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

const external = ["zod"];

const globals = {
	zod: "zod"
};

export default defineConfig({
	plugins: [
		dts({
			rollupTypes: true,
			outDir: "dist/schema",
			include: ["src/schema.ts", "src/core/schemas/**/*.ts"],
			pathsToAliases: true
		})
	],
	resolve: {
		alias: {
			"@schemas": resolve(__dirname, "src/core/schemas")
		}
	},
	build: {
		target: "esnext",
		outDir: "dist/schema",
		lib: {
			entry: resolve(__dirname, "src/schema.ts"),
			name: "ShotstackStudioSchema",
			fileName: format => `index.${format === "es" ? "mjs" : "js"}`,
			formats: ["es", "cjs"]
		},
		rollupOptions: {
			external,
			output: {
				globals,
				preserveModules: false,
				exports: "named"
			}
		}
	}
});
