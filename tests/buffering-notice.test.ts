/** @jest-environment jsdom */
import { BufferingNotice, type ContentBounds, visibleBounds } from "@canvas/buffering-notice";

const wide: ContentBounds = { left: 100, right: 740, top: 50, bottom: 410 };

function mountNotice() {
	let now = 0;
	const root = document.createElement("div");
	document.body.appendChild(root);
	const notice = new BufferingNotice(() => now);
	notice.mount(root);
	notice.update(false, false, wide);
	const { element } = notice;
	// Ticks at 50 ms, the way the canvas would call it every frame.
	const play = (ms: number, buffering: boolean, idle = false, bounds: ContentBounds | null = wide) => {
		for (let t = 0; t < ms; t += 50) {
			now += 50;
			notice.update(buffering, idle, bounds);
		}
	};
	const pauseTicking = (ms: number) => {
		now += ms;
	};
	return { notice, element, root, play, pauseTicking };
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

it("says only Buffering, and leaves it to the toolbar's status to tell assistive tech", () => {
	const { element, play } = mountNotice();

	play(500, true);

	expect(element.textContent).toBe("Buffering");
	expect(element.getAttribute("aria-hidden")).toBe("true");
});

it("sits inside the video's bottom-left corner", () => {
	const { element, play } = mountNotice();

	play(500, true);

	expect(element.style.left).toBe("112px");
	expect(element.style.top).toBe("398px");
});

it("leaves the canvas when disposed", () => {
	const { notice, root } = mountNotice();

	notice.dispose();

	expect(root.querySelector(".ss-buffering-notice")).toBeNull();
});

it("keeps to the part of the video inside the preview", () => {
	const { element, play } = mountNotice();
	const shown = visibleBounds({ left: -50, right: 600, top: -20, bottom: 900 }, 800, 500);
	expect(shown).toEqual({ left: 0, right: 600, top: 0, bottom: 500 });

	play(500, true, false, shown);

	expect(element.style.left).toBe("12px");
	expect(element.style.top).toBe("488px");
});

it("hides while none of the video is in view", () => {
	const { element, play } = mountNotice();
	play(500, true);
	const offscreen = visibleBounds({ left: 900, right: 1500, top: 0, bottom: 300 }, 800, 500);
	expect(offscreen).toBeNull();

	play(50, true, false, offscreen);

	expect(element.hidden).toBe(true);
});

it("dates no timer from before a pause in ticking", () => {
	const { element, play, pauseTicking } = mountNotice();
	pauseTicking(5000);

	play(50, true);

	expect(element.hidden).toBe(true);
});
