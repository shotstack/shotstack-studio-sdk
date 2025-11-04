export class ExportProgressUI {
	private overlay: HTMLElement | null = null;
	private bar: HTMLElement | null = null;
	private percent: HTMLElement | null = null;
	private status: HTMLElement | null = null;

	create(): void {
		this.overlay = Object.assign(document.createElement("div"), {
			style:
				"position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;justify-content:center;align-items:center;color:white;font-family:Arial"
		});

		const card = Object.assign(document.createElement("div"), {
			style: "background:#222;border-radius:8px;padding:20px;box-shadow:0 4px 8px rgba(0,0,0,0.2);width:300px;text-align:center"
		});

		card.innerHTML = `<h3 style="margin:0 0 15px 0;font-weight:normal">Exporting Video</h3>`;

		this.status = Object.assign(document.createElement("div"), {
			style: "font-size:12px;margin-bottom:10px;opacity:0.8"
		});
		card.appendChild(this.status);

		const progress = Object.assign(document.createElement("div"), {
			style: "width:100%;height:6px;background:#444;border-radius:3px;overflow:hidden;margin-bottom:10px"
		});

		this.bar = Object.assign(document.createElement("div"), {
			style: "width:0%;height:100%;background:#3498db;transition:width 0.3s"
		});
		progress.appendChild(this.bar);
		card.appendChild(progress);

		this.percent = Object.assign(document.createElement("div"), {
			style: "font-size:12px",
			innerText: "0%"
		});
		card.appendChild(this.percent);

		this.overlay.appendChild(card);
		document.body.appendChild(this.overlay);
	}

	update(current: number, total: number, text?: string): void {
		if (!this.overlay) return;
		const p = Math.round((current / total) * 100);
		if (this.bar) this.bar.style.width = `${p}%`;
		if (this.percent) this.percent.innerText = `${p}%`;
		if (this.status && text) this.status.innerText = text;
	}

	remove(): void {
		this.overlay?.remove();
		this.overlay = null;
		this.bar = null;
		this.percent = null;
		this.status = null;
	}
}
