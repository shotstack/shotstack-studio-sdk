import { Timeline } from "./components/timeline";
import theme from "./themes/minimal.json";

import { Edit, Canvas, Controls, VideoExporter } from "./index";

/**
 * This is a simple example that implements the README quick start guide
 * Run with `make dev` to see it in action
 */
async function main() {
	try {
		// 1. Load the hello.json template from local file
		const templateModule = await import("./templates/hello.json");
		const template = templateModule.default as any;

		// 2. Initialize the edit with dimensions and background color
		const edit = new Edit(template.output.size, template.timeline.background);
		await edit.load();

		// 3. Create a canvas to display the edit
		const canvas = new Canvas(template.output.size, edit);
		await canvas.load(); // Renders to [data-shotstack-studio] element

		// 4. Load the template
		await edit.loadEdit(template);

		// 5. Initialize the Timeline with size and theme
		const timeline = new Timeline(
			edit,
			{
				width: template.output.size.width,
				height: 300
			},
			{
				theme // Uses imported theme from JSON
			}
		);
		await timeline.load(); // Renders to [data-shotstack-timeline] element

		// 6. Add keyboard controls
		const controls = new Controls(edit);
		await controls.load();
		
		// 7. Enable video export (Cmd/Ctrl+E)
		// eslint-disable-next-line no-new
		new VideoExporter(edit, canvas);

		// 8. Add event handlers

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
