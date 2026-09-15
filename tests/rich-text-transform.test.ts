/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first */

jest.mock("pixi.js", () => ({}));
jest.mock("../src/components/canvas/players/player", () => ({
	Player: class MockPlayer {},
	PlayerType: {}
}));
jest.mock("../src/core/edit-session", () => ({}));
jest.mock("../src/core/shotstack-edit", () => ({
	ShotstackEdit: class MockShotstackEdit {}
}));
jest.mock("@styles/inject", () => ({
	injectShotstackStyles: jest.fn()
}));

import type { Edit } from "@core/edit-session";
import { RichTextToolbar } from "@core/ui/rich-text-toolbar";

function createMockEdit(asset: Record<string, unknown>) {
	const clip = { id: "clip-1", start: 0, length: 5, asset };
	return {
		getClipId: jest.fn().mockReturnValue("clip-1"),
		getClip: jest.fn().mockReturnValue(clip),
		getPlayerClip: jest.fn().mockReturnValue(null),
		getResolvedClip: jest.fn().mockReturnValue(clip),
		getDocumentClip: jest.fn().mockReturnValue(clip),
		getDocument: jest.fn(() => ({
			getFonts: jest.fn(() => []),
			getClipBinding: jest.fn(() => null)
		})),
		updateClip: jest.fn(),
		deleteClip: jest.fn(),
		canDeleteClip: jest.fn(() => true),
		getInternalEvents: jest.fn(() => ({ on: jest.fn(), off: jest.fn() })),
		events: { on: jest.fn(), off: jest.fn() },
		getEdit: jest.fn(() => ({ timeline: { fonts: [], tracks: [] } })),
		getFontMetadata: jest.fn(() => new Map()),
		mergeFields: { getAll: jest.fn(() => []) }
	};
}

describe("RichTextToolbar text transform", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("writes textTransform on asset.style for rich-text clips", () => {
		const edit = createMockEdit({
			type: "rich-text",
			text: "Hello",
			font: { family: "Open Sans", size: 48, color: "#ffffff" },
			style: { letterSpacing: 0, lineHeight: 1.2, textTransform: "none", textDecoration: "none" }
		});
		const container = document.createElement("div");
		document.body.appendChild(container);
		const toolbar = new RichTextToolbar(edit as unknown as Edit);
		toolbar.mount(container);
		toolbar.show(0, 0);

		const btn = container.querySelector('[data-action="transform"]') as HTMLButtonElement;
		btn.click();

		expect(edit.updateClip).toHaveBeenCalledWith(
			0,
			0,
			expect.objectContaining({
				asset: expect.objectContaining({
					style: expect.objectContaining({ textTransform: "uppercase" })
				})
			})
		);

		toolbar.dispose();
	});

	it("does not write style onto text assets (Zod rejects unrecognized style)", () => {
		const edit = createMockEdit({
			type: "text",
			text: "Hello",
			font: { family: "Open Sans", size: 48, color: "#ffffff" }
		});
		const container = document.createElement("div");
		document.body.appendChild(container);
		const toolbar = new RichTextToolbar(edit as unknown as Edit);
		toolbar.mount(container);
		toolbar.show(0, 0);

		const btn = container.querySelector('[data-action="transform"]') as HTMLButtonElement;
		btn.click();

		expect(edit.updateClip).not.toHaveBeenCalled();

		toolbar.dispose();
	});
});
