import { sec } from "@core/timing/types";
import { Timeline } from "@timeline/index";

import { Edit, Canvas, Controls, VideoExporter, UIController } from "./index";

/**
 * This is a simple example that implements the README quick start guide
 * Run with `npm run dev` to see it in action
 */
async function main() {
	try {
		// 1. Load the hello.json template from local file
		const templateModule = await import("./templates/hello.json");
		const template = templateModule.default as any;

		// 2. Create core components
		const edit = new Edit(template);
		const canvas = new Canvas(edit);
		const ui = UIController.create(edit, canvas, { mergeFields: true });

		// 3. Load canvas and edit
		await canvas.load();
		await edit.load();

		// 4. Register toolbar buttons (on UIController)
		ui.registerButton({
			id: "text",
			icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3H13"/><path d="M8 3V13"/><path d="M5 13H11"/></svg>`,
			tooltip: "Add Text"
		});

		// 5. Handle button clicks (typed events on UIController)
		ui.on("button:text", ({ position }) => {
			edit.addTrack(0, {
				clips: [
					{
						asset: {
							type: "rich-text",
							text: "Title",
							font: { family: "Open Sans Bold", size: 72, weight: 700, style: "normal", color: "#ffffff", opacity: 1 },
							align: { horizontal: "center", vertical: "middle" }
						},
						start: sec(position),
						length: sec(5),
						fit: "none"
					}
				]
			});
		});

		// 6. Initialize the Timeline
		const timelineContainer = document.querySelector("[data-shotstack-timeline]") as HTMLElement;
		if (timelineContainer) {
			const timeline = new Timeline(edit, timelineContainer, {
				features: {
					toolbar: true,
					ruler: true,
					playhead: true,
					snap: true,
					badges: true,
					multiSelect: true
				}
			});
			await timeline.load();
			console.log("Timeline loaded!");
		}

		// 7. Add keyboard controls
		const controls = new Controls(edit);
		await controls.load();

		// 8. Enable video export (Cmd/Ctrl+E)
		// eslint-disable-next-line no-new
		new VideoExporter(edit, canvas);

		// 9. Add event handlers
		edit.events.on("clip:selected", data => {
			console.log("Clip selected:", data);
		});

		edit.events.on("clip:updated", data => {
			console.log("Clip updated:", data);
		});

		// Additional helpful information for the demo
		console.log("Demo loaded successfully! Try the following keyboard controls:");
		console.log("- Space: Play/Pause");
		console.log("- J: Stop");
		console.log("- K: Pause");
		console.log("- L: Play");
		console.log("- Left/Right Arrow: Seek");
		console.log("- Shift+Left/Right: Seek faster");
		console.log("- Comma/Period: Step frame by frame");
	} catch (error) {
		console.error("Error in Shotstack Studio demo:", error);
	}
}

main();
