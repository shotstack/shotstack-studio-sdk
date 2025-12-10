import type { Cue } from "./parser";
import { TRANSCRIPTION_WORKER_CODE } from "./transcription-worker-code";

export interface TranscriptionProgress {
	status: "loading" | "transcribing" | "complete" | "error";
	progress: number;
	message?: string;
}

export interface TranscriptionResult {
	vtt: string;
	cues: Cue[];
}

export type WhisperModel = "Xenova/whisper-tiny" | "Xenova/whisper-base" | "Xenova/whisper-small";

export interface TranscriptionConfig {
	model?: WhisperModel;
	language?: string;
}

interface WorkerProgressMessage {
	type: "progress";
	status: "loading" | "transcribing";
	progress: number;
	message: string;
}

interface WorkerCompleteMessage {
	type: "complete";
	chunks: Array<{ text: string; timestamp: [number, number] }>;
}

interface WorkerErrorMessage {
	type: "error";
	message: string;
}

type WorkerMessage = WorkerProgressMessage | WorkerCompleteMessage | WorkerErrorMessage;

export class TranscriptionService {
	private worker: Worker | null = null;
	private workerUrl: string | null = null;
	private modelId: WhisperModel;

	constructor(config: TranscriptionConfig = {}) {
		this.modelId = config.model ?? "Xenova/whisper-tiny";
	}

	async transcribe(audioUrl: string, onProgress?: (p: TranscriptionProgress) => void): Promise<TranscriptionResult> {
		if (!this.worker) {
			const blob = new Blob([TRANSCRIPTION_WORKER_CODE], { type: "application/javascript" });
			this.workerUrl = URL.createObjectURL(blob);
			this.worker = new Worker(this.workerUrl, { type: "module" });
		}

		onProgress?.({
			status: "loading",
			progress: 0,
			message: "Loading audio..."
		});

		const audioData = await this.decodeAudioFromUrl(audioUrl);

		onProgress?.({
			status: "loading",
			progress: 5,
			message: "Audio loaded, starting transcription..."
		});

		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Worker not initialized"));
				return;
			}

			this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
				const { data } = event;

				switch (data.type) {
					case "progress":
						onProgress?.({
							status: data.status,
							progress: data.progress,
							message: data.message
						});
						break;

					case "complete": {
						const cues = this.chunksToVTTCues(data.chunks);
						const vtt = this.cuesToVTT(cues);

						onProgress?.({
							status: "complete",
							progress: 100,
							message: "Transcription complete"
						});

						resolve({ vtt, cues });
						break;
					}

					case "error":
						onProgress?.({
							status: "error",
							progress: 0,
							message: data.message
						});
						reject(new Error(data.message));
						break;

					default:
						break;
				}
			};

			// Handle worker errors
			this.worker.onerror = (error: ErrorEvent) => {
				onProgress?.({
					status: "error",
					progress: 0,
					message: error.message || "Worker error"
				});
				reject(new Error(error.message || "Worker error"));
			};

			// Send decoded audio to worker (transfer ownership for performance)
			this.worker.postMessage(
				{
					type: "transcribe",
					audioData,
					modelId: this.modelId
				},
				[audioData.buffer]
			);
		});
	}

	private async decodeAudioFromUrl(audioUrl: string): Promise<Float32Array> {
		const response = await fetch(audioUrl);
		const arrayBuffer = await response.arrayBuffer();

		const audioContext = new AudioContext({ sampleRate: 16000 });

		try {
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			let audioData: Float32Array;
			if (audioBuffer.numberOfChannels > 1) {
				const left = audioBuffer.getChannelData(0);
				const right = audioBuffer.getChannelData(1);
				audioData = new Float32Array(left.length);
				for (let i = 0; i < left.length; i += 1) {
					audioData[i] = (left[i] + right[i]) / 2;
				}
			} else {
				audioData = new Float32Array(audioBuffer.getChannelData(0));
			}

			return audioData;
		} finally {
			await audioContext.close();
		}
	}

	dispose(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		if (this.workerUrl) {
			URL.revokeObjectURL(this.workerUrl);
			this.workerUrl = null;
		}
	}

	private chunksToVTTCues(chunks: Array<{ text: string; timestamp: [number, number] }>): Cue[] {
		if (!chunks || chunks.length === 0) {
			return [];
		}

		const cues: Cue[] = [];
		const WORDS_PER_CUE = 8;

		let currentWords: Array<{ text: string; start: number; end: number }> = [];

		for (const chunk of chunks) {
			const [start, end] = chunk.timestamp;
			const text = chunk.text.trim();

			if (!text) {
				if (currentWords.length > 0) {
					cues.push(this.createCueFromWords(currentWords));
					currentWords = [];
				}
			} else {
				currentWords.push({ text, start, end });

				if (currentWords.length >= WORDS_PER_CUE) {
					cues.push(this.createCueFromWords(currentWords));
					currentWords = [];
				}
			}
		}

		if (currentWords.length > 0) {
			cues.push(this.createCueFromWords(currentWords));
		}

		return cues;
	}

	private createCueFromWords(words: Array<{ text: string; start: number; end: number }>): Cue {
		return {
			start: words[0].start,
			end: words[words.length - 1].end,
			text: words.map(w => w.text).join(" ")
		};
	}

	private cuesToVTT(cues: Cue[]): string {
		const lines: string[] = ["WEBVTT", ""];

		for (const cue of cues) {
			const startTime = this.formatVTTTimestamp(cue.start);
			const endTime = this.formatVTTTimestamp(cue.end);
			lines.push(`${startTime} --> ${endTime}`);
			lines.push(cue.text);
			lines.push("");
		}

		return lines.join("\n");
	}

	private formatVTTTimestamp(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;

		const hh = hours.toString().padStart(2, "0");
		const mm = minutes.toString().padStart(2, "0");
		const ss = secs.toFixed(3).padStart(6, "0");

		return `${hh}:${mm}:${ss}`;
	}
}
