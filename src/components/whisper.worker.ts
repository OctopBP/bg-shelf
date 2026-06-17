/// <reference lib="webworker" />
import {
  pipeline,
  env,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

// Модель скачивается с Hugging Face Hub на устройство пользователя при первом
// распознавании и кешируется браузером — в билд сайта она не попадает.
env.allowLocalModels = false;

// small заметно точнее base для русского; ~240 МБ, но это запасной движок —
// его используют только браузеры без нативного распознавания (Arc, Firefox).
const MODEL_ID = "onnx-community/whisper-small";

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function getTranscriber() {
  if (!transcriberPromise) {
    const hasWebGPU =
      typeof navigator !== "undefined" && "gpu" in navigator;
    transcriberPromise = pipeline(
      "automatic-speech-recognition",
      MODEL_ID,
      {
        // q8 — компромисс размер/качество (~80 МБ для base)
        dtype: "q8",
        device: hasWebGPU ? "webgpu" : "wasm",
        progress_callback: (p) => {
          self.postMessage({ type: "progress", data: p });
        },
      },
    ) as Promise<AutomaticSpeechRecognitionPipeline>;
  }
  return transcriberPromise;
}

interface LoadMessage {
  type: "load";
}
interface TranscribeMessage {
  type: "transcribe";
  audio: Float32Array;
}
type IncomingMessage = LoadMessage | TranscribeMessage;

self.addEventListener("message", async (e: MessageEvent<IncomingMessage>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await getTranscriber();
      self.postMessage({ type: "ready" });
      return;
    }
    if (msg.type === "transcribe") {
      const transcriber = await getTranscriber();
      const output = await transcriber(msg.audio, {
        language: "russian",
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const result = Array.isArray(output) ? output[0] : output;
      const text = (result?.text ?? "").trim();
      self.postMessage({ type: "result", text });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
