import { LOUDNESS_BLOCK_SECONDS, LOUDNESS_HOP_SECONDS } from "@shotstack/shotstack-canvas/duck";

const SAMPLE_RATE = 48000;

// BS.1770 K-weighting at 48 kHz: a high-shelf then a high-pass, as two biquads in series.
const SHELF_B = [1.53512485958697, -2.69169618940638, 1.19839281085285] as const;
const SHELF_A = [-1.69065929318241, 0.73248077421585] as const;
const HIGHPASS_B = [1, -2, 1] as const;
const HIGHPASS_A = [-1.99004745483398, 0.99007225036621] as const;

// Once the sound stops, the filters' feedback decays into subnormals, which are slow on x86.
// Below this floor a sample's energy is under 1e-60, far beneath the -70 LUFS gate.
const STATE_FLOOR = 1e-30;
const flushed = (state: number): number => (Math.abs(state) < STATE_FLOOR ? 0 : state);

// Filtering a long file in one task freezes the canvas, playhead and input. A slice of half a 60 Hz frame leaves them the rest.
const SLICE_MS = 8;
// Four hops filter in about 0.13 ms on an M2 Pro, so even at 4× CPU throttling a slice overruns by at most about 0.5 ms.
const HOPS_PER_CLOCK_CHECK = 4;

export interface LoudnessScheduling {
	yieldToEventLoop?: () => Promise<void>;
	now?: () => number;
	hopsPerCheck?: number;
}

// Timers are clamped to 4 ms once nested and to 1 s or more in a hidden tab; a message round trip is not.
function messageRoundTrip(): Promise<void> {
	return new Promise<void>(resolve => {
		const { port1, port2 } = new MessageChannel();
		port1.onmessage = () => {
			port1.close();
			resolve();
		};
		port2.postMessage(null);
	});
}

/**
 * Each hop's sum of squared K-weighted samples, for hops `[from, to)` of one channel. Direct form I.
 * `state` is the filters' memory, `[sx1, sx2, sy1, sy2, hx1, hx2, hy1, hy2]`, carried from one range to the next.
 */
function hopEnergies(samples: Float32Array, hop: number, from: number, to: number, state: Float64Array): Float64Array {
	const energies = new Float64Array(to - from);
	let [sx1, sx2, sy1, sy2, hx1, hx2, hy1, hy2] = state;

	for (let h = from; h < to; h += 1) {
		sy1 = flushed(sy1);
		sy2 = flushed(sy2);
		hy1 = flushed(hy1);
		hy2 = flushed(hy2);
		let sum = 0;
		for (let i = h * hop, end = i + hop; i < end; i += 1) {
			const x = samples[i];
			const s = SHELF_B[0] * x + SHELF_B[1] * sx1 + SHELF_B[2] * sx2 - SHELF_A[0] * sy1 - SHELF_A[1] * sy2;
			sx2 = sx1;
			sx1 = x;
			sy2 = sy1;
			sy1 = s;

			const y = HIGHPASS_B[0] * s + HIGHPASS_B[1] * hx1 + HIGHPASS_B[2] * hx2 - HIGHPASS_A[0] * hy1 - HIGHPASS_A[1] * hy2;
			hx2 = hx1;
			hx1 = s;
			hy2 = hy1;
			hy1 = y;

			sum += y * y;
		}
		energies[h - from] = sum;
	}
	state.set([sx1, sx2, sy1, sy2, hx1, hx2, hy1, hy2]);
	return energies;
}

function blocksFrom(hopEnergy: Float64Array, hop: number): Float64Array {
	const hopsPerBlock = Math.round(LOUDNESS_BLOCK_SECONDS / LOUDNESS_HOP_SECONDS);
	// Summed afresh from its hops so rounding can't accumulate across the file.
	const blocks = new Float64Array(hopEnergy.length);
	for (let k = 0; k < hopEnergy.length; k += 1) {
		let energy = 0;
		for (let h = Math.max(0, k - hopsPerBlock + 1); h <= k; h += 1) energy += hopEnergy[h];
		blocks[k] = energy / (hop * hopsPerBlock);
	}
	return blocks;
}

/**
 * Block `k` is the channel sum of mean squares of the K-weighted signal over `[(k + 1) * hop - block, (k + 1) * hop)`,
 * zero-padded before 0. Every channel carries weight 1. Slices end on hop boundaries and carry the filters' state,
 * so `hopsPerCheck` never changes the result.
 */
export async function kWeightedBlocks(
	channels: Float32Array[],
	{ yieldToEventLoop = messageRoundTrip, now = () => performance.now(), hopsPerCheck = HOPS_PER_CLOCK_CHECK }: LoudnessScheduling = {}
): Promise<Float64Array> {
	const hop = Math.round(LOUDNESS_HOP_SECONDS * SAMPLE_RATE);
	const hops = Math.floor((channels[0]?.length ?? 0) / hop);

	const hopEnergy = new Float64Array(hops);
	let sliceStart = now();
	for (const samples of channels) {
		const state = new Float64Array(8);
		for (let from = 0; from < hops; from += hopsPerCheck) {
			const energies = hopEnergies(samples, hop, from, Math.min(from + hopsPerCheck, hops), state);
			for (let i = 0; i < energies.length; i += 1) hopEnergy[from + i] += energies[i];
			if (now() - sliceStart >= SLICE_MS) {
				await yieldToEventLoop();
				sliceStart = now();
			}
		}
	}
	return blocksFrom(hopEnergy, hop);
}

export async function decodeLoudnessBlocks(src: string, fetchImpl?: typeof fetch, scheduling: LoudnessScheduling = {}): Promise<Float64Array | null> {
	try {
		const response = await (fetchImpl ?? fetch)(src);
		if (!response.ok) return null;

		// decodeAudioData resamples to the context's rate and keeps the file's channel count.
		const decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(await response.arrayBuffer());
		const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
		return await kWeightedBlocks(channels, scheduling);
	} catch (error) {
		console.warn("Loudness: could not measure", src, error);
		return null;
	}
}
