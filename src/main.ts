import { Timeline } from "./components/timeline";
import theme from "./themes/minimal.json";

import { Edit, Canvas, Controls, VideoExporter } from "./index";

/**
 * This is a simple example that implements the README quick start guide
 * Run with `npm run dev` to see it in action
 */
async function main() {
	try {
		// 1. Load the hello.json template from local file
		const templateModule = await import("./templates/hello.json");
		const template = templateModule.default as any;

		// 2. Initialize the edit with dimensions and background color
		const edit = new Edit(template.output.size, template.timeline.background);
		await edit.load();

		// 2b. Register toolbar buttons
		edit.registerToolbarButton({
			id: "text",
			icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3H13"/><path d="M8 3V13"/><path d="M5 13H11"/></svg>`,
			tooltip: "Add Text",
			event: "text:requested"
		});

		edit.registerToolbarButton({
			id: "media",
			icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="1"/><circle cx="5.5" cy="5.5" r="1.5"/><path d="M14 10L11 7L4 14"/></svg>`,
			tooltip: "Add Media",
			dividerBefore: true,
			event: "upload:requested"
		});

		edit.registerToolbarButton({
			id: "code",
			icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1L6 15"/><path d="M12.5 11.5L11 10L13 8L11 6L12.5 4.5L16 8L12.5 11.5Z"/><path d="M3 8L5 10L3.5 11.5L0 8L3.5 4.5L5 6L3 8Z"/></svg>`,
			tooltip: "Add Code",
			dividerBefore: true,
			event: "code:requested"
		});

		// Handle text:requested event - adds a text clip
		edit.events.on("text:requested", ({ position }: { position: number }) => {
			edit.addTrack(0, { clips: [] });
			edit.addClip(0, {
				asset: {
					type: "rich-text",
					text: "Title",
					font: { family: "Open Sans Bold", size: 72, weight: 700, color: "#ffffff", opacity: 1 },
					align: { horizontal: "center", vertical: "middle" }
				},
				start: position,
				length: 5,
				fit: "none"
			});
		});

		// 3. Create a canvas to display the edit
		const canvas = new Canvas(edit);
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
