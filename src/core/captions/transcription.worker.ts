interface TranscribeMessage {
	type: "transcribe";
	audioData: Float32Array;
	modelId: string;
}

interface ProgressMessage {
	type: "progress";
	status: "loading" | "transcribing";
	progress: number;
	message: string;
}

interface CompleteMessage {
	type: "complete";
	chunks: Array<{ text: string; timestamp: [number, number] }>;
}

interface ErrorMessage {
	type: "error";
	message: string;
}

type WorkerMessage = ProgressMessage | CompleteMessage | ErrorMessage;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
let currentModelId: string | null = null;

const MODEL_LOADING_WEIGHT = 0.4; // 0-40%

function postWorkerMessage(message: WorkerMessage): void {
	self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<TranscribeMessage>) => {
	const { type, audioData, modelId } = event.data;

	if (type !== "transcribe") {
		return;
	}

	try {
		if (!transcriber || currentModelId !== modelId) {
			postWorkerMessage({
				type: "progress",
				status: "loading",
				progress: 0,
				message: "Loading AI model..."
			});

			const { pipeline } = await import("@huggingface/transformers");

			transcriber = await pipeline("automatic-speech-recognition", modelId, {
				progress_callback: (data: { progress?: number; status?: string }) => {
					if (data.progress !== undefined) {
						const scaledProgress = Math.round(data.progress * MODEL_LOADING_WEIGHT * 100);
						postWorkerMessage({
							type: "progress",
							status: "loading",
							progress: scaledProgress,
							message: `Loading AI model... ${scaledProgress}%`
						});
					}
				}
			});

			currentModelId = modelId;

			postWorkerMessage({
				type: "progress",
				status: "loading",
				progress: Math.round(MODEL_LOADING_WEIGHT * 100),
				message: "AI model loaded"
			});
		}

		postWorkerMessage({
			type: "progress",
			status: "transcribing",
			progress: Math.round(MODEL_LOADING_WEIGHT * 100),
			message: "Transcribing audio..."
		});

		const result = await transcriber(audioData, {
			return_timestamps: "word",
			chunk_length_s: 30,
			stride_length_s: 5
		});

		postWorkerMessage({
			type: "complete",
			chunks: (result as { chunks?: Array<{ text: string; timestamp: [number, number] }> }).chunks ?? []
		});
	} catch (error) {
		postWorkerMessage({
			type: "error",
			message: error instanceof Error ? error.message : "Transcription failed"
		});
	}
};
