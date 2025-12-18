// Mock for CSS ?inline imports - reads and concatenates all CSS files
const fs = require("fs");
const path = require("path");

function readCssDir(dir) {
	let css = "";
	const items = fs.readdirSync(dir, { withFileTypes: true });

	for (const item of items) {
		const fullPath = path.join(dir, item.name);
		if (item.isDirectory()) {
			css += readCssDir(fullPath);
		} else if (item.name.endsWith(".css")) {
			css += fs.readFileSync(fullPath, "utf-8") + "\n";
		}
	}
	return css;
}

const stylesDir = path.join(__dirname, "../../src/styles");
const allCss = readCssDir(stylesDir);

module.exports = allCss;
