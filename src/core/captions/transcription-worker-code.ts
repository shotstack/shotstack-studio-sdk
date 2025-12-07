/**
 * Inline worker code for transcription.
 * Using a string literal avoids bundler issues with transformers.js.
 * The library is loaded from CDN inside the worker.
 */
export const TRANSCRIPTION_WORKER_CODE = `
let transcriber = null;
let currentModelId = null;

function postWorkerMessage(message) {
  self.postMessage(message);
}

self.onmessage = async (event) => {
  const { type, audioData, modelId } = event.data;
  if (type !== "transcribe") return;

  try {
    if (!transcriber || currentModelId !== modelId) {
      postWorkerMessage({ type: "progress", status: "loading", progress: 0, message: "Loading AI model... 0%" });

      const { pipeline } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3");

      transcriber = await pipeline("automatic-speech-recognition", modelId, {
        dtype: {
          encoder_model: "q8",
          decoder_model_merged: "q8",
        },
        progress_callback: (data) => {
          if (data.progress !== undefined) {
            const pct = Math.round(data.progress);
            postWorkerMessage({ type: "progress", status: "loading", progress: pct, message: "Loading AI model... " + pct + "%" });
          }
        }
      });
      currentModelId = modelId;
      postWorkerMessage({ type: "progress", status: "loading", progress: 100, message: "AI model loaded" });
    }

    postWorkerMessage({ type: "progress", status: "transcribing", progress: 0, message: "Transcribing audio..." });

    const result = await transcriber(audioData, {
      task: "transcribe",
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5
    });

    postWorkerMessage({ type: "complete", chunks: result.chunks || [] });
  } catch (error) {
    postWorkerMessage({ type: "error", message: error.message || "Transcription failed" });
  }
};
`;
