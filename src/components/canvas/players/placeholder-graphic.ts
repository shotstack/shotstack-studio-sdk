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

	const sideMargin = Math.max(12, Math.round(width * 0.06));
	const barWidth = width - sideMargin * 2;
	const barHeight = Math.max(4, Math.round(height / 220));
	const radius = barHeight / 2;
	const barX = sideMargin;
	const barY = height - Math.max(18, Math.round(height / 36)) - barHeight;

	const fontSize = Math.min(30, Math.max(13, Math.round(height / 42)));
	const label = new pixi.Text({
		text: "Loading clip…",
		style: new pixi.TextStyle({ fontFamily: "system-ui, sans-serif", fontSize, fill: 0xe2e8f0, fontWeight: "600" })
	});

	// Small rounded backing behind the label so it stays legible over any clip content.
	const padX = Math.round(fontSize * 0.6);
	const padY = Math.round(fontSize * 0.3);
	const labelW = label.width + padX * 2;
	const labelH = label.height + padY * 2;
	const labelY = barY - labelH - Math.round(barHeight * 2) - 4;
	const labelBg = new pixi.Graphics();
	labelBg.fillStyle = { color: "#0f172a", alpha: 0.7 };
	labelBg.roundRect(barX, labelY, labelW, labelH, Math.round(labelH / 2));
	labelBg.fill();
	container.addChild(labelBg);
	label.x = barX + padX;
	label.y = labelY + padY;
	container.addChild(label);

	// Progress track, pinned to the bottom edge.
	const track = new pixi.Graphics();
	track.fillStyle = { color: "#0f172a", alpha: 0.6 };
	track.roundRect(barX, barY, barWidth, barHeight, radius);
	track.fill();
	container.addChild(track);

	const fill = new pixi.Graphics();
	container.addChild(fill);
	const setProgress = (fraction: number) => {
		const f = Math.max(0, Math.min(1, fraction));
		fill.clear();
		if (f <= 0) return;
		fill.fillStyle = { color: "#34d399", alpha: 1 };
		fill.roundRect(barX, barY, Math.max(barHeight, barWidth * f), barHeight, radius);
		fill.fill();
	};
	setProgress(0);

	return { container, setProgress };
}
