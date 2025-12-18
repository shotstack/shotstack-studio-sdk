import { describe, it, expect } from "@jest/globals";
// @ts-expect-error - Jest transforms this via moduleNameMapper to css-inline.js mock
import styles from "../src/styles/index.css?inline";

describe("CSS Class Coverage", () => {
	describe("Toolbar classes", () => {
		it("contains core toolbar classes", () => {
			expect(styles).toContain(".ss-toolbar");
			expect(styles).toContain(".ss-toolbar-btn");
			expect(styles).toContain(".ss-toolbar-popup");
		});

		it("contains rich text toolbar classes", () => {
			expect(styles).toContain(".ss-toolbar-color");
			expect(styles).toContain(".ss-toolbar-slider");
		});

		it("contains asset toolbar classes", () => {
			expect(styles).toContain(".ss-asset-toolbar");
			expect(styles).toContain(".ss-asset-toolbar-btn");
		});
	});

	describe("Timeline classes", () => {
		it("contains timeline container classes", () => {
			expect(styles).toContain(".ss-html-timeline");
			expect(styles).toContain(".ss-ruler-tracks-wrapper");
		});

		it("contains track classes", () => {
			expect(styles).toContain(".ss-tracks-content");
			expect(styles).toContain(".ss-track");
			expect(styles).toContain(".ss-clip");
		});

		it("contains playhead classes", () => {
			expect(styles).toContain(".ss-playhead");
			expect(styles).toContain(".ss-playhead-ghost");
		});

		it("contains ruler classes", () => {
			expect(styles).toContain(".ss-timeline-ruler");
			expect(styles).toContain(".ss-ruler-content");
		});

		it("contains toolbar component classes", () => {
			expect(styles).toContain(".ss-timeline-toolbar");
			expect(styles).toContain(".ss-time-display");
		});
	});

	describe("Color picker classes", () => {
		it("contains font color picker classes", () => {
			expect(styles).toContain(".ss-font-color-picker");
			expect(styles).toContain(".ss-font-color-tab");
			expect(styles).toContain(".ss-gradient-swatch");
		});

		it("contains background color picker classes", () => {
			expect(styles).toContain(".ss-color-picker");
			expect(styles).toContain(".ss-color-picker-color");
			expect(styles).toContain(".ss-color-picker-opacity");
		});
	});

	describe("Animation/transition/effect classes", () => {
		it("contains animation preset classes", () => {
			expect(styles).toContain(".ss-animation-presets");
			expect(styles).toContain(".ss-animation-preset");
		});

		it("contains transition classes", () => {
			expect(styles).toContain(".ss-transition-tabs");
			expect(styles).toContain(".ss-transition-tab");
			expect(styles).toContain(".ss-transition-effects");
		});

		it("contains effect classes", () => {
			expect(styles).toContain(".ss-effect-types");
			expect(styles).toContain(".ss-effect-type");
			expect(styles).toContain(".ss-effect-variant");
		});
	});

	describe("Canvas toolbar classes", () => {
		it("contains canvas toolbar classes", () => {
			expect(styles).toContain(".ss-canvas-toolbar");
			expect(styles).toContain(".ss-canvas-toolbar-btn");
		});
	});

	describe("Media toolbar classes", () => {
		it("contains media toolbar classes", () => {
			expect(styles).toContain(".ss-media-toolbar");
			expect(styles).toContain(".ss-media-toolbar-btn");
		});
	});
});
