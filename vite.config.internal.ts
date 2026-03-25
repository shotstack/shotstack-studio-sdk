/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import { globals, external, sharedConfig } from "./vite.shared";

const shared = sharedConfig(__dirname);
const INTERNAL_TYPES_ENTRY_STUB = "export * from './internal'";

export default defineConfig({
	...shared,
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
			external,
			output: {
				globals,
				inlineDynamicImports: true
			}
		}
	}
});
