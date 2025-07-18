import * as PIXI from "pixi.js";
import { 
	TimelineInterface, 
	InteractionState, 
	ClipInfo,
	InteractionThresholds 
} from "./types";
import { DragHandler } from "./drag-handler";
import { ResizeHandler } from "./resize-handler";
import { SnapManager } from "./snap-manager";
import { CollisionDetector } from "./collision-detector";
import { VisualFeedbackManager } from "./visual-feedback-manager";

export class InteractionController {
	private timeline: TimelineInterface;
	private state: InteractionState = { type: 'idle' };
	private abortController?: AbortController;
	
	// Handlers
	private dragHandler: DragHandler;
	private resizeHandler: ResizeHandler;
	private snapManager: SnapManager;
	private collisionDetector: CollisionDetector;
	private visualFeedback: VisualFeedbackManager;
	
	// Default thresholds
	private thresholds: InteractionThresholds = {
		drag: {
			base: 3,
			small: 2
		},
		resize: {
			min: 12,
			max: 20,
			ratio: 0.4
		},
		dropZone: {
			ratio: 0.25
		},
		snap: {
			pixels: 10,
			time: 0.1
		}
	};
	
	constructor(timeline: TimelineInterface, thresholds?: Partial<InteractionThresholds>) {
		this.timeline = timeline;
		
		// Merge custom thresholds
		if (thresholds) {
			this.thresholds = {
				...this.thresholds,
				...thresholds
			};
		}
		
		// Initialize managers
		this.snapManager = new SnapManager(timeline, this.thresholds);
		this.collisionDetector = new CollisionDetector(timeline);
		this.visualFeedback = new VisualFeedbackManager(timeline);
		
		// Initialize handlers
		this.dragHandler = new DragHandler(
			timeline,
			this.thresholds,
			this.snapManager,
			this.collisionDetector,
			this.visualFeedback
		);
		
		this.resizeHandler = new ResizeHandler(timeline, this.thresholds);
	}
	
	public activate(): void {
		this.abortController = new AbortController();
		this.setupEventListeners();
		this.dragHandler.activate();
		this.resizeHandler.activate();
	}
	
	public deactivate(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = undefined;
		}
		this.resetState();
		this.dragHandler.deactivate();
		this.resizeHandler.deactivate();
	}
	
	private setupEventListeners(): void {
		const pixiApp = this.timeline.getPixiApp();
		
		pixiApp.stage.interactive = true;
		
		pixiApp.stage.on("pointerdown", this.handlePointerDown.bind(this), {
			signal: this.abortController?.signal
		});
		pixiApp.stage.on("pointermove", this.handlePointerMove.bind(this), {
			signal: this.abortController?.signal
		});
		pixiApp.stage.on("pointerup", this.handlePointerUp.bind(this), {
			signal: this.abortController?.signal
		});
		pixiApp.stage.on("pointerupoutside", this.handlePointerUp.bind(this), {
			signal: this.abortController?.signal
		});
	}
	
	private handlePointerDown(event: PIXI.FederatedPointerEvent): void {
		const target = event.target as PIXI.Container;
		
		// Check if clicked on a clip
		if (target.label) {
			const clipInfo = this.parseClipLabel(target.label);
			if (clipInfo) {
				// Check if clicking on resize edge
				if (this.resizeHandler.isOnClipRightEdge(clipInfo, event)) {
					if (this.resizeHandler.startResize(clipInfo, event)) {
						this.state = { type: 'resizing', resizeInfo: this.resizeHandler['resizeInfo']! };
					}
					return;
				}
				
				// Start selection (potential drag)
				this.state = {
					type: 'selecting',
					startPos: { x: event.global.x, y: event.global.y },
					clipInfo
				};
				
				// Set cursor to indicate draggable
				this.timeline.getPixiApp().canvas.style.cursor = "grab";
				return;
			}
		}
		
		// Clicked on empty space - clear selection
		this.timeline.getEdit().clearSelection();
	}
	
	private handlePointerMove(event: PIXI.FederatedPointerEvent): void {
		switch (this.state.type) {
			case 'selecting':
				this.handleSelectingMove(event);
				break;
			case 'dragging':
				this.timeline.getPixiApp().canvas.style.cursor = "grabbing";
				this.dragHandler.updateDrag(event);
				break;
			case 'resizing':
				this.timeline.getPixiApp().canvas.style.cursor = "ew-resize";
				this.resizeHandler.updateResize(event);
				break;
			case 'idle':
				this.updateCursorForPosition(event);
				break;
		}
	}
	
	private handlePointerUp(event: PIXI.FederatedPointerEvent): void {
		switch (this.state.type) {
			case 'selecting':
				// Complete selection
				this.timeline.getEdit().selectClip(
					this.state.clipInfo.trackIndex, 
					this.state.clipInfo.clipIndex
				);
				break;
			case 'dragging':
				this.dragHandler.completeDrag(event);
				break;
			case 'resizing':
				this.resizeHandler.completeResize(event);
				break;
		}
		
		this.resetState();
	}
	
	private handleSelectingMove(event: PIXI.FederatedPointerEvent): void {
		if (this.state.type !== 'selecting') return;
		
		const currentPos = { x: event.global.x, y: event.global.y };
		
		if (this.dragHandler.canStartDrag(this.state.startPos, currentPos)) {
			if (this.dragHandler.startDrag(this.state.clipInfo, event)) {
				this.state = { 
					type: 'dragging', 
					dragInfo: this.dragHandler['dragInfo']! 
				};
			}
		}
	}
	
	private updateCursorForPosition(event: PIXI.FederatedPointerEvent): void {
		const target = event.target as PIXI.Container;
		
		if (target.label) {
			const clipInfo = this.parseClipLabel(target.label);
			if (clipInfo) {
				const resizeCursor = this.resizeHandler.getCursorForPosition(clipInfo, event);
				if (resizeCursor) {
					this.timeline.getPixiApp().canvas.style.cursor = resizeCursor;
					return;
				}
				// Show grab cursor for draggable clips
				this.timeline.getPixiApp().canvas.style.cursor = "grab";
				return;
			}
		}
		
		// Default cursor
		this.timeline.getPixiApp().canvas.style.cursor = "default";
	}
	
	private parseClipLabel(label: string): ClipInfo | null {
		if (!label?.startsWith("clip-")) {
			return null;
		}
		
		const parts = label.split("-");
		if (parts.length !== 3) {
			return null;
		}
		
		const trackIndex = parseInt(parts[1], 10);
		const clipIndex = parseInt(parts[2], 10);
		
		if (Number.isNaN(trackIndex) || Number.isNaN(clipIndex)) {
			return null;
		}
		
		return { trackIndex, clipIndex };
	}
	
	private resetState(): void {
		this.state = { type: 'idle' };
		this.visualFeedback.hideAll();
		this.timeline.getPixiApp().canvas.style.cursor = "default";
	}
	
	public dispose(): void {
		this.deactivate();
		this.dragHandler.dispose();
		this.resizeHandler.dispose();
		this.visualFeedback.dispose();
	}
}