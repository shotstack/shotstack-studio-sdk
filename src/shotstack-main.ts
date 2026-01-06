import { ShotstackEdit } from "@core/shotstack-edit";
import { Timeline } from "@timeline/index";

import { Canvas, Controls, VideoExporter, UIController } from "./index";

/**
 * Shotstack-specific example demonstrating internal API features.
 *
 * This example uses ShotstackEdit which provides:
 * - Merge field management (template variables like {{ NAME }})
 * - Text-to-RichText asset conversion
 * - Future Shotstack-specific functionality
 *
 * For external SDK consumers, see main.ts which uses the public Edit class.
 */
async function main() {
	try {
		// 1. Load the hello.json template from local file
		const templateModule = await import("./templates/hello.json");
		const template = templateModule.default as any;

		// 2. Create core components using ShotstackEdit for full Shotstack features
		const edit = new ShotstackEdit(template);
		const canvas = new Canvas(edit);

		// UIController auto-detects ShotstackEdit and enables merge field UI
		const ui = UIController.create(edit, canvas);

		// 3. Load canvas and edit
		await canvas.load();
		await edit.load();

		// 4. Register toolbar buttons
		ui.registerButton({
			id: "text",
			icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3H13"/><path d="M8 3V13"/><path d="M5 13H11"/></svg>`,
			tooltip: "Add Text"
		});

		ui.registerButton({
			id: "upgrade-text",
			icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/><path d="M17 8l3 4-3 4"/></svg>`,
			tooltip: "Convert all text to rich text"
		});

		// 5. Handle button clicks
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

		// Shotstack-specific: Convert legacy text assets to rich text
		ui.on("button:upgrade-text", async () => {
			const count = await edit.convertAllTextToRichText();
			console.log(`Converted ${count} text clips to rich text`);
		});

		// 6. Demonstrate merge field API (Shotstack-specific)
		console.log("Merge Fields API available:");
		console.log("- edit.mergeFields.register({ name, defaultValue })");
		console.log("- edit.mergeFields.getAll()");
		console.log("- edit.applyMergeField(track, clip, path, fieldName, value)");

		// 7. Initialize the Timeline
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

		// 8. Add keyboard controls
		const controls = new Controls(edit);
		await controls.load();

		// 9. Enable video export (Cmd/Ctrl+E)
		// eslint-disable-next-line no-new
		new VideoExporter(edit, canvas);

		// 10. Add event handlers
		edit.events.on("clip:selected", data => {
			console.log("Clip selected:", data);
		});

		edit.events.on("clip:updated", data => {
			console.log("Clip updated:", data);
		});

		// Additional helpful information for the demo
		console.log("Shotstack Demo loaded successfully!");
		console.log("Shotstack-specific features enabled:");
		console.log("- Merge fields UI in toolbars");
		console.log("- Text-to-RichText conversion button");
	} catch (error) {
		console.error("Error in Shotstack Studio demo:", error);
	}
}

main();
