import * as pixi from "pixi.js";

/**
 * Create a placeholder graphic for unresolved assets.
 */
export function createPlaceholderGraphic(width: number, height: number): pixi.Graphics {
	const graphics = new pixi.Graphics();
	graphics.fillStyle = { color: "#cccccc", alpha: 0.5 };
	graphics.rect(0, 0, width, height);
	graphics.fill();

	graphics.strokeStyle = { color: "#999999", width: 2 };
	graphics.moveTo(0, 0);
	graphics.lineTo(width, height);
	graphics.moveTo(width, 0);
	graphics.lineTo(0, height);
	graphics.stroke();

	return graphics;
}

export function createCaptureLoadingGraphic(width: number, height: number): { container: pixi.Container; setProgress: (fraction: number) => void } {
	const container = new pixi.Container();

	// Background
	const bg = new pixi.Graphics();
	bg.fillStyle = { color: "#0f172a", alpha: 0.92 };
	bg.rect(0, 0, width, height);
	bg.fill();
	container.addChild(bg);

	// Border
	const border = new pixi.Graphics();
	border.strokeStyle = { color: "#334155", width: 2 };
	border.rect(1, 1, width - 2, height - 2);
	border.stroke();
	container.addChild(border);

	const labelStyle = new pixi.TextStyle({
		fontFamily: "system-ui, sans-serif",
		fontSize: Math.min(48, Math.max(18, height / 16)),
		fill: 0xe2e8f0,
		fontWeight: "600"
	});
	const label = new pixi.Text({ text: "Loading clip...", style: labelStyle });
	label.anchor.set(0.5, 0.5);
	label.x = width / 2;
	label.y = height / 2 - 10;
	container.addChild(label);

	// Progress bar
	const trackWidth = Math.min(360, width * 0.5);
	const trackHeight = 6;
	const trackX = (width - trackWidth) / 2;
	const trackY = height / 2 + 60;
	const track = new pixi.Graphics();
	track.fillStyle = { color: "#1e293b", alpha: 1 };
	track.rect(trackX, trackY, trackWidth, trackHeight);
	track.fill();
	container.addChild(track);

	const fill = new pixi.Graphics();
	container.addChild(fill);
	const setProgress = (fraction: number) => {
		const f = Math.max(0, Math.min(1, fraction));
		fill.clear();
		fill.fillStyle = { color: "#34d399", alpha: 1 };
		fill.rect(trackX, trackY, trackWidth * f, trackHeight);
		fill.fill();
	};
	setProgress(0);

	return { container, setProgress };
}
