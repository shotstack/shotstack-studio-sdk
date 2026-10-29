/** @jest-environment jsdom */
import { BufferingNotice, type ContentBounds } from "@canvas/buffering-notice";

const wide: ContentBounds = { left: 100, right: 740, top: 50, bottom: 410 };
const narrow: ContentBounds = { left: 20, right: 320, top: 10, bottom: 180 };

function mountNotice() {
	let now = 0;
	const root = document.createElement("div");
	document.body.appendChild(root);
	const notice = new BufferingNotice(() => now);
	notice.mount(root);
	notice.update(false, false, wide);
	const { element } = notice;
	// Ticks at 50 ms, the way the canvas would call it every frame.
	const play = (ms: number, buffering: boolean, idle = false, bounds = wide) => {
		for (let t = 0; t < ms; t += 50) {
			now += 50;
			notice.update(buffering, idle, bounds);
		}
	};
	const expanded = () => element.getAttribute("aria-expanded") === "true";
	return { notice, element, root, play, expanded };
}

afterEach(() => {
	document.body.replaceChildren();
});

it("appears after half a second of buffering, not for a single late frame", () => {
	const { element, play } = mountNotice();

	play(100, true);
	play(100, false);
	play(450, true);
	expect(element.hidden).toBe(true);

	play(50, true);
	expect(element.hidden).toBe(false);
});

it("goes after 1.5 s of smooth playback, and at once when paused or fully loaded", () => {
	const { element, play } = mountNotice();
	play(500, true);

	play(1450, false);
	expect(element.hidden).toBe(false);
	play(50, false);
	expect(element.hidden).toBe(true);

	play(500, true);
	expect(element.hidden).toBe(false);
	play(50, true, true);
	expect(element.hidden).toBe(true);
});

it("shows the full message for 4 s the first time, then collapses to the word", () => {
	const { element, play, expanded } = mountNotice();
	play(500, true);
	expect(expanded()).toBe(true);
	expect(element.textContent).toContain("You can keep watching. It'll be smoother once it's loaded.");

	play(3950, true);
	expect(expanded()).toBe(true);
	play(50, true);
	expect(expanded()).toBe(false);
	expect(element.textContent).toContain("Buffering");
});

it("starts collapsed when it appears again", () => {
	const { play, expanded } = mountNotice();
	play(500, true);
	play(1500, false);

	play(500, true);

	expect(expanded()).toBe(false);
});

it("starts collapsed on a video narrower than 400 px", () => {
	const { play, expanded } = mountNotice();

	play(500, true, false, narrow);

	expect(expanded()).toBe(false);
});

it("opens while hovered, and stays open once clicked until clicked again", () => {
	const { element, play, expanded } = mountNotice();
	play(4500, true);
	expect(expanded()).toBe(false);

	element.dispatchEvent(new Event("pointerenter"));
	expect(expanded()).toBe(true);
	element.dispatchEvent(new Event("pointerleave"));
	expect(expanded()).toBe(false);

	element.click();
	element.dispatchEvent(new Event("pointerleave"));
	play(100, true);
	expect(expanded()).toBe(true);
	element.click();
	expect(expanded()).toBe(false);
});

it("keeps its clicks and presses from reaching the canvas under it", () => {
	const { element, root, play } = mountNotice();
	play(500, true);
	const reached = jest.fn();
	root.addEventListener("pointerdown", reached);
	root.addEventListener("click", reached);

	element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
	element.click();

	expect(reached).not.toHaveBeenCalled();
});

it("sits inside the video's bottom-left corner", () => {
	const { element, play } = mountNotice();

	play(500, true);

	expect(element.style.left).toBe("112px");
	expect(element.style.top).toBe("398px");
});

it("gives assistive tech the whole message as a button", () => {
	const { element, play } = mountNotice();

	play(4500, true);

	expect(element.tagName).toBe("BUTTON");
	expect(element.type).toBe("button");
	expect(element.getAttribute("aria-label")).toBe("Buffering. You can keep watching. It'll be smoother once it's loaded.");
});

it("leaves the canvas when disposed", () => {
	const { notice, root } = mountNotice();

	notice.dispose();

	expect(root.querySelector(".ss-buffering-notice")).toBeNull();
});
