/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { injectShotstackStyles, resetStyleInjection } from "../src/styles/inject";

describe("Style Injection", () => {
	beforeEach(() => resetStyleInjection());
	afterEach(() => resetStyleInjection());

	it("creates style element with correct ID", () => {
		injectShotstackStyles();
		const el = document.getElementById("shotstack-studio-styles");
		expect(el).not.toBeNull();
		expect(el?.tagName).toBe("STYLE");
	});

	it("injects non-empty CSS content", () => {
		injectShotstackStyles();
		const el = document.getElementById("shotstack-studio-styles");
		expect(el?.textContent?.length).toBeGreaterThan(100);
	});

	it("appends style element to document head", () => {
		injectShotstackStyles();
		const el = document.getElementById("shotstack-studio-styles");
		expect(el?.parentElement).toBe(document.head);
	});

	it("is idempotent - multiple calls create one element", () => {
		injectShotstackStyles();
		injectShotstackStyles();
		injectShotstackStyles();
		const elements = document.querySelectorAll("#shotstack-studio-styles");
		expect(elements.length).toBe(1);
	});

	it("resetStyleInjection removes the element", () => {
		injectShotstackStyles();
		expect(document.getElementById("shotstack-studio-styles")).not.toBeNull();
		resetStyleInjection();
		expect(document.getElementById("shotstack-studio-styles")).toBeNull();
	});

	it("can re-inject after reset", () => {
		injectShotstackStyles();
		resetStyleInjection();
		injectShotstackStyles();
		expect(document.getElementById("shotstack-studio-styles")).not.toBeNull();
	});

	it("handles pre-existing style element gracefully", () => {
		// Simulate external code adding the element
		const existing = document.createElement("style");
		existing.id = "shotstack-studio-styles";
		existing.textContent = "/* external */";
		document.head.appendChild(existing);

		// Should not throw or create duplicate
		injectShotstackStyles();
		const elements = document.querySelectorAll("#shotstack-studio-styles");
		expect(elements.length).toBe(1);
	});
});
