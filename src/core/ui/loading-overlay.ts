export class LoadingOverlay {
	private overlay: HTMLElement | null = null;

	show(): void {
		this.overlay = document.createElement("div");
		this.overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:#0a0a0a;display:flex;justify-content:center;align-items:center";
		this.overlay.innerHTML = `
			<div style="width:32px;height:32px;border:2px solid #333;border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite"></div>
			<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
		`;
		document.body.appendChild(this.overlay);
	}

	update(_progress: number): void {
		// No-op for spinner
	}

	hide(): void {
		this.overlay?.remove();
		this.overlay = null;
	}
}
