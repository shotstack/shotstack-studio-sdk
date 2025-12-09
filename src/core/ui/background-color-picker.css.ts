export const BACKGROUND_COLOR_PICKER_STYLES = `
.ss-color-picker {
	padding: 16px;
}

.ss-color-picker-header {
	font-size: 11px;
	font-weight: 600;
	color: rgba(255, 255, 255, 0.5);
	text-transform: uppercase;
	letter-spacing: 0.05em;
	margin-bottom: 14px;
}

.ss-color-picker-color-section,
.ss-color-picker-opacity-section {
	margin-bottom: 16px;
}

.ss-color-picker-color-section:last-child,
.ss-color-picker-opacity-section:last-child {
	margin-bottom: 0;
}

.ss-color-picker-label {
	font-size: 13px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.9);
	margin-bottom: 8px;
}

.ss-color-picker-color-wrap {
	display: flex;
	align-items: center;
	gap: 12px;
}

.ss-color-picker-color {
	width: 100%;
	height: 40px;
	padding: 0;
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 6px;
	cursor: pointer;
	background: transparent;
}

.ss-color-picker-color::-webkit-color-swatch-wrapper {
	padding: 4px;
}

.ss-color-picker-color::-webkit-color-swatch {
	border: none;
	border-radius: 4px;
}

.ss-color-picker-color::-moz-color-swatch {
	border: none;
	border-radius: 4px;
}

.ss-color-picker-opacity-row {
	display: flex;
	align-items: center;
	gap: 12px;
}

.ss-color-picker-opacity {
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

.ss-color-picker-opacity::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 14px;
	height: 14px;
	background: white;
	border-radius: 50%;
	cursor: pointer;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.ss-color-picker-opacity::-moz-range-thumb {
	width: 14px;
	height: 14px;
	background: white;
	border: none;
	border-radius: 50%;
	cursor: pointer;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.ss-color-picker-opacity-value {
	min-width: 42px;
	text-align: right;
	font-size: 13px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.9);
	font-variant-numeric: tabular-nums;
}
`;
