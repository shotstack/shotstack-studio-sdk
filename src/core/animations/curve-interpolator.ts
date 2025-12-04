export class CurveInterpolator {
	private curves: Record<string, number[][]> = {};

	constructor() {
		this.initializeCurves();
	}

	private initializeCurves(): void {
		this.curves = {
			smooth: [
				[0.5, 0.0],
				[0.5, 1.0]
			],
			ease: [
				[0.25, 0.1],
				[0.25, 1.0]
			],
			easeIn: [
				[0.42, 0.0],
				[1.0, 1.0]
			],
			easeOut: [
				[0.0, 0.0],
				[0.58, 1.0]
			],
			easeInOut: [
				[0.42, 0.0],
				[0.58, 1.0]
			],
			easeInQuad: [
				[0.55, 0.085],
				[0.68, 0.53]
			],
			easeInCubic: [
				[0.55, 0.055],
				[0.675, 0.19]
			],
			easeInQuart: [
				[0.895, 0.03],
				[0.685, 0.22]
			],
			easeInQuint: [
				[0.755, 0.05],
				[0.855, 0.06]
			],
			easeInSine: [
				[0.47, 0.0],
				[0.745, 0.715]
			],
			easeInExpo: [
				[0.95, 0.05],
				[0.795, 0.035]
			],
			easeInCirc: [
				[0.6, 0.04],
				[0.98, 0.335]
			],
			easeInBack: [
				[0.6, -0.28],
				[0.735, 0.045]
			],
			easeOutQuad: [
				[0.25, 0.46],
				[0.45, 0.94]
			],
			easeOutCubic: [
				[0.215, 0.61],
				[0.355, 1.0]
			],
			easeOutQuart: [
				[0.165, 0.84],
				[0.44, 1.0]
			],
			easeOutQuint: [
				[0.23, 1.0],
				[0.32, 1.0]
			],
			easeOutSine: [
				[0.39, 0.575],
				[0.565, 1.0]
			],
			easeOutExpo: [
				[0.19, 1.0],
				[0.22, 1.0]
			],
			easeOutCirc: [
				[0.075, 0.82],
				[0.165, 1.0]
			],
			easeOutBack: [
				[0.175, 0.885],
				[0.32, 1.275]
			],
			easeInOutQuad: [
				[0.455, 0.03],
				[0.515, 0.955]
			],
			easeInOutCubic: [
				[0.645, 0.045],
				[0.355, 1.0]
			],
			easeInOutQuart: [
				[0.77, 0.0],
				[0.175, 1.0]
			],
			easeInOutQuint: [
				[0.86, 0.0],
				[0.07, 1.0]
			],
			easeInOutSine: [
				[0.445, 0.05],
				[0.55, 0.95]
			],
			easeInOutExpo: [
				[1.0, 0.0],
				[0.0, 1.0]
			],
			easeInOutCirc: [
				[0.785, 0.135],
				[0.15, 0.86]
			],
			easeInOutBack: [
				[0.68, -0.55],
				[0.265, 1.55]
			]
		};
	}

	public getValue(from: number, to: number, progress: number, easing?: string): number {
		const handles = this.curves[easing ?? ""] ?? this.curves["ease"];
		const [[controlPoint1X, controlPoint1Y], [controlPoint2X, controlPoint2Y]] = handles;

		const adjustedProgress = progress + (3 * controlPoint1X - 3 * controlPoint2X + 1) * progress * (1 - progress);

		const startValue = from;
		const controlValue1 = from + (to - from) * controlPoint1Y;
		const controlValue2 = from + (to - from) * controlPoint2Y;
		const endValue = to;

		const t = adjustedProgress;
		const oneMinusT = 1 - t;

		return oneMinusT ** 3 * startValue + 3 * oneMinusT ** 2 * t * controlValue1 + 3 * oneMinusT * t ** 2 * controlValue2 + t ** 3 * endValue;
	}
}
