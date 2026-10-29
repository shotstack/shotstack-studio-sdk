/** @jest-environment jsdom */
import { Timeline } from "@timeline/timeline";
import { AssetLoadTracker } from "@core/events/asset-load-tracker";
import { EventEmitter } from "@core/events/event-emitter";
import { sec } from "@core/timing/types";

async function mountClips(clips: Array<{ asset: Record<string, unknown> }>) {
	const events = new EventEmitter();
	const config = { timeline: { tracks: clips.map((clip, i) => ({ clips: [{ id: `clip-${i}`, start: 0, length: 5, ...clip }] })) } };
	const edit = {
		events,
		assetLoader: { loadTracker: new AssetLoadTracker() },
		getInternalEvents: () => events,
		getResolvedEdit: () => config,
		getEdit: () => config,
		isClipSelected: () => false,
		getClipGenerationState: () => undefined,
		getClipError: () => null,
		getPendingCaptures: () => ({ pending: 0, total: 0, progress: 1 }),
		getClipCaptureProgress: () => null,
		playbackTime: sec(0),
		totalDuration: sec(5),
		isPlaying: false
	};
	const container = document.createElement("div");
	document.body.appendChild(container);
	const timeline = new Timeline(edit as never, container);
	["html5", "rich-caption"].forEach(type => timeline.registerClipRenderer(type, { render: () => {} }));
	await timeline.load();
	return [...container.querySelectorAll<HTMLElement>(".ss-clip")].map(clip => ({
		icon: clip.querySelector(".ss-clip-icon")?.textContent,
		label: clip.querySelector(".ss-clip-label")?.textContent
	}));
}

afterEach(() => {
	document.body.replaceChildren();
});

it("labels an html5 clip with its headline, under the html icon", async () => {
	const [clip] = await mountClips([
		{
			asset: {
				type: "html5",
				html: "<style>h1 { color: red }</style><div><h1>Lights out &amp; away</h1><p>We go racing</p></div><script>run()</script>"
			}
		}
	]);

	expect(clip).toEqual({ icon: "<>", label: "Lights out & away" });
});

it("labels an html5 clip with its first sentence, past counters, bullets and all-caps labels", async () => {
	const clips = await mountClips([
		{
			asset: {
				type: "html5",
				html: '<b>01</b><div class="k">/ LEARN</div><h1><span class="mask"><span class="wd">Learns</span></span> <span class="wd">your brand.</span></h1>'
			}
		},
		{ asset: { type: "html5", html: "<b>●</b><div>SENNA · ONLINE</div><h2>Meet Senna.</h2><p>The AI agent that runs your ads.</p>" } }
	]);

	expect(clips.map(clip => clip.label)).toEqual(["Learns your brand.", "Meet Senna."]);
});

it("keeps words apart across spans with no space between them, and letters split one per span together", async () => {
	const clips = await mountClips([
		{ asset: { type: "html5", html: '<h1><span class="ln">Your best ad</span><span class="ln">burns out</span></h1>' } },
		{ asset: { type: "html5", html: "<h1><span>G</span><span>o</span> <span>f</span><span>a</span><span>s</span><span>t</span></h1>" } }
	]);

	expect(clips.map(clip => clip.label)).toEqual(["Your best ad burns o...", "Go fast"]);
});

it("labels an html5 clip whose lines are all labels with the first one that has letters", async () => {
	const [clip] = await mountClips([{ asset: { type: "html5", html: "<div>00:00.000</div><div><span>LAP</span> <b>01</b></div>" } }]);

	expect(clip.label).toBe("LAP 01");
});

it("labels an html5 clip with no visible text as HTML", async () => {
	const [clip] = await mountClips([{ asset: { type: "html5", html: "<div class='grain'></div>", css: ".grain { opacity: .2 }" } }]);

	expect(clip.label).toBe("HTML");
});

it("labels a rich caption with what it captions, under the caption icon", async () => {
	const clips = await mountClips([
		{ asset: { type: "rich-caption", src: "alias://voiceover" } },
		{ asset: { type: "rich-caption", src: "https://cdn.example.com/subs/race.srt?token=abc" } }
	]);

	expect(clips).toEqual([
		{ icon: "≡", label: "Captions · voiceover" },
		{ icon: "≡", label: "Captions · race.srt" }
	]);
});
