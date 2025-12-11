export const CANVAS_TOOLBAR_STYLES = `
.ss-canvas-toolbar {
	position: absolute;
	right: 8px;
	top: 50%;
	transform: translateY(-50%);
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 2px;
	padding: 6px;
	background: rgba(255, 255, 255, 0.98);
	border: 1px solid rgba(0, 0, 0, 0.06);
	border-radius: 14px;
	box-shadow:
		0 2px 8px rgba(0, 0, 0, 0.06),
		0 8px 24px rgba(0, 0, 0, 0.08);
	font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
	z-index: 50;
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
}

.ss-canvas-toolbar-btn {
	width: 36px;
	height: 36px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: none;
	border-radius: 8px;
	color: rgba(0, 0, 0, 0.65);
	cursor: pointer;
	transition: all 0.15s ease;
	position: relative;
}

.ss-canvas-toolbar-btn:hover {
	background: rgba(0, 0, 0, 0.06);
	color: rgba(0, 0, 0, 0.9);
}

.ss-canvas-toolbar-btn:active {
	background: rgba(0, 0, 0, 0.1);
	transform: scale(0.95);
}

.ss-canvas-toolbar-btn.active {
	background: rgba(0, 0, 0, 0.06);
}

.ss-canvas-toolbar-btn svg {
	width: 18px;
	height: 18px;
	flex-shrink: 0;
}

/* Tooltip */
.ss-canvas-toolbar-btn::after {
	content: attr(data-tooltip);
	position: absolute;
	right: calc(100% + 10px);
	top: 50%;
	transform: translateY(-50%);
	padding: 6px 10px;
	background: rgba(24, 24, 27, 0.95);
	color: #fff;
	font-size: 12px;
	font-weight: 500;
	white-space: nowrap;
	border-radius: 6px;
	opacity: 0;
	visibility: hidden;
	transition: opacity 0.15s ease, visibility 0.15s ease;
	pointer-events: none;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.ss-canvas-toolbar-btn::before {
	content: "";
	position: absolute;
	right: calc(100% + 4px);
	top: 50%;
	transform: translateY(-50%);
	border: 5px solid transparent;
	border-left-color: rgba(24, 24, 27, 0.95);
	opacity: 0;
	visibility: hidden;
	transition: opacity 0.15s ease, visibility 0.15s ease;
}

.ss-canvas-toolbar-btn:hover::after,
.ss-canvas-toolbar-btn:hover::before {
	opacity: 1;
	visibility: visible;
}

/* Hide tooltip when popup is open */
.ss-canvas-toolbar-btn.active::after,
.ss-canvas-toolbar-btn.active::before {
	opacity: 0;
	visibility: hidden;
}

.ss-canvas-toolbar-fps-label {
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.01em;
}

.ss-canvas-toolbar-color-dot {
	width: 18px;
	height: 18px;
	border-radius: 50%;
	border: 1.5px solid rgba(0, 0, 0, 0.15);
	flex-shrink: 0;
}

.ss-canvas-toolbar-divider {
	width: 24px;
	height: 1px;
	background: rgba(0, 0, 0, 0.08);
	margin: 4px auto;
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
	right: calc(100% + 10px);
	top: 50%;
	transform: translateY(-50%);
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
	right: -6px;
	top: 50%;
	transform: translateY(-50%) rotate(45deg);
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

/* Variables popup */
.ss-canvas-toolbar-popup--variables {
	min-width: 260px;
}

.ss-variables-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.ss-variables-add-btn {
	width: 24px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.06);
	border: none;
	border-radius: 6px;
	color: rgba(0, 0, 0, 0.65);
	font-size: 16px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s ease;
}

.ss-variables-add-btn:hover {
	background: rgba(0, 0, 0, 0.1);
	color: rgba(0, 0, 0, 0.9);
}

.ss-variables-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-height: 240px;
	overflow-y: auto;
}

.ss-variables-empty {
	padding: 16px 12px;
	text-align: center;
	font-size: 13px;
	color: rgba(0, 0, 0, 0.4);
}

.ss-variable-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 10px;
	background: rgba(0, 0, 0, 0.03);
	border-radius: 8px;
}

.ss-variable-info {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.ss-variable-name {
	font-size: 12px;
	font-weight: 600;
	color: rgba(99, 102, 241, 0.9);
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
}

.ss-variable-value {
	width: 100%;
	padding: 6px 8px;
	background: rgba(255, 255, 255, 0.8);
	border: 1px solid rgba(0, 0, 0, 0.08);
	border-radius: 6px;
	font-size: 12px;
	color: #1a1a1a;
	outline: none;
}

.ss-variable-value:focus {
	border-color: rgba(99, 102, 241, 0.5);
	background: #fff;
}

.ss-variable-value::placeholder {
	color: rgba(0, 0, 0, 0.35);
}

.ss-variable-value.error {
	border-color: rgba(239, 68, 68, 0.6);
	background: rgba(239, 68, 68, 0.15);
}

.ss-variable-value.error:focus {
	border-color: rgba(239, 68, 68, 0.8);
}

.ss-variable-delete {
	width: 24px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: none;
	border-radius: 6px;
	color: rgba(0, 0, 0, 0.35);
	font-size: 16px;
	cursor: pointer;
	transition: all 0.15s ease;
	flex-shrink: 0;
}

.ss-variable-delete:hover {
	background: rgba(239, 68, 68, 0.1);
	color: #ef4444;
}
`;
