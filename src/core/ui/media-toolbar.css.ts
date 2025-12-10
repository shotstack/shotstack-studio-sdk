export const MEDIA_TOOLBAR_STYLES = `
.ss-media-toolbar {
	display: none;
	position: absolute;
	top: 12px;
	left: 50%;
	transform: translateX(-50%);
	background: rgba(24, 24, 27, 0.95);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 10px;
	padding: 6px 8px;
	gap: 2px;
	z-index: 100;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
	align-items: center;
	box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.ss-media-toolbar.visible {
	display: flex;
}

.ss-media-toolbar-group {
	display: flex;
	align-items: center;
	gap: 1px;
}

.ss-media-toolbar-group--bordered {
	background: rgba(255, 255, 255, 0.04);
	border-radius: 6px;
	padding: 2px;
}

.ss-media-toolbar-divider {
	width: 1px;
	height: 20px;
	background: rgba(255, 255, 255, 0.1);
	margin: 0 6px;
}

.ss-media-toolbar-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-width: 32px;
	height: 32px;
	padding: 0 10px;
	background: transparent;
	border: none;
	border-radius: 6px;
	color: rgba(255, 255, 255, 0.65);
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s ease;
	position: relative;
	white-space: nowrap;
}

.ss-media-toolbar-btn:hover {
	background: rgba(255, 255, 255, 0.1);
	color: rgba(255, 255, 255, 0.95);
}

.ss-media-toolbar-btn.active {
	background: rgba(255, 255, 255, 0.15);
	color: #fff;
}

.ss-media-toolbar-btn svg {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
}

.ss-media-toolbar-btn .chevron {
	width: 10px;
	height: 10px;
	opacity: 0.5;
	margin-left: -2px;
}

.ss-media-toolbar-value {
	min-width: 36px;
	text-align: center;
	font-size: 12px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.9);
	font-variant-numeric: tabular-nums;
}

/* Dropdown wrapper */
.ss-media-toolbar-dropdown {
	position: relative;
}

/* Popup styling */
.ss-media-toolbar-popup {
	display: none;
	position: absolute;
	top: calc(100% + 8px);
	left: 50%;
	transform: translateX(-50%);
	background: rgba(32, 32, 36, 0.98);
	backdrop-filter: blur(16px);
	-webkit-backdrop-filter: blur(16px);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	padding: 8px;
	min-width: 180px;
	z-index: 200;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.2);
}

.ss-media-toolbar-popup.visible {
	display: block;
}

.ss-media-toolbar-popup::before {
	content: "";
	position: absolute;
	top: -6px;
	left: 50%;
	transform: translateX(-50%) rotate(45deg);
	width: 10px;
	height: 10px;
	background: rgba(32, 32, 36, 0.98);
	border-left: 1px solid rgba(255, 255, 255, 0.1);
	border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* Popup items for dropdowns */
.ss-media-toolbar-popup-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 12px;
	border-radius: 8px;
	cursor: pointer;
	transition: background 0.12s ease;
	font-size: 13px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.85);
}

.ss-media-toolbar-popup-item:hover {
	background: rgba(255, 255, 255, 0.08);
}

.ss-media-toolbar-popup-item.active {
	background: rgba(255, 255, 255, 0.12);
}

.ss-media-toolbar-popup-item .checkmark {
	width: 14px;
	height: 14px;
	opacity: 0;
	color: #fff;
}

.ss-media-toolbar-popup-item.active .checkmark {
	opacity: 1;
}

.ss-media-toolbar-popup-item-label {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.ss-media-toolbar-popup-item-sublabel {
	font-size: 11px;
	font-weight: 400;
	color: rgba(255, 255, 255, 0.4);
}

/* Slider popup */
.ss-media-toolbar-popup--slider {
	min-width: 200px;
	padding: 14px 16px;
}

.ss-media-toolbar-popup-header {
	font-size: 11px;
	font-weight: 600;
	color: rgba(255, 255, 255, 0.5);
	text-transform: uppercase;
	letter-spacing: 0.05em;
	margin-bottom: 12px;
}

.ss-media-toolbar-slider-row {
	display: flex;
	align-items: center;
	gap: 12px;
}

.ss-media-toolbar-slider {
	-webkit-appearance: none;
	appearance: none;
	flex: 1;
	height: 4px;
	background: rgba(255, 255, 255, 0.15);
	border-radius: 2px;
	cursor: pointer;
}

.ss-media-toolbar-slider::-webkit-slider-thumb {
	-webkit-appearance: none;
	width: 16px;
	height: 16px;
	background: #fff;
	border-radius: 50%;
	cursor: pointer;
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	transition: transform 0.15s ease;
	margin-top: -6px;
}

.ss-media-toolbar-slider::-webkit-slider-thumb:hover {
	transform: scale(1.1);
}

.ss-media-toolbar-slider::-moz-range-thumb {
	width: 16px;
	height: 16px;
	background: #fff;
	border: none;
	border-radius: 50%;
	cursor: pointer;
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.ss-media-toolbar-slider::-webkit-slider-runnable-track {
	height: 4px;
	background: rgba(255, 255, 255, 0.15);
	border-radius: 2px;
}

.ss-media-toolbar-slider::-moz-range-track {
	height: 4px;
	background: rgba(255, 255, 255, 0.15);
	border-radius: 2px;
}

.ss-media-toolbar-slider-value {
	min-width: 42px;
	text-align: right;
	font-size: 13px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.9);
	font-variant-numeric: tabular-nums;
}

/* Preset buttons */
.ss-media-toolbar-presets {
	display: flex;
	gap: 6px;
	margin-top: 12px;
}

.ss-media-toolbar-preset {
	flex: 1;
	padding: 8px 6px;
	background: rgba(255, 255, 255, 0.06);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 6px;
	color: rgba(255, 255, 255, 0.7);
	font-size: 11px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s ease;
	text-align: center;
}

.ss-media-toolbar-preset:hover {
	background: rgba(255, 255, 255, 0.1);
	border-color: rgba(255, 255, 255, 0.15);
	color: rgba(255, 255, 255, 0.9);
}

.ss-media-toolbar-preset.active {
	background: rgba(255, 255, 255, 0.15);
	border-color: rgba(255, 255, 255, 0.25);
	color: #fff;
}

/* Volume section - hidden for images */
.ss-media-toolbar-volume {
	display: flex;
	align-items: center;
}

.ss-media-toolbar-volume.hidden {
	display: none;
}

/* Transition popup - tabbed design */
.ss-media-toolbar-popup--transition {
	min-width: 220px;
	padding: 12px;
}

/* Segmented toggle for IN/OUT */
.ss-transition-tabs {
	display: flex;
	background: rgba(255, 255, 255, 0.06);
	border-radius: 6px;
	padding: 2px;
	margin-bottom: 12px;
}

.ss-transition-tab {
	flex: 1;
	padding: 6px 12px;
	background: transparent;
	border: none;
	border-radius: 4px;
	color: rgba(255, 255, 255, 0.5);
	font-size: 11px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.15s ease;
	text-transform: uppercase;
	letter-spacing: 0.03em;
}

.ss-transition-tab:hover {
	color: rgba(255, 255, 255, 0.7);
}

.ss-transition-tab.active {
	background: rgba(255, 255, 255, 0.12);
	color: #fff;
}

/* Effect grid - 3 columns */
.ss-transition-effects {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 4px;
}

.ss-transition-effect {
	padding: 8px 4px;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 6px;
	color: rgba(255, 255, 255, 0.6);
	font-size: 11px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s ease;
	text-align: center;
}

.ss-transition-effect:hover {
	background: rgba(255, 255, 255, 0.08);
	color: rgba(255, 255, 255, 0.9);
}

.ss-transition-effect.active {
	background: rgba(255, 255, 255, 0.12);
	border-color: rgba(255, 255, 255, 0.2);
	color: #fff;
}

/* Direction row - progressive disclosure */
.ss-transition-direction-row {
	display: none;
	align-items: center;
	gap: 6px;
	margin-top: 10px;
	padding-top: 10px;
	border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.ss-transition-direction-row.visible {
	display: flex;
}

.ss-transition-label {
	font-size: 10px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.4);
	min-width: 52px;
}

.ss-transition-directions {
	display: flex;
	gap: 4px;
	flex: 1;
}

.ss-transition-dir {
	flex: 1;
	padding: 6px 8px;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 5px;
	color: rgba(255, 255, 255, 0.5);
	font-size: 12px;
	cursor: pointer;
	transition: all 0.15s ease;
	text-align: center;
}

.ss-transition-dir:hover {
	background: rgba(255, 255, 255, 0.08);
	color: rgba(255, 255, 255, 0.9);
}

.ss-transition-dir.active {
	background: rgba(255, 255, 255, 0.12);
	border-color: rgba(255, 255, 255, 0.2);
	color: #fff;
}

.ss-transition-dir.hidden {
	display: none;
}

/* Speed row - stepper design */
.ss-transition-speed-row {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 10px;
	padding-top: 10px;
	border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.ss-transition-speed-stepper {
	display: flex;
	align-items: center;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 6px;
	overflow: hidden;
}

.ss-transition-speed-btn {
	width: 28px;
	height: 26px;
	background: transparent;
	border: none;
	color: rgba(255, 255, 255, 0.5);
	font-size: 14px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s ease;
	display: flex;
	align-items: center;
	justify-content: center;
}

.ss-transition-speed-btn:hover {
	background: rgba(255, 255, 255, 0.08);
	color: rgba(255, 255, 255, 0.9);
}

.ss-transition-speed-btn:active {
	background: rgba(255, 255, 255, 0.12);
}

.ss-transition-speed-btn:disabled {
	opacity: 0.3;
	cursor: not-allowed;
}

.ss-transition-speed-value {
	min-width: 42px;
	padding: 0 4px;
	text-align: center;
	font-size: 11px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.85);
	font-variant-numeric: tabular-nums;
	border-left: 1px solid rgba(255, 255, 255, 0.06);
	border-right: 1px solid rgba(255, 255, 255, 0.06);
}
`;
