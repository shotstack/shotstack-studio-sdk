import { type Edit as EditSchema } from "@schemas";
import { Timeline } from "@timeline/index";

import template from "./templates/generation-smoketest.json";

import { Edit, Canvas, Controls, UIController } from "./index";

/**
 * Manual smoketest for the asset generation lifecycle. Run `npm run dev` and open
 * /smoketest.html. The generator is fake: it returns placeholder media so every
 * state can be exercised without spending credits.
 */

type Outcome = "success" | "failure" | "slow";

const PLACEHOLDER = {
	image: "https://shotstack-assets.s3.amazonaws.com/images/waterfall.jpeg",
	video: "https://shotstack-assets.s3.amazonaws.com/footage/city-timelapse.mp4",
	audio: "https://shotstack-assets.s3.amazonaws.com/music/unminus/lit.mp3"
} as const;

let outcome: Outcome = "success";
let delayMs = 1500;

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(new Error("aborted"));
		});
	});

function buildControls(edit: Edit): void {
	const panel = document.createElement("div");
	panel.className = "smoketest-panel";
	panel.innerHTML = `
		<strong>Fake generator</strong>
		<label><input type="radio" name="outcome" value="success" checked> success</label>
		<label><input type="radio" name="outcome" value="failure"> failure</label>
		<label><input type="radio" name="outcome" value="slow"> slow (10s, for abort)</label>
		<label>delay <input type="number" id="delay" value="1500" step="500" min="0" style="width:70px"> ms</label>
		<button id="toggle-generator">Unregister generator</button>
		<div id="smoketest-log"></div>
	`;
	document.body.appendChild(panel);

	panel.querySelectorAll<HTMLInputElement>("input[name=outcome]").forEach(input => {
		input.addEventListener("change", () => {
			if (input.checked) outcome = input.value as Outcome;
		});
	});
	panel.querySelector<HTMLInputElement>("#delay")?.addEventListener("change", event => {
		delayMs = Number((event.target as HTMLInputElement).value);
	});

	// Registering is one-way in the API, so this only demonstrates the
	// no-generator state on a fresh load.
	panel.querySelector("#toggle-generator")?.addEventListener("click", () => {
		// eslint-disable-next-line no-alert -- dev harness only
		alert("Reload with ?nogen to see the editor without a registered generator.");
	});

	const log = panel.querySelector("#smoketest-log") as HTMLDivElement;
	const append = (line: string): void => {
		log.textContent = `${line}\n${log.textContent ?? ""}`.split("\n").slice(0, 8).join("\n");
	};

	edit.events.on("clip:generationStarted", ({ clipId }) => append(`started  ${clipId.slice(0, 8)}`));
	edit.events.on("clip:generationCompleted", ({ clipId }) => append(`done     ${clipId.slice(0, 8)}`));
	edit.events.on("clip:generationFailed", ({ clipId, error }) => append(`failed   ${clipId.slice(0, 8)} — ${error}`));
}

async function main(): Promise<void> {
	const edit = new Edit(template as EditSchema);
	const canvas = new Canvas(edit);
	const ui = UIController.create(edit, canvas);

	await canvas.load();
	await edit.load();

	const timeline = new Timeline(edit, document.querySelector("[data-shotstack-timeline]") as HTMLElement);
	await timeline.load();

	const controls = new Controls(edit);
	await controls.load();

	// Registered after load() on purpose: overlays must pick the generator up late.
	if (!new URLSearchParams(window.location.search).has("nogen")) {
		edit.registerAssetGenerator(async ({ clipId, asset, signal }) => {
			const kind = (asset as { type?: string }).type ?? "image";
			// eslint-disable-next-line no-console -- dev harness only
			console.log("[smoketest] generate", clipId, asset);

			await wait(outcome === "slow" ? 10_000 : delayMs, signal);

			if (outcome === "failure") throw new Error("Not enough credits");

			const url = PLACEHOLDER[kind as keyof typeof PLACEHOLDER] ?? PLACEHOLDER.image;
			return { url: `${url}?generated=${Date.now()}` };
		});
	}

	buildControls(edit);
	if (!ui) throw new Error("UI controller failed to initialise");
	(window as unknown as { edit: Edit }).edit = edit;
}

main().catch(error => {
	// eslint-disable-next-line no-console -- dev harness only
	console.error("Smoketest failed to start:", error);
});
