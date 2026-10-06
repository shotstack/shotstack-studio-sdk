/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first, max-classes-per-file, class-methods-use-this -- mock classes and a minimal BaseToolbar subclass whose abstract hooks are intentionally empty */
jest.mock("pixi.js", () => ({}));
jest.mock("../src/components/canvas/players/player", () => ({ Player: class MockPlayer {}, PlayerType: {} }));
jest.mock("../src/core/shotstack-edit", () => ({ ShotstackEdit: class MockShotstackEdit {} }));
jest.mock("../src/core/edit-session", () => ({}));

import { BaseToolbar } from "../src/core/ui/base-toolbar";

class TestToolbar extends BaseToolbar {
	mount(parent: HTMLElement): void {
		this.container = document.createElement("div");
		parent.appendChild(this.container);
		this.appendDeleteButton();
		this.appendContinueButton();
	}

	protected syncState(): void {}

	protected getPopupList(): (HTMLElement | null)[] {
		return [];
	}
}

const fakeEdit = (src: string | undefined) => ({
	events: { on: jest.fn() },
	canDeleteClip: () => true,
	getClipId: () => "clip-1",
	getResolvedClip: () => ({ asset: { type: "video", ...(src && { src }) }, start: 0, length: 5 }),
	getGenerationModels: () => [{ model: "i2v", type: "video", optionNames: ["startSrc"], options: [], unsupported: [] }],
	continueFromClip: jest.fn().mockResolvedValue(undefined)
});

const continueButton = () => document.querySelector<HTMLButtonElement>('[data-action="continue-clip"]')!;

describe("Continue button", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("continues the selected clip", () => {
		const edit = fakeEdit("https://cdn.example/a.mp4");
		const toolbar = new TestToolbar(edit as never);
		toolbar.mount(document.body);
		toolbar.show(0, 0);
		expect(continueButton().hidden).toBe(false);
		continueButton().click();
		expect(edit.continueFromClip).toHaveBeenCalledWith("clip-1");
	});

	it("hides for a clip with nothing to continue from", () => {
		const toolbar = new TestToolbar(fakeEdit(undefined) as never);
		toolbar.mount(document.body);
		toolbar.show(0, 0);
		expect(continueButton().hidden).toBe(true);
	});
});
