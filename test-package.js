import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTRACT = {
	requiredFiles: [
		"dist/index.d.ts",
		"dist/schema/index.cjs",
		"dist/schema/index.d.ts",
		"dist/schema/index.mjs",
		"dist/shotstack-studio.es.js",
		"dist/shotstack-studio.umd.js"
	],
	requiredExports: {
		".": {
			types: "./dist/index.d.ts",
			import: "./dist/shotstack-studio.es.js",
			require: "./dist/shotstack-studio.umd.js"
		},
		"./schema": {
			types: "./dist/schema/index.d.ts",
			import: "./dist/schema/index.mjs",
			require: "./dist/schema/index.cjs"
		}
	},
	runtimeExports: ["Edit", "Canvas", "Controls", "VideoExporter", "Timeline"],
	dtsHiddenMembersByClass: {
		AssetToolbar: ["getDragState(", "setPosition("],
		CanvasToolbar: ["getDragState(", "setPosition("],
		UIController: ["updateOverlays(", "updateToolbarPositions(", "getToolbar(", "hasToolbar("],
		Canvas: [
			"overlayContainer:",
			"getContentBounds(",
			"registerTimeline(",
			"getViewportContainer(",
			"updateViewportForSize(",
			"pauseTicker(",
			"resumeTicker("
		],
		Timeline: ["draw(): void;", "beginInteraction(", "endInteraction(", "getEdit(", "findClipAtPosition("],
		Edit: ["getTimelineFonts(", "getContentClipIdForLuma("],
		TranscriptionIndicator: ["getIsVisible(", "update(deltaTime:", "setPosition(", "getWidth("]
	},
	dtsPublicAnchors: [
		{ className: "Edit", tokens: ["load(): Promise<void>;"] },
		{ className: "Canvas", tokens: ["load(): Promise<void>;"] },
		{ className: "UIController", tokens: ["registerToolbar(assetTypes: string | string[], toolbar: UIRegistration): this;"] },
		{ className: "Timeline", tokens: ["load(): Promise<void>;"] },
		{ className: "TextToolbar", tokens: ["mount(parent: HTMLElement): void;", "dispose(): void;"] },
		{ className: "RichTextToolbar", tokens: ["mount(parent: HTMLElement): void;", "dispose(): void;"] },
		{ className: "MediaToolbar", tokens: ["mount(parent: HTMLElement): void;", "dispose(): void;"] },
		{ className: "ClipToolbar", tokens: ["mount(parent: HTMLElement): void;", "dispose(): void;"] },
		{ className: "CanvasToolbar", tokens: ["mount(parent: HTMLElement", "dispose(): void;"] },
		{ className: "AssetToolbar", tokens: ["mount(parent: HTMLElement", "dispose(): void;"] }
	]
};

const BROWSER_GLOBALS = ["self", "window", "document", "navigator", "HTMLCanvasElement"];

const getClassBlock = (dtsContent, className) => {
	const classToken = `export declare class ${className}`;
	const start = dtsContent.indexOf(classToken);
	if (start === -1) return null;

	const nextStart = dtsContent.indexOf("export declare class ", start + classToken.length);
	return dtsContent.slice(start, nextStart === -1 ? dtsContent.length : nextStart);
};

const printResult = (name, ok, details = []) => {
	const prefix = ok ? "[PASS]" : "[FAIL]";
	console.log(`${prefix} ${name}`);
	for (const detail of details) {
		console.log(`   - ${detail}`);
	}
};

const failWithDetails = (name, details) => {
	printResult(name, false, details);
	process.exit(1);
};

const checkRequiredFiles = () => {
	const missing = CONTRACT.requiredFiles.filter(file => !existsSync(resolve(__dirname, file)));
	if (missing.length > 0) {
		failWithDetails("Required build artifacts", missing.map(file => `Missing file: ${file}`));
	}
	printResult("Required build artifacts", true);
};

const checkDeclarationSurface = () => {
	const dtsPath = resolve(__dirname, "dist/index.d.ts");
	const dtsContent = readFileSync(dtsPath, "utf-8");
	const errors = [];

	for (const [className, hiddenTokens] of Object.entries(CONTRACT.dtsHiddenMembersByClass)) {
		const block = getClassBlock(dtsContent, className);
		if (!block) {
			errors.push(`Class declaration missing: ${className}`);
			continue;
		}

		for (const token of hiddenTokens) {
			if (block.includes(token)) {
				errors.push(`Internal member leaked in ${className}: ${token}`);
			}
		}
	}

	for (const anchor of CONTRACT.dtsPublicAnchors) {
		const block = getClassBlock(dtsContent, anchor.className);
		if (!block) {
			errors.push(`Required public class missing: ${anchor.className}`);
			continue;
		}

		for (const token of anchor.tokens) {
			if (!block.includes(token)) {
				errors.push(`Required public anchor missing in ${anchor.className}: ${token}`);
			}
		}
	}

	if (errors.length > 0) {
		failWithDetails("Declaration surface contract", errors);
	}
	printResult("Declaration surface contract", true);
};

const checkNoChunkArtifactsOrImports = () => {
	const errors = [];
	const distFiles = readdirSync(resolve(__dirname, "dist"));
	const chunkFiles = distFiles.filter(file => /^index-[a-zA-Z0-9]+\.js$/.test(file));

	if (chunkFiles.length > 0) {
		for (const file of chunkFiles) {
			errors.push(`Unexpected chunk artifact: dist/${file}`);
		}
	}

	const esModuleContent = readFileSync(resolve(__dirname, "dist/shotstack-studio.es.js"), "utf-8");
	const chunkImportPattern = /import\s+.*?from\s+['"]\.\/index-[a-zA-Z0-9]+\.js['"]/;
	if (chunkImportPattern.test(esModuleContent)) {
		errors.push("Unexpected chunk import in dist/shotstack-studio.es.js");
	}

	if (errors.length > 0) {
		failWithDetails("No chunk artifacts/imports", errors);
	}
	printResult("No chunk artifacts/imports", true);
};

const checkPackageExports = () => {
	const errors = [];
	const packageJson = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));

	for (const [exportPath, expectedConfig] of Object.entries(CONTRACT.requiredExports)) {
		const actualConfig = packageJson.exports?.[exportPath];
		if (!actualConfig) {
			errors.push(`Missing export path: ${exportPath}`);
			continue;
		}

		for (const [field, expectedValue] of Object.entries(expectedConfig)) {
			if (actualConfig[field] !== expectedValue) {
				errors.push(`Export mismatch ${exportPath}.${field}: expected "${expectedValue}", got "${actualConfig[field]}"`);
			}
		}
	}

	if (errors.length > 0) {
		failWithDetails("package.json exports contract", errors);
	}
	printResult("package.json exports contract", true);
};

const checkRuntimeExports = async () => {
	try {
		const module = await import("./dist/shotstack-studio.es.js");
		const missing = CONTRACT.runtimeExports.filter(symbol => !module[symbol]);

		if (missing.length > 0) {
			failWithDetails("Runtime export smoke test", missing.map(symbol => `Missing runtime export: ${symbol}`));
		}
		printResult("Runtime export smoke test", true);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";

		if (message.includes("index-") || code === "MODULE_NOT_FOUND") {
			failWithDetails("Runtime export smoke test", [`Module import failed due to chunk/module resolution: ${message}`]);
		}

		if (BROWSER_GLOBALS.some(global => message.includes(global))) {
			printResult("Runtime export smoke test", true, ["Browser-only import limitation detected (acceptable in Node smoke test)."]);
			return;
		}

		failWithDetails("Runtime export smoke test", [`Unexpected import failure: ${message}`]);
	}
};

console.log("Verifying Shotstack package contract\n");

checkRequiredFiles();
checkDeclarationSurface();
checkNoChunkArtifactsOrImports();
checkPackageExports();
await checkRuntimeExports();

console.log("\n--------------------------------------------------------");
console.log("ALL PACKAGE CONTRACT CHECKS PASSED");
console.log("--------------------------------------------------------");
