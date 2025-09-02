import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./test/setup.ts"],

		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html", "lcov"],
			exclude: ["node_modules/**", "dist/**", "**/*.d.ts", "**/*.config.*", "**/mockData/**", "test/**"],
			thresholds: {
				global: {
					branches: 80,
					functions: 80,
					lines: 80,
					statements: 80
				}
			}
		},

		testTimeout: 20000,
		hookTimeout: 20000,

		reporters: ["verbose"],

		watch: false,

		mockReset: true,
		clearMocks: true,
		restoreMocks: true,

		retry: 2,

		include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
		exclude: ["node_modules", "dist", ".idea", ".git", ".cache"]
	},

	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@core": path.resolve(__dirname, "./src/core"),
			"@components": path.resolve(__dirname, "./src/components"),
			"@utils": path.resolve(__dirname, "./src/utils")
		}
	},

	optimizeDeps: {
		include: ["canvas", "canvaskit-wasm"],
		exclude: ["gsap"]
	},

	define: {
		"process.env.NODE_ENV": '"test"'
	}
});
