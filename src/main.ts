import { type Edit as EditSchema } from "@schemas";
import { Timeline } from "@timeline/index";

import template from "./templates/test.json";

import { Edit, Canvas, Controls, UIController } from "./index";

/**
 * Simple example implementing the README quick start guide.
 * Run with `npm run dev` to see it in action.
 */
async function main() {
	try {
		// 1. Create core components
		const edit = new Edit(template as EditSchema);
		const canvas = new Canvas(edit);
		const ui = UIController.create(edit, canvas);

		// 2. Load canvas and edit
		await canvas.load();
		await edit.load();

		// 3. Register toolbar buttons
		ui.registerButton({
			id: "text",
			icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3H13"/><path d="M8 3V13"/><path d="M5 13H11"/></svg>`,
			tooltip: "Add Text"
		});

		// 4. Handle button clicks
		ui.on("button:text", ({ position }) => {
			edit.addTrack(0, {
				clips: [
					{
						asset: {
							type: "rich-text",
							text: "Title",
							font: { family: "Work Sans", size: 72, weight: 600, color: "#ffffff", opacity: 1 },
							align: { horizontal: "center", vertical: "middle" }
						},
						start: position,
						length: 5,
						width: 500,
						height: 200
					}
				]
			});
		});

		// 5. Initialize the Timeline
		const timelineContainer = document.querySelector("[data-shotstack-timeline]") as HTMLElement;
		const timeline = new Timeline(edit, timelineContainer);
		await timeline.load();

		// 6. Add keyboard controls
		const controls = new Controls(edit);
		await controls.load();

		// 7. Add event handlers
		edit.events.on("clip:selected", data => {
			console.log("Clip selected:", data);
		});

		edit.events.on("clip:updated", data => {
			console.log("Clip updated:", data);
		});
	} catch (error) {
		console.error("Error in Shotstack Studio demo:", error);
	}
}

main();
