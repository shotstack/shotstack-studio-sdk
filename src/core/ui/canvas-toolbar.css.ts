export const CANVAS_TOOLBAR_STYLES = `
.ss-canvas-toolbar {
	position: absolute;
	bottom: 20px;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 5px 6px;
	background: rgba(255, 255, 255, 0.98);
	border: 1px solid rgba(0, 0, 0, 0.06);
	border-radius: 50px;
	box-shadow:
		0 2px 8px rgba(0, 0, 0, 0.06),
		0 8px 24px rgba(0, 0, 0, 0.08);
	font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
	z-index: 50;
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
}

.ss-canvas-toolbar-btn {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 7px 12px;
	background: transparent;
	border: none;
	border-radius: 40px;
	color: #1a1a1a;
	font-size: 13px;
	font-weight: 500;
	letter-spacing: -0.01em;
	cursor: pointer;
	transition: background 0.15s ease;
	white-space: nowrap;
}

.ss-canvas-toolbar-btn:hover {
	background: rgba(0, 0, 0, 0.05);
}

.ss-canvas-toolbar-btn.active {
	background: rgba(0, 0, 0, 0.06);
}

.ss-canvas-toolbar-btn svg {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
}

.ss-canvas-toolbar-btn svg.chevron {
	width: 12px;
	height: 12px;
	opacity: 0.5;
	margin-left: -2px;
}

.ss-canvas-toolbar-color-dot {
	width: 16px;
	height: 16px;
	border-radius: 50%;
	border: 1.5px solid rgba(0, 0, 0, 0.12);
	flex-shrink: 0;
}

.ss-canvas-toolbar-divider {
	width: 1px;
	height: 20px;
	background: rgba(0, 0, 0, 0.08);
	margin: 0 4px;
	flex-shrink: 0;
}

/* Dropdown wrapper */
.ss-canvas-toolbar-dropdown {
	position: relative;
}

/* Popup styling */
.ss-canvas-toolbar-popup {
	display: none;
	position: absolute;
	bottom: calc(100% + 10px);
	left: 50%;
	transform: translateX(-50%);
	background: #fff;
	border: 1px solid rgba(0, 0, 0, 0.08);
	border-radius: 14px;
	padding: 8px;
	box-shadow:
		0 4px 12px rgba(0, 0, 0, 0.08),
		0 12px 40px rgba(0, 0, 0, 0.12);
	min-width: 180px;
	z-index: 100;
}

.ss-canvas-toolbar-popup.visible {
	display: block;
}

.ss-canvas-toolbar-popup::after {
	content: "";
	position: absolute;
	bottom: -6px;
	left: 50%;
	transform: translateX(-50%) rotate(45deg);
	width: 10px;
	height: 10px;
	background: #fff;
	border-right: 1px solid rgba(0, 0, 0, 0.08);
	border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

/* Popup items */
.ss-canvas-toolbar-popup-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 12px;
	border-radius: 8px;
	cursor: pointer;
	transition: background 0.12s ease;
	font-size: 13px;
	font-weight: 500;
	color: #1a1a1a;
}

.ss-canvas-toolbar-popup-item:hover {
	background: rgba(0, 0, 0, 0.04);
}

.ss-canvas-toolbar-popup-item.active {
	background: rgba(0, 0, 0, 0.06);
}

.ss-canvas-toolbar-popup-item-label {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.ss-canvas-toolbar-popup-item-sublabel {
	font-size: 11px;
	font-weight: 400;
	color: rgba(0, 0, 0, 0.45);
}

.ss-canvas-toolbar-popup-item .checkmark {
	width: 16px;
	height: 16px;
	opacity: 0;
}

.ss-canvas-toolbar-popup-item.active .checkmark {
	opacity: 1;
}

/* Popup header */
.ss-canvas-toolbar-popup-header {
	font-size: 11px;
	font-weight: 600;
	color: rgba(0, 0, 0, 0.4);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	padding: 8px 12px 6px;
}

/* Popup divider */
.ss-canvas-toolbar-popup-divider {
	height: 1px;
	background: rgba(0, 0, 0, 0.06);
	margin: 6px 0;
}

/* Custom resolution section */
.ss-canvas-toolbar-custom-size {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
}

.ss-canvas-toolbar-custom-input {
	width: 70px;
	padding: 8px 10px;
	background: rgba(0, 0, 0, 0.04);
	border: 1px solid rgba(0, 0, 0, 0.08);
	border-radius: 8px;
	font-size: 13px;
	font-weight: 500;
	color: #1a1a1a;
	text-align: center;
	outline: none;
	-moz-appearance: textfield;
}

.ss-canvas-toolbar-custom-input::-webkit-outer-spin-button,
.ss-canvas-toolbar-custom-input::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

.ss-canvas-toolbar-custom-input:focus {
	border-color: rgba(0, 0, 0, 0.2);
	background: rgba(0, 0, 0, 0.02);
}

.ss-canvas-toolbar-custom-separator {
	color: rgba(0, 0, 0, 0.3);
	font-size: 13px;
	font-weight: 500;
}

/* Background popup - color picker */
.ss-canvas-toolbar-color-picker {
	padding: 4px;
}

.ss-canvas-toolbar-color-input {
	width: 100%;
	height: 120px;
	border: none;
	border-radius: 10px;
	cursor: pointer;
	padding: 0;
}

.ss-canvas-toolbar-color-input::-webkit-color-swatch-wrapper {
	padding: 0;
}

.ss-canvas-toolbar-color-input::-webkit-color-swatch {
	border: none;
	border-radius: 10px;
}

.ss-canvas-toolbar-color-input::-moz-color-swatch {
	border: none;
	border-radius: 10px;
}

/* Color swatches grid */
.ss-canvas-toolbar-color-swatches {
	display: grid;
	grid-template-columns: repeat(6, 1fr);
	gap: 6px;
	padding: 8px 4px;
}

.ss-canvas-toolbar-color-swatch {
	width: 28px;
	height: 28px;
	border-radius: 50%;
	border: 2px solid transparent;
	cursor: pointer;
	transition: transform 0.15s ease, border-color 0.15s ease;
}

.ss-canvas-toolbar-color-swatch:hover {
	transform: scale(1.1);
}

.ss-canvas-toolbar-color-swatch.active {
	border-color: rgba(0, 0, 0, 0.3);
}
`;
