/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import { globals, external, sharedConfig } from "./vite.shared";

const shared = sharedConfig(__dirname);

export default defineConfig({
	...shared,
	plugins: [
		dts({
			rollupTypes: true,
			outDir: "dist",
			exclude: ["src/main.ts", "src/shotstack-main.ts"],
			pathsToAliases: true
		})
	],
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
				globals,
				inlineDynamicImports: true
			}
		}
	}
});
