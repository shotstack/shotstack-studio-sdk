import { existsSync, readFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🧪 Testing Shotstack Studio SDK Package Build\n");

console.log("📦 Test 1: Checking required package files exist...");
const requiredFiles = [
	"dist/shotstack-studio.es.js",
	"dist/shotstack-studio.umd.js",
	"dist/index.d.ts",
	"dist/schema/index.mjs",
	"dist/schema/index.cjs",
	"dist/schema/index.d.ts"
];

let allFilesExist = true;
requiredFiles.forEach(file => {
	const fullPath = resolve(__dirname, file);
	const exists = existsSync(fullPath);
	if (exists) {
		const size = statSync(fullPath).size;
		const sizeKB = (size / 1024).toFixed(2);
		console.log(`   ✅ ${file} (${sizeKB} KB)`);
	} else {
		console.log(`   ❌ ${file} - MISSING!`);
		allFilesExist = false;
	}
});

if (!allFilesExist) {
	console.error("\n❌ Test 1 FAILED: Some required files are missing\n");
	process.exit(1);
}
console.log("   ✅ Test 1 PASSED: All required files exist\n");

console.log("🧬 Test 1b: Checking declaration surface...");
const dtsPath = resolve(__dirname, "dist/index.d.ts");
const dtsContent = readFileSync(dtsPath, "utf-8");

const getClassBlock = className => {
	const classToken = `export declare class ${className}`;
	const start = dtsContent.indexOf(classToken);
	if (start === -1) return null;

	const nextStart = dtsContent.indexOf("export declare class ", start + classToken.length);
	const end = nextStart === -1 ? dtsContent.length : nextStart;
	return dtsContent.slice(start, end);
};

const hiddenMemberChecks = [
	{ className: "AssetToolbar", tokens: ["getDragState(", "setPosition("] },
	{ className: "CanvasToolbar", tokens: ["getDragState(", "setPosition("] },
	{ className: "UIController", tokens: ["updateOverlays(", "updateToolbarPositions(", "getToolbar(", "hasToolbar("] },
	{
		className: "Canvas",
		tokens: [
			"overlayContainer:",
			"getContentBounds(",
			"registerTimeline(",
			"getViewportContainer(",
			"updateViewportForSize(",
			"pauseTicker(",
			"resumeTicker("
		]
	},
	{ className: "Timeline", tokens: ["draw(): void;", "beginInteraction(", "endInteraction(", "getEdit(", "findClipAtPosition("] },
	{ className: "Edit", tokens: ["getTimelineFonts(", "getContentClipIdForLuma("] },
	{ className: "TranscriptionIndicator", tokens: ["getIsVisible(", "update(deltaTime:", "setPosition(", "getWidth("] }
];

let declarationSurfaceValid = true;
for (const check of hiddenMemberChecks) {
	const block = getClassBlock(check.className);
	if (!block) {
		console.log(`   ❌ Missing class declaration: ${check.className}`);
		declarationSurfaceValid = false;
		continue;
	}

	for (const token of check.tokens) {
		if (block.includes(token)) {
			console.log(`   ❌ Internal member leaked in ${check.className}: ${token}`);
			declarationSurfaceValid = false;
		}
	}
}

const requiredPublicChecks = [
	{ className: "Edit", tokens: ["load(): Promise<void>;", "getEdit(): Edit_2;"] },
	{ className: "Canvas", tokens: ["load(): Promise<void>;", "zoomToFit(padding?: number): void;"] },
	{
		className: "UIController",
		tokens: [
			"registerToolbar(assetTypes: string | string[], toolbar: UIRegistration): this;",
			"mount(container: HTMLElement): void;",
			"registerButton(config: ToolbarButtonConfig): this;"
		]
	},
	{ className: "Timeline", tokens: ["load(): Promise<void>;", "setZoom(pixelsPerSecond: number): void;"] },
	{ className: "TextToolbar", tokens: ["mount(parent: HTMLElement): void;", "dispose(): void;"] },
	{ className: "RichTextToolbar", tokens: ["mount(parent: HTMLElement): void;", "dispose(): void;"] },
	{ className: "MediaToolbar", tokens: ["mount(parent: HTMLElement): void;", "dispose(): void;"] },
	{ className: "ClipToolbar", tokens: ["mount(parent: HTMLElement): void;", "dispose(): void;"] },
	{ className: "CanvasToolbar", tokens: ["mount(parent: HTMLElement", "dispose(): void;"] },
	{ className: "AssetToolbar", tokens: ["mount(parent: HTMLElement", "dispose(): void;"] }
];

for (const check of requiredPublicChecks) {
	const block = getClassBlock(check.className);
	if (!block) {
		console.log(`   ❌ Missing required public class: ${check.className}`);
		declarationSurfaceValid = false;
		continue;
	}

	for (const token of check.tokens) {
		if (!block.includes(token)) {
			console.log(`   ❌ Missing required public API in ${check.className}: ${token}`);
			declarationSurfaceValid = false;
		}
	}
}

if (!declarationSurfaceValid) {
	console.error("\n❌ Test 1b FAILED: Declaration surface guard failed\n");
	process.exit(1);
}
console.log("   ✅ Test 1b PASSED: Declaration surface is locked\n");

console.log("🔍 Test 2: Checking for unwanted chunk files...");
const distPath = resolve(__dirname, "dist");
const fs = await import("fs");
const distFiles = fs.readdirSync(distPath);
const chunkFiles = distFiles.filter(file => file.match(/^index-[a-zA-Z0-9]+\.js$/));

if (chunkFiles.length > 0) {
	console.log(`   ❌ Found ${chunkFiles.length} chunk file(s):`);
	chunkFiles.forEach(file => console.log(`      - ${file}`));
	console.error("\n❌ Test 2 FAILED: Chunk files should not exist (should be inlined)\n");
	process.exit(1);
}
console.log("   ✅ Test 2 PASSED: No chunk files found (all code is inlined)\n");

console.log("📝 Test 3: Checking ES module for chunk imports...");
const esModulePath = resolve(__dirname, "dist/shotstack-studio.es.js");
const esModuleContent = readFileSync(esModulePath, "utf-8");

const chunkImportPattern = /import\s+.*?from\s+['"]\.\/index-[a-zA-Z0-9]+\.js['"]/;
const hasChunkImports = chunkImportPattern.test(esModuleContent);

if (hasChunkImports) {
	const matches = esModuleContent.match(chunkImportPattern);
	console.log(`   ❌ Found chunk import in ES module:`);
	console.log(`      ${matches[0]}`);
	console.error("\n❌ Test 3 FAILED: ES module should not import chunk files\n");
	process.exit(1);
}
console.log("   ✅ Test 3 PASSED: ES module is self-contained (no chunk imports)\n");

console.log("📊 Test 4: Checking file sizes are reasonable...");
const esModuleSize = statSync(esModulePath).size;
const esModuleSizeKB = (esModuleSize / 1024).toFixed(2);
const esModuleSizeMB = (esModuleSize / 1024 / 1024).toFixed(2);

if (esModuleSize < 100 * 1024) {
	console.log(`   ⚠️  ES module size is very small (${esModuleSizeKB} KB)`);
	console.log("      This might indicate the code is not fully inlined");
	console.error("\n❌ Test 4 FAILED: ES module size is suspiciously small\n");
	process.exit(1);
}

console.log(`   ✅ ES module size: ${esModuleSizeMB} MB (${esModuleSizeKB} KB)`);
console.log("   ✅ Test 4 PASSED: File size is reasonable\n");

console.log("📋 Test 5: Checking package.json exports configuration...");
const packageJsonPath = resolve(__dirname, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

const requiredExports = {
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
};

let exportsValid = true;
for (const [exportPath, exportConfig] of Object.entries(requiredExports)) {
	if (!packageJson.exports[exportPath]) {
		console.log(`   ❌ Missing export: "${exportPath}"`);
		exportsValid = false;
		continue;
	}

	for (const [key, value] of Object.entries(exportConfig)) {
		const actualValue = packageJson.exports[exportPath][key];
		if (actualValue !== value) {
			console.log(`   ❌ Export "${exportPath}.${key}" is "${actualValue}", expected "${value}"`);
			exportsValid = false;
		}
	}
}

if (!exportsValid) {
	console.error("\n❌ Test 5 FAILED: package.json exports are not configured correctly\n");
	process.exit(1);
}
console.log("   ✅ Test 5 PASSED: package.json exports are configured correctly\n");

console.log("🚀 Test 6: Testing dynamic import (simulates Next.js)...");
try {
	const module = await import("./dist/shotstack-studio.es.js");

	const expectedExports = ["Edit", "Canvas", "Controls", "VideoExporter", "Timeline"];
	const missingExports = expectedExports.filter(exp => !module[exp]);

	if (missingExports.length > 0) {
		console.log(`   ❌ Missing exports: ${missingExports.join(", ")}`);
		console.error("\n❌ Test 6 FAILED: Some expected exports are missing\n");
		process.exit(1);
	}

	console.log("   ✅ Successfully imported module");
	console.log(`   ✅ Found expected exports: ${expectedExports.join(", ")}`);
	console.log("   ✅ Test 6 PASSED: Module can be imported successfully\n");
} catch (error) {
	if (error.message.includes("index-") || error.code === "MODULE_NOT_FOUND") {
		console.log(`   ❌ Failed to import module: ${error.message}`);
		console.log("   ⚠️  Error indicates missing chunk files - build configuration needs fixing!");
		console.error("\n❌ Test 6 FAILED: Could not import the module\n");
		process.exit(1);
	}

	const browserGlobals = ["self", "window", "document", "navigator", "HTMLCanvasElement"];
	const isBrowserError = browserGlobals.some(global => error.message.includes(global));

	if (isBrowserError) {
		console.log(`   ⚠️  Import failed due to browser-specific code: ${error.message}`);
		console.log("   ℹ️  This is EXPECTED - the library requires a browser environment");
		console.log("   ✅ No chunk file errors detected");
		console.log("   ✅ Test 6 PASSED: Module structure is correct (browser-only limitation)\n");
	} else {
		console.log(`   ❌ Failed to import module: ${error.message}`);
		console.error("\n❌ Test 6 FAILED: Unexpected import error\n");
		process.exit(1);
	}
}

console.log("════════════════════════════════════════════════════════");
console.log("✅ ALL TESTS PASSED!");
console.log("════════════════════════════════════════════════════════");
console.log("\n📦 The package is ready for publishing and use in Next.js");
console.log("   No chunk file issues detected!");
console.log("   All imports are self-contained.\n");
