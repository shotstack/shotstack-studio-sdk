export const TOOLBAR_STYLES = `
.ss-toolbar {
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
.ss-toolbar.visible { display: flex; }

.ss-toolbar-group { display: flex; align-items: center; gap: 1px; }
.ss-toolbar-group--bordered { background: rgba(255, 255, 255, 0.04); border-radius: 6px; padding: 2px; }
.ss-toolbar-divider { width: 1px; height: 20px; background: rgba(255, 255, 255, 0.1); margin: 0 6px; }

.ss-toolbar-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	background: transparent;
	border: none;
	border-radius: 6px;
	color: rgba(255, 255, 255, 0.65);
	cursor: pointer;
	transition: all 0.15s ease;
	position: relative;
}
.ss-toolbar-btn:hover { background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.95); }
.ss-toolbar-btn.active { background: rgba(255, 255, 255, 0.15); color: #fff; }
.ss-toolbar-btn--text { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
.ss-toolbar-btn--underline { text-decoration: underline; text-underline-offset: 2px; }

.ss-toolbar-value { min-width: 32px; text-align: center; font-size: 12px; font-weight: 500; color: rgba(255, 255, 255, 0.9); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }

.ss-toolbar-color-wrap { position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }
.ss-toolbar-color { width: 22px; height: 22px; padding: 0; border: none; border-radius: 50%; cursor: pointer; background: transparent; }
.ss-toolbar-color::-webkit-color-swatch-wrapper { padding: 0; }
.ss-toolbar-color::-webkit-color-swatch { border: 2px solid rgba(255, 255, 255, 0.2); border-radius: 50%; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3); }
.ss-toolbar-color::-moz-color-swatch { border: 2px solid rgba(255, 255, 255, 0.2); border-radius: 50%; }
.ss-toolbar-color-btn { width: 22px; height: 22px; padding: 0; border: 2px solid rgba(255, 255, 255, 0.2); border-radius: 50%; cursor: pointer; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3); }

.ss-toolbar-dropdown { position: relative; }

.ss-toolbar-popup {
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
	padding: 14px 16px;
	min-width: 200px;
	z-index: 200;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.2);
}
.ss-toolbar-popup.visible { display: block; }
.ss-toolbar-popup::before {
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

.ss-toolbar-popup-header { font-size: 11px; font-weight: 600; color: rgba(255, 255, 255, 0.5); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
.ss-toolbar-popup-row { display: flex; align-items: center; gap: 12px; }
.ss-toolbar-popup-row--buttons { gap: 6px; }
.ss-toolbar-popup-value { min-width: 32px; text-align: right; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.9); font-variant-numeric: tabular-nums; }
.ss-toolbar-popup--wide { min-width: 240px; }
.ss-toolbar-popup-section { margin-bottom: 16px; }
.ss-toolbar-popup-section:last-child { margin-bottom: 0; }
.ss-toolbar-popup-label { font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.9); margin-bottom: 8px; }
.ss-toolbar-popup-divider { height: 1px; background: rgba(255, 255, 255, 0.1); margin: 16px 0; }

.ss-toolbar-slider {
	-webkit-appearance: none;
	appearance: none;
	flex: 1;
	height: 4px;
	background: transparent;
	border-radius: 2px;
	cursor: pointer;
}
.ss-toolbar-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: #fff; border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); transition: transform 0.15s ease; margin-top: -6px; }
.ss-toolbar-slider::-webkit-slider-thumb:hover { transform: scale(1.1); }
.ss-toolbar-slider::-moz-range-thumb { width: 16px; height: 16px; background: #fff; border: none; border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
.ss-toolbar-slider::-webkit-slider-runnable-track { height: 4px; background: rgba(255, 255, 255, 0.15); border-radius: 2px; }
.ss-toolbar-slider::-moz-range-track { height: 4px; background: rgba(255, 255, 255, 0.15); border-radius: 2px; }

.ss-toolbar-anchor-btn {
	flex: 1;
	height: 36px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(255, 255, 255, 0.06);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 6px;
	color: rgba(255, 255, 255, 0.6);
	cursor: pointer;
	transition: all 0.15s ease;
}
.ss-toolbar-anchor-btn:hover { background: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.9); }
.ss-toolbar-anchor-btn.active { background: rgba(255, 255, 255, 0.18); border-color: rgba(255, 255, 255, 0.2); color: #fff; }

.ss-toolbar-btn--font { width: auto; min-width: 48px; padding: 0 8px; gap: 4px; }
.ss-toolbar-font-preview { font-size: 13px; font-weight: 500; letter-spacing: -0.01em; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-toolbar-chevron { opacity: 0.5; flex-shrink: 0; }

.ss-toolbar-popup--font { min-width: 220px; max-height: 340px; overflow-y: auto; padding: 8px; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.2) transparent; }
.ss-toolbar-popup--font::-webkit-scrollbar { width: 6px; }
.ss-toolbar-popup--font::-webkit-scrollbar-track { background: transparent; }
.ss-toolbar-popup--font::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 3px; }
.ss-toolbar-popup--font::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }

.ss-toolbar-font-section { margin-bottom: 8px; }
.ss-toolbar-font-section:last-child { margin-bottom: 0; }
.ss-toolbar-font-section-header { font-size: 10px; font-weight: 600; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 10px 8px; }
.ss-toolbar-font-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: all 0.12s ease; color: rgba(255, 255, 255, 0.85); font-size: 14px; }
.ss-toolbar-font-item:hover { background: rgba(255, 255, 255, 0.08); }
.ss-toolbar-font-item.active { background: rgba(255, 255, 255, 0.12); }
.ss-toolbar-font-item.active::after { content: ""; width: 6px; height: 6px; background: #fff; border-radius: 50%; flex-shrink: 0; margin-left: 8px; }
.ss-toolbar-font-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ss-toolbar-dropdown--size { position: relative; }
.ss-toolbar-size-input { width: 36px; text-align: center; font-size: 12px; font-weight: 500; color: rgba(255, 255, 255, 0.9); background: transparent; border: none; outline: none; font-variant-numeric: tabular-nums; cursor: pointer; padding: 4px 2px; border-radius: 4px; }
.ss-toolbar-size-input:hover { background: rgba(255, 255, 255, 0.08); }
.ss-toolbar-size-input:focus { background: rgba(255, 255, 255, 0.1); cursor: text; }

.ss-toolbar-popup--size { min-width: 80px; max-height: 280px; overflow-y: auto; padding: 6px; }
.ss-toolbar-size-item { padding: 8px 12px; text-align: center; font-size: 13px; color: rgba(255, 255, 255, 0.85); border-radius: 6px; cursor: pointer; transition: background 0.12s ease; }
.ss-toolbar-size-item:hover { background: rgba(255, 255, 255, 0.08); }
.ss-toolbar-size-item.active { background: rgba(255, 255, 255, 0.12); }

.ss-toolbar-btn.ss-toolbar-btn--text-edit { width: auto; min-width: auto; padding: 0 10px; gap: 6px; }
.ss-toolbar-btn--text-edit span { font-size: 12px; font-weight: 500; white-space: nowrap; }

.ss-toolbar-popup--text-edit { min-width: 280px; padding: 14px 16px; }
.ss-toolbar-text-area-wrapper { position: relative; }
.ss-toolbar-text-area {
	width: 100%;
	min-height: 80px;
	max-height: 200px;
	background: rgba(255, 255, 255, 0.06);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 8px;
	padding: 10px 12px;
	color: rgba(255, 255, 255, 0.9);
	font-size: 14px;
	font-family: inherit;
	line-height: 1.5;
	resize: vertical;
	outline: none;
	box-sizing: border-box;
}
.ss-toolbar-text-area:focus { border-color: rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.08); }
.ss-toolbar-text-area::placeholder { color: rgba(255, 255, 255, 0.4); }

/* Autocomplete popup for merge field variables */
.ss-autocomplete-popup {
	display: none;
	position: absolute;
	bottom: calc(100% + 4px);
	left: 0;
	right: 0;
	background: rgba(32, 32, 36, 0.98);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 8px;
	max-height: 160px;
	overflow-y: auto;
	z-index: 300;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.ss-autocomplete-popup.visible { display: block; }
.ss-autocomplete-item {
	padding: 8px 12px;
	cursor: pointer;
	display: flex;
	justify-content: space-between;
	align-items: center;
	transition: background 0.1s ease;
}
.ss-autocomplete-item:hover,
.ss-autocomplete-item.selected { background: rgba(255, 255, 255, 0.1); }
.ss-autocomplete-var {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
	color: rgba(99, 102, 241, 0.9);
	font-size: 13px;
	font-weight: 500;
}
.ss-autocomplete-preview {
	color: rgba(255, 255, 255, 0.4);
	font-size: 12px;
	max-width: 100px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ss-toolbar-checkbox {
	width: 18px;
	height: 18px;
	cursor: pointer;
	accent-color: #007AFF;
}

.ss-toolbar-popup--animation { min-width: 240px; }
.ss-animation-presets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.ss-animation-preset {
	padding: 10px 6px;
	background: rgba(255, 255, 255, 0.06);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 6px;
	color: rgba(255, 255, 255, 0.7);
	cursor: pointer;
	transition: all 0.15s ease;
	font-size: 11px;
	font-weight: 500;
	text-align: center;
	white-space: nowrap;
}
.ss-animation-preset:hover { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.15); color: rgba(255, 255, 255, 0.9); }
.ss-animation-preset.active { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.25); color: #fff; }

/* Transition popup - tabbed design */
.ss-toolbar-popup--transition { min-width: 220px; padding: 12px; }

.ss-transition-tabs { display: flex; background: rgba(255, 255, 255, 0.06); border-radius: 6px; padding: 2px; margin-bottom: 12px; }
.ss-transition-tab { flex: 1; padding: 6px 12px; background: transparent; border: none; border-radius: 4px; color: rgba(255, 255, 255, 0.5); font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; text-transform: uppercase; letter-spacing: 0.03em; }
.ss-transition-tab:hover { color: rgba(255, 255, 255, 0.7); }
.ss-transition-tab.active { background: rgba(255, 255, 255, 0.12); color: #fff; }

.ss-transition-effects { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.ss-transition-effect { padding: 8px 4px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; color: rgba(255, 255, 255, 0.6); font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; text-align: center; }
.ss-transition-effect:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.9); }
.ss-transition-effect.active { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.2); color: #fff; }

.ss-transition-direction-row { display: none; align-items: center; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.06); }
.ss-transition-direction-row.visible { display: flex; }
.ss-transition-label { font-size: 10px; font-weight: 500; color: rgba(255, 255, 255, 0.4); min-width: 52px; }
.ss-transition-directions { display: flex; gap: 4px; flex: 1; }
.ss-transition-dir { flex: 1; padding: 6px 8px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 5px; color: rgba(255, 255, 255, 0.5); font-size: 12px; cursor: pointer; transition: all 0.15s ease; text-align: center; }
.ss-transition-dir:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.9); }
.ss-transition-dir.active { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.2); color: #fff; }
.ss-transition-dir.hidden { display: none; }

.ss-transition-speed-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.06); }
.ss-transition-speed-stepper { display: flex; align-items: center; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; overflow: hidden; }
.ss-transition-speed-btn { width: 28px; height: 26px; background: transparent; border: none; color: rgba(255, 255, 255, 0.5); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; justify-content: center; }
.ss-transition-speed-btn:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.9); }
.ss-transition-speed-btn:active { background: rgba(255, 255, 255, 0.12); }
.ss-transition-speed-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.ss-transition-speed-value { min-width: 42px; padding: 0 4px; text-align: center; font-size: 11px; font-weight: 500; color: rgba(255, 255, 255, 0.85); font-variant-numeric: tabular-nums; border-left: 1px solid rgba(255, 255, 255, 0.06); border-right: 1px solid rgba(255, 255, 255, 0.06); }

/* Effect popup - progressive disclosure design */
.ss-toolbar-popup--effect { min-width: 200px; padding: 12px; }
.ss-effect-types { display: flex; gap: 6px; }
.ss-effect-type { flex: 1; padding: 10px 8px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; color: rgba(255, 255, 255, 0.6); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; text-align: center; }
.ss-effect-type:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.9); }
.ss-effect-type.active { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.2); color: #fff; }

.ss-effect-variant-row { display: none; align-items: center; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.06); animation: fadeSlideIn 0.15s ease; }
.ss-effect-variant-row.visible { display: flex; }
.ss-effect-variants { display: flex; gap: 4px; flex: 1; }
.ss-effect-variant { flex: 1; padding: 6px 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; color: rgba(255, 255, 255, 0.5); font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; text-align: center; }
.ss-effect-variant:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.9); }
.ss-effect-variant.active { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.2); color: #fff; }

.ss-effect-direction-row { display: none; align-items: center; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.06); animation: fadeSlideIn 0.15s ease; }
.ss-effect-direction-row.visible { display: flex; }
.ss-effect-directions { display: flex; gap: 4px; flex: 1; }
.ss-effect-dir { flex: 1; padding: 6px 8px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; color: rgba(255, 255, 255, 0.5); font-size: 13px; cursor: pointer; transition: all 0.15s ease; text-align: center; }
.ss-effect-dir:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.9); }
.ss-effect-dir.active { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.2); color: #fff; }

.ss-effect-speed-row { display: none; align-items: center; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.06); animation: fadeSlideIn 0.15s ease; }
.ss-effect-speed-row.visible { display: flex; }
.ss-effect-label { font-size: 10px; font-weight: 500; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 0.03em; min-width: 52px; }
.ss-effect-speed-stepper { display: flex; align-items: center; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; overflow: hidden; }
.ss-effect-speed-btn { width: 28px; height: 26px; background: transparent; border: none; color: rgba(255, 255, 255, 0.5); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; justify-content: center; }
.ss-effect-speed-btn:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.9); }
.ss-effect-speed-btn:active { background: rgba(255, 255, 255, 0.12); }
.ss-effect-speed-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.ss-effect-speed-value { min-width: 42px; padding: 0 4px; text-align: center; font-size: 11px; font-weight: 500; color: rgba(255, 255, 255, 0.85); font-variant-numeric: tabular-nums; border-left: 1px solid rgba(255, 255, 255, 0.06); border-right: 1px solid rgba(255, 255, 255, 0.06); }

@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
`;
