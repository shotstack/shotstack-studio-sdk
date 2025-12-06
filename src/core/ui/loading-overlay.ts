export class LoadingOverlay {
	private overlay: HTMLElement | null = null;
	private bar: HTMLElement | null = null;
	private pct: HTMLElement | null = null;

	show(): void {
		this.overlay = document.createElement("div");
		this.overlay.style.cssText =
			"position:fixed;inset:0;z-index:9999;background:#0a0a0a;display:flex;justify-content:center;align-items:center";
		this.overlay.innerHTML = `
			<div style="width:240px">
				<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px">
					<span style="font:600 10px/1 ui-monospace,monospace;letter-spacing:0.12em;color:#555">LOADING</span>
					<span id="pct" style="font:600 11px/1 ui-monospace,monospace;color:#888">0%</span>
				</div>
				<div style="height:2px;background:#1a1a1a;border-radius:1px;overflow:hidden">
					<div id="bar" style="height:100%;width:0;background:#fff;transition:width 0.1s"></div>
				</div>
			</div>
		`;
		this.bar = this.overlay.querySelector("#bar") as HTMLElement;
		this.pct = this.overlay.querySelector("#pct") as HTMLElement;
		document.body.appendChild(this.overlay);
	}

	update(progress: number): void {
		const percent = Math.round(progress * 100);
		if (this.bar) this.bar.style.width = `${percent}%`;
		if (this.pct) this.pct.textContent = `${percent}%`;
	}

	hide(): void {
		this.overlay?.remove();
		this.overlay = null;
		this.bar = null;
		this.pct = null;
	}
}
