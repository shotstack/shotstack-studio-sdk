import { EventEmitter } from "../src/core/events/event-emitter";
import { MergeFieldService } from "../src/core/merge/merge-field-service";

import type { EditEventMap } from "../src/core/events/edit-events";

function serviceWith(fields: Record<string, string>): MergeFieldService {
	const service = new MergeFieldService(new EventEmitter<EditEventMap>());
	Object.entries(fields).forEach(([name, defaultValue]) => service.register({ name, defaultValue }, { silent: true }));
	return service;
}

describe("MergeFieldService.resolveToNumber", () => {
	it("converts a template that resolves to a bare number", () => {
		expect(serviceWith({ WIDTH: "1920" }).resolveToNumber("{{ WIDTH }}")).toBe(1920);
		expect(serviceWith({ SCALE: " 2.5 " }).resolveToNumber("{{ SCALE }}")).toBe(2.5);
	});

	it("returns null when the resolved text merely starts with digits", () => {
		const service = serviceWith({ SUBJECT: "a red apple" });

		expect(service.resolveToNumber("03 image pending, merge field {{ SUBJECT }}")).toBeNull();
		expect(service.resolveToNumber("{{ SUBJECT }} 42")).toBeNull();
	});

	it("returns null for text that resolves to an empty string", () => {
		expect(serviceWith({ EMPTY: "" }).resolveToNumber("{{ EMPTY }}")).toBeNull();
	});

	it("returns null for a non-template input", () => {
		expect(serviceWith({ WIDTH: "1920" }).resolveToNumber("1920")).toBeNull();
	});
});
