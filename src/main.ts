import { EditSchema } from "./core/schemas/edit";
import helloWorldTemplate from "./templates/hello.json";

import { Edit, Canvas, Controls } from "./index";

/**
 * This is a simple example that implements the README quick start guide
 * Run with `make dev` to see it in action
 */
async function main() {
  try {
    // 1. Initialize an edit with dimensions and background color
    const size = { width: 1280, height: 720 };
    const edit = new Edit(size, "#000000");
    await edit.load();
    console.log("Edit loaded successfully");

    // 2. Create a canvas to display the edit
    const canvas = new Canvas(edit.size, edit);
    await canvas.load(); // Renders to [data-shotstack-studio] element
    console.log("Canvas loaded successfully");

    // 3. Load an edit from a template
    const template = EditSchema.parse(helloWorldTemplate);
    await edit.loadEdit(template);
    console.log("Template loaded successfully");

    // 4. Add keyboard controls
    const controls = new Controls(edit);
    await controls.load();
    console.log("Controls loaded successfully");

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