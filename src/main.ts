import { Edit, Canvas, Controls } from "./index";
import { Timeline } from "./timeline/core/Timeline";

/**
 * This is a simple example that implements the README quick start guide
 * Run with `make dev` to see it in action
 */
async function main() {
	try {
		// 1. Retrieve an edit from a template
		const templateUrl = "https://shotstack-assets.s3.amazonaws.com/templates/hello-world/hello.json";
		const response = await fetch(templateUrl);
		const template = await response.json();

		// 2. Initialize the edit with dimensions and background color
		const edit = new Edit(template.output.size, template.timeline.background);
		await edit.load();

		// 3. Create a canvas to display the edit
		const canvas = new Canvas(template.output.size, edit);
		await canvas.load(); // Renders to [data-shotstack-studio] element

		// 4. Load the template
		await edit.loadEdit(template);

		// 5. Initialize the Timeline with matching width
		const timelineSize = { width: template.output.size.width, height: 150 };
		const timeline = new Timeline({
			edit,
			size: timelineSize,
			pixelsPerSecond: 100,
			autoScrollEnabled: true,
			snapEnabled: true
		});
		await timeline.load();

		// Add timeline to the DOM
		const timelineContainer = document.querySelector("[data-shotstack-timeline]");
		if (!timelineContainer) {
			throw new Error("Timeline container element not found");
		}
		// The new timeline uses PIXI, get the canvas from the renderer
		const renderer = timeline.getRenderer();
		const timelineCanvas = renderer.getApplication().canvas;
		timelineContainer.appendChild(timelineCanvas);

		// 6. Add keyboard controls
		const controls = new Controls(edit);
		await controls.load();

		// Timeline has its own animation loop, no need to register with canvas

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
