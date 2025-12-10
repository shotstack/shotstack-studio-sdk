export const ASSET_TOOLBAR_STYLES = `
.ss-asset-toolbar {
	position: absolute;
	left: 8px;
	top: 50%;
	transform: translateY(-50%);
	display: flex;
	flex-direction: column;
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

.ss-asset-toolbar-btn {
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

.ss-asset-toolbar-btn:hover {
	background: rgba(0, 0, 0, 0.06);
	color: rgba(0, 0, 0, 0.9);
}

.ss-asset-toolbar-btn:active {
	background: rgba(0, 0, 0, 0.1);
	transform: scale(0.95);
}

.ss-asset-toolbar-btn svg {
	width: 18px;
	height: 18px;
	flex-shrink: 0;
}

.ss-asset-toolbar-divider {
	width: 24px;
	height: 1px;
	background: rgba(0, 0, 0, 0.08);
	margin: 4px auto;
}

/* Tooltip */
.ss-asset-toolbar-btn::after {
	content: attr(data-tooltip);
	position: absolute;
	left: calc(100% + 10px);
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

.ss-asset-toolbar-btn::before {
	content: "";
	position: absolute;
	left: calc(100% + 4px);
	top: 50%;
	transform: translateY(-50%);
	border: 5px solid transparent;
	border-right-color: rgba(24, 24, 27, 0.95);
	opacity: 0;
	visibility: hidden;
	transition: opacity 0.15s ease, visibility 0.15s ease;
}

.ss-asset-toolbar-btn:hover::after,
.ss-asset-toolbar-btn:hover::before {
	opacity: 1;
	visibility: visible;
}
`;
