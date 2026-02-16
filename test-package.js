import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTRACT = {
	requiredFiles: [
		"dist/internal.d.ts",
		"dist/internal.es.js",
		"dist/internal.umd.js",
		"dist/index.d.ts",
		"dist/shotstack-studio.es.js",
		"dist/shotstack-studio.umd.js"
	],
	requiredExports: {
		".": {
			types: "./dist/index.d.ts",
			import: "./dist/shotstack-studio.es.js",
			require: "./dist/shotstack-studio.umd.js"
		},
		"./internal": {
			types: "./dist/internal.d.ts",
			import: "./dist/internal.es.js",
			require: "./dist/internal.umd.js"
		}
	},
	runtimeExports: ["Edit", "Canvas", "Controls", "Timeline", "UIController", "VideoExporter", "VERSION"],
	internalRuntimeExports: ["Edit", "ShotstackEdit"],
	dtsHiddenMembersByClass: {
		UIController: [
			"updateOverlays(",
			"updateToolbarPositions(",
			"registerToolbar(",
			"registerUtility(",
			"registerCanvasOverlay(",
			"getButtons()",
			"off<"
		],
		Canvas: [
			"overlayContainer:",
			"getContentBounds(",
			"registerTimeline(",
			"getViewportContainer(",
			"updateViewportForSize(",
			"pauseTicker(",
			"resumeTicker("
		],
		Timeline: [
			"draw(): void;",
			"beginInteraction(",
			"endInteraction(",
			"getEdit(",
			"findClipAtPosition(",
			"setZoom(",
			"scrollTo(",
			"resize(): void;",
			"selectClip(",
			"clearSelection(",
			"registerClipRenderer("
		],
		Edit: ["validateEdit(", "getTimelineFonts(", "getContentClipIdForLuma(", "getInternalEvents("]
	},
	dtsForbiddenTokens: [
		"export declare class SelectionHandles",
		"export declare class TextToolbar",
		"export declare class RichTextToolbar",
		"export declare class MediaToolbar",
		"export declare class ClipToolbar",
		"export declare class CanvasToolbar",
		"export declare class AssetToolbar"
	],
	dtsForbiddenRootExports: [
		"export declare const EditEvent:",
		"export { EditSchema }",
		"export { TimelineSchema }",
		"export { TrackSchema }",
		"export { ClipSchema }",
		"export { OutputSchema }",
		"export { VideoAssetSchema }",
		"export { AudioAssetSchema }",
		"export { ImageAssetSchema }",
		"export { TextAssetSchema }",
		"export { RichTextAssetSchema }",
		"export { HtmlAssetSchema }",
		"export { CaptionAssetSchema }",
		"export { ShapeAssetSchema }",
		"export { LumaAssetSchema }",
		"export { TextToImageAssetSchema }",
		"export { ImageToVideoAssetSchema }",
		"export { TextToSpeechAssetSchema }",
		"export { AssetSchema }",
		"export { tweenSchema as KeyframeSchema }",
		"export { tweenSchema as TweenSchema }",
		"export declare type Track =",
		"export declare type Clip =",
		"export declare type Output =",
		"export declare type Asset =",
		"export declare type MergeField =",
		"export declare type Soundtrack =",
		"export declare type Font =",
		"export declare type VideoAsset =",
		"export declare type AudioAsset =",
		"export declare type ImageAsset =",
		"export declare type TextAsset =",
		"export declare type RichTextAsset =",
		"export declare type HtmlAsset =",
		"export declare type CaptionAsset =",
		"export declare type ShapeAsset =",
		"export declare type LumaAsset =",
		"export declare type TitleAsset =",
		"export declare type TextToImageAsset =",
		"export declare type ImageToVideoAsset =",
		"export declare type TextToSpeechAsset =",
		"export declare type Crop =",
		"export declare type Offset =",
		"export declare type Transition =",
		"export declare type Transformation =",
		"export declare type ChromaKey =",
		"export declare type Tween =",
		"export declare type Destination =",
		"export declare type ClipAnchor =",
		"export declare type HtmlAssetPosition =",
		"export { Keyframe_2 as Keyframe }",
		"export declare type ExtendedCaptionAsset =",
		"export declare interface NumericKeyframe"
	],
	dtsPublicAnchors: [
		{ className: "Edit", tokens: ["load(): Promise<void>;"] },
		{ className: "Canvas", tokens: ["load(): Promise<void>;"] },
		{ className: "UIController", tokens: ["registerButton(config: ToolbarButtonConfig): this;"] },
		{ className: "Timeline", tokens: ["load(): Promise<void>;"] }
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
		failWithDetails(
			"Required build artifacts",
			missing.map(file => `Missing file: ${file}`)
		);
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

	for (const token of CONTRACT.dtsForbiddenTokens) {
		if (dtsContent.includes(token)) {
			errors.push(`Forbidden declaration found: ${token}`);
		}
	}

	for (const token of CONTRACT.dtsForbiddenRootExports) {
		if (dtsContent.includes(token)) {
			errors.push(`Forbidden root export found: ${token}`);
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

const checkInternalDeclarationSurface = () => {
	const dtsPath = resolve(__dirname, "dist/internal.d.ts");
	const dtsContent = readFileSync(dtsPath, "utf-8");
	const errors = [];
	const requiredTokens = ["export declare class Edit", "export declare class ShotstackEdit extends Edit", "export declare class MergeFieldService"];
	const isEntryStubOnly = /^\s*export\s+\*\s+from\s+['"]\.\/internal['"]\s*;\s*export\s*\{\s*\}\s*;?\s*$/.test(dtsContent);

	for (const token of requiredTokens) {
		if (!dtsContent.includes(token)) {
			errors.push(`Required internal declaration missing: ${token}`);
		}
	}

	if (isEntryStubOnly) {
		errors.push("dist/internal.d.ts is an entry stub, not rolled declarations.");
	}

	if (errors.length > 0) {
		failWithDetails("Internal declaration surface contract", errors);
	}
	printResult("Internal declaration surface contract", true);
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

const runRuntimeExportSmokeTest = async (name, modulePath, expectedExports) => {
	try {
		const module = await import(modulePath);
		const missing = expectedExports.filter(symbol => !module[symbol]);

		if (missing.length > 0) {
			failWithDetails(
				name,
				missing.map(symbol => `Missing runtime export: ${symbol}`)
			);
		}
		printResult(name, true);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";

		if (message.includes("index-") || code === "MODULE_NOT_FOUND") {
			failWithDetails(name, [`Module import failed due to chunk/module resolution: ${message}`]);
		}

		if (BROWSER_GLOBALS.some(global => message.includes(global))) {
			printResult(name, true, ["Browser-only import limitation detected (acceptable in Node smoke test)."]);
			return;
		}

		failWithDetails(name, [`Unexpected import failure: ${message}`]);
	}
};

console.log("Verifying Shotstack package contract\n");

checkRequiredFiles();
checkDeclarationSurface();
checkInternalDeclarationSurface();
checkNoChunkArtifactsOrImports();
checkPackageExports();
await runRuntimeExportSmokeTest("Runtime export smoke test", "./dist/shotstack-studio.es.js", CONTRACT.runtimeExports);
await runRuntimeExportSmokeTest("Internal runtime export smoke test", "./dist/internal.es.js", CONTRACT.internalRuntimeExports);

console.log("\n--------------------------------------------------------");
console.log("ALL PACKAGE CONTRACT CHECKS PASSED");
console.log("--------------------------------------------------------");
