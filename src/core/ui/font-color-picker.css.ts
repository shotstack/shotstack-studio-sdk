export const FONT_COLOR_PICKER_STYLES = `
.ss-font-color-picker {
	padding: 16px;
	min-width: 260px;
}

.ss-font-color-tabs {
	display: flex;
	gap: 4px;
	margin-bottom: 16px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.ss-font-color-tab {
	flex: 1;
	padding: 8px 12px;
	background: transparent;
	border: none;
	border-bottom: 2px solid transparent;
	color: rgba(255, 255, 255, 0.6);
	font-size: 12px;
	cursor: pointer;
	transition: all 0.2s;
}

.ss-font-color-tab.active {
	color: rgba(255, 255, 255, 1);
	border-bottom-color: #007AFF;
}

.ss-font-color-tab-content {
	display: none;
}

.ss-font-color-tab-content.active {
	display: block;
}

.ss-font-color-section {
	margin-bottom: 16px;
}

.ss-font-color-section:last-child {
	margin-bottom: 0;
}

.ss-font-color-label {
	font-size: 13px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.9);
	margin-bottom: 8px;
}

.ss-font-color-input {
	width: 100%;
	height: 40px;
	padding: 0;
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 6px;
	cursor: pointer;
	background: transparent;
}

.ss-font-color-input::-webkit-color-swatch-wrapper {
	padding: 4px;
}

.ss-font-color-input::-webkit-color-swatch {
	border: none;
	border-radius: 4px;
}

.ss-font-color-input::-moz-color-swatch {
	border: none;
	border-radius: 4px;
}

.ss-font-color-opacity-row {
	display: flex;
	align-items: center;
	gap: 12px;
}

.ss-font-color-opacity {
	-webkit-appearance: none;
	appearance: none;
	flex: 1;
	height: 4px;
	background: linear-gradient(
		90deg,
		rgba(255, 255, 255, 0) 0%,
		rgba(255, 255, 255, 1) 100%
	);
	border-radius: 2px;
	cursor: pointer;
	outline: none;
}

.ss-font-color-opacity::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 14px;
	height: 14px;
	background: white;
	border-radius: 50%;
	cursor: pointer;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.ss-font-color-opacity::-moz-range-thumb {
	width: 14px;
	height: 14px;
	background: white;
	border: none;
	border-radius: 50%;
	cursor: pointer;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.ss-font-color-opacity-value {
	min-width: 42px;
	text-align: right;
	font-size: 13px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.9);
	font-variant-numeric: tabular-nums;
}
`;
