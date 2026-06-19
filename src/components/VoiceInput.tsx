"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconMicrophone,
  IconLoader2,
  IconArrowRight,
  IconPlayerStopFilled,
} from "@tabler/icons-react";

// --- Минимальные типы для Web Speech API (нет в стандартных либах TS) ---
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type Engine = "native" | "whisper";
type Status = "idle" | "recording" | "loading" | "transcribing" | "review";

// Запомненный выбор движка распознавания
const ENGINE_KEY = "bg-voice-engine";

// Whisper хочет моно 16 кГц Float32. Декодируем запись и пересэмплируем.
async function blobToPcm16k(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer();
  const decodeCtx = new AudioContext();
  const decoded = await decodeCtx.decodeAudioData(arrayBuf);
  decodeCtx.close();

  const targetRate = 16000;
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * targetRate),
    targetRate,
  );
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

export default function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [engineLabel, setEngineLabel] = useState<Engine>("native");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const nativeSupportedRef = useRef(false);
  const preferredRef = useRef<Engine | null>(null);
  const modeRef = useRef<Engine>("native");

  // --- Native (Web Speech API: Safari/iOS, настоящий Chrome) ---
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const wantListeningRef = useRef(false);

  // --- Whisper (запасной для браузеров без нативного: Arc/Firefox/Brave) ---
  const workerRef = useRef<Worker | null>(null);
  const modelReadyRef = useRef(false);
  const canceledRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // --- Визуализация ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const energyRef = useRef(0);

  // Инициализация: поддержка, сохранённый выбор, нативный распознаватель
  useEffect(() => {
    const hasMediaRecorder =
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";
    const NativeCtor =
      typeof window !== "undefined"
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;
    nativeSupportedRef.current = !!NativeCtor;

    if (!hasMediaRecorder && !NativeCtor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSupported(false);
      return;
    }

    const saved =
      typeof localStorage !== "undefined"
        ? (localStorage.getItem(ENGINE_KEY) as Engine | null)
        : null;
    if (saved === "native" || saved === "whisper") preferredRef.current = saved;

    if (NativeCtor) setupNative(NativeCtor);

    return () => {
      recognitionRef.current?.abort();
      workerRef.current?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Анимация волны, пока идёт запись/прослушивание
  useEffect(() => {
    if (status !== "recording") return;
    let raf = 0;
    const data = new Uint8Array(analyserRef.current?.frequencyBinCount ?? 128);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      let energy: number;
      if (modeRef.current === "whisper" && analyserRef.current) {
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        energy = Math.min(1, sum / data.length / 128);
      } else {
        // Нативный режим: вспыхиваем на распознанном слове, затем затухаем
        energyRef.current = Math.max(0, energyRef.current * 0.93);
        energy = energyRef.current;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);
      const t = performance.now() / 1000;
      const bars = 28;
      const gap = 3;
      const barW = (w - gap * (bars - 1)) / bars;
      ctx2d.fillStyle = "#ec2b2b";
      for (let i = 0; i < bars; i++) {
        const wave = (Math.sin(t * 7 + i * 0.5) + 1) / 2;
        const amp = 0.08 + wave * (0.12 + 0.88 * energy);
        const barH = Math.max(2, Math.min(1, amp) * h);
        const x = i * (barW + gap);
        const y = (h - barH) / 2;
        ctx2d.beginPath();
        ctx2d.roundRect(x, y, barW, barH, barW / 2);
        ctx2d.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [status]);

  // В режиме проверки фокусируем поле и ставим курсор в конец
  useEffect(() => {
    if (status !== "review") return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [status]);

  // ---------- Нативный движок ----------
  function setupNative(Ctor: new () => SpeechRecognitionLike) {
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interimText += r[0].transcript;
      }
      energyRef.current = 1;
      setInterim(interimText);
    };

    rec.onend = () => {
      // Браузер сам завершил сессию, а мы всё ещё слушаем — перезапускаем
      if (wantListeningRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* ниже финализируем */
        }
      }
      const text = finalRef.current.trim();
      finalRef.current = "";
      const canceled = canceledRef.current;
      canceledRef.current = false;
      setInterim("");
      if (canceled || !text) {
        setStatus("idle");
        return;
      }
      // Не отправляем сразу — даём проверить и поправить
      setTranscript(text);
      setStatus("review");
    };

    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "audio-capture") {
        wantListeningRef.current = false;
        setErrorMsg("Нет доступа к микрофону — разрешите его в браузере.");
        setStatus("idle");
        return;
      }
      if (event.error === "network" || event.error === "service-not-allowed") {
        // Браузер без нативного распознавания. Запоминаем и переключаемся
        // на Whisper — навсегда для этого браузера.
        wantListeningRef.current = false;
        canceledRef.current = true; // подавляем финализацию в onend
        preferredRef.current = "whisper";
        try {
          localStorage.setItem(ENGINE_KEY, "whisper");
        } catch {
          /* private mode */
        }
        void startWhisper();
      }
      // no-speech/aborted — игнорируем, onend разберётся
    };

    recognitionRef.current = rec;
  }

  function startNative() {
    const rec = recognitionRef.current;
    if (!rec) return;
    modeRef.current = "native";
    setEngineLabel("native");
    finalRef.current = "";
    canceledRef.current = false;
    energyRef.current = 0;
    setInterim("");
    setErrorMsg(null);
    try {
      rec.start();
      wantListeningRef.current = true;
      setStatus("recording");
    } catch {
      /* уже запущен */
    }
  }

  // ---------- Whisper ----------
  function ensureWorker() {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      switch (msg.type) {
        case "progress": {
          // События приходят по каждому файлу модели; берём общий процент
          const d = msg.data;
          if (d?.status === "progress" && typeof d.progress === "number") {
            setProgress((prev) => Math.max(prev, Math.round(d.progress)));
          }
          break;
        }
        case "ready": {
          modelReadyRef.current = true;
          // Скачали модель — если уже ждём, показываем «Распознаю…»
          setStatus((s) => (s === "loading" ? "transcribing" : s));
          break;
        }
        case "result": {
          if (canceledRef.current) {
            reset();
            break;
          }
          const text = (msg.text ?? "").trim();
          // Не отправляем сразу — даём пользователю проверить и поправить
          stopStream();
          mediaRecorderRef.current = null;
          chunksRef.current = [];
          setProgress(0);
          setTranscript(text);
          setStatus("review");
          break;
        }
        case "error": {
          setErrorMsg(`Ошибка распознавания: ${msg.message}`);
          reset();
          break;
        }
      }
    };
    workerRef.current = worker;
    return worker;
  }

  async function startWhisper() {
    modeRef.current = "whisper";
    setEngineLabel("whisper");
    setErrorMsg(null);
    canceledRef.current = false;
    const worker = ensureWorker();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Уровень для визуализации
      const audioCtx = new AudioContext();
      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      sourceNode.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void handleRecorded();
      recorder.start();
      mediaRecorderRef.current = recorder;
      setStatus("recording");

      // Параллельно начинаем тянуть модель, пока пользователь говорит
      if (!modelReadyRef.current) worker.postMessage({ type: "load" });
    } catch {
      setErrorMsg("Нет доступа к микрофону — разрешите его в браузере.");
      reset();
    }
  }

  async function handleRecorded() {
    if (canceledRef.current) {
      reset();
      return;
    }
    stopStream();
    const blob = new Blob(chunksRef.current, {
      type: chunksRef.current[0]?.type || "audio/webm",
    });
    chunksRef.current = [];
    if (blob.size === 0) {
      reset();
      return;
    }
    setStatus(modelReadyRef.current ? "transcribing" : "loading");
    try {
      const audio = await blobToPcm16k(blob);
      workerRef.current?.postMessage({ type: "transcribe", audio }, [
        audio.buffer,
      ]);
    } catch {
      setErrorMsg("Не удалось обработать запись.");
      reset();
    }
  }

  // ---------- Общее ----------
  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  function reset() {
    stopStream();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    wantListeningRef.current = false;
    finalRef.current = "";
    setStatus("idle");
    setProgress(0);
    setTranscript("");
    setInterim("");
  }

  // Отправляем подтверждённый (возможно отредактированный) текст
  function submit() {
    const text = transcript.trim();
    if (!text) return;
    reset();
    onTranscript(text);
  }

  function start() {
    setErrorMsg(null);
    const engine =
      preferredRef.current ??
      (nativeSupportedRef.current ? "native" : "whisper");
    if (engine === "native") startNative();
    else void startWhisper();
  }

  // «Закончить»: останавливаем, дальше → экран проверки
  function finish() {
    if (modeRef.current === "native") {
      wantListeningRef.current = false;
      recognitionRef.current?.stop();
    } else {
      mediaRecorderRef.current?.stop();
    }
  }

  function cancel() {
    canceledRef.current = true;
    if (modeRef.current === "native") {
      wantListeningRef.current = false;
      recognitionRef.current?.abort();
      reset();
    } else if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      reset();
    }
  }

  // Сменить движок вручную (доступно, когда есть нативный)
  function switchEngine() {
    const current =
      preferredRef.current ??
      (nativeSupportedRef.current ? "native" : "whisper");
    const next: Engine = current === "native" ? "whisper" : "native";
    preferredRef.current = next;
    try {
      localStorage.setItem(ENGINE_KEY, next);
    } catch {
      /* private mode */
    }
    setEngineLabel(next);
  }

  if (!supported) return null;

  const open = status !== "idle";
  const canSwitch = nativeSupportedRef.current;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={start}
        disabled={disabled || open}
        title="Голосовая команда"
        aria-label="Голосовая команда"
        className="icon-btn control-h w-12 shrink-0"
      >
        <IconMicrophone size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="surface animate-pop-in w-full max-w-md p-6">
            <h2 className="font-display mb-4 text-lg font-extrabold tracking-tight text-ink">
              Голосовая команда
            </h2>

            {status === "recording" && (
              <>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-coral">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-coral" />
                  Слушаю… говорите
                </div>
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={64}
                  className="w-full rounded-xl border-2 border-ink bg-brand-soft"
                />
                {modeRef.current === "native" && (
                  <div className="mt-2 min-h-[1.25rem] text-sm font-medium text-ink">
                    {interim || <span className="text-ink/40">…</span>}
                  </div>
                )}
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={finish}
                    className="btn btn-brand flex-1 py-2.5"
                  >
                    <IconPlayerStopFilled size={18} className="mr-1.5" />
                    Закончить
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    className="btn btn-ghost px-4 py-2.5"
                  >
                    Отмена
                  </button>
                </div>
                {canSwitch && (
                  <button
                    type="button"
                    onClick={switchEngine}
                    className="mt-3 w-full text-center text-[11px] font-semibold text-ink/45 transition hover:text-ink"
                  >
                    Способ: {engineLabel === "native" ? "встроенный" : "Whisper"}{" "}
                    · сменить
                  </button>
                )}
              </>
            )}

            {(status === "loading" || status === "transcribing") && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <IconLoader2 size={28} className="animate-spin text-brand" />
                <div className="text-sm font-semibold text-ink">
                  {status === "loading"
                    ? `Загружаю модель распознавания… ${progress}%`
                    : "Распознаю…"}
                </div>
                {status === "loading" && (
                  <div className="text-xs text-ink/50">
                    Только при первом запуске
                  </div>
                )}
              </div>
            )}

            {status === "review" && (
              <>
                <p className="mb-2 text-xs font-semibold text-ink/55">
                  Проверьте и при необходимости поправьте текст перед отправкой:
                </p>
                <textarea
                  ref={textareaRef}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={3}
                  placeholder="Распознанный текст пуст — продиктуйте заново или впишите команду"
                  className="field w-full resize-none rounded-2xl px-4 py-3 text-sm"
                />
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!transcript.trim()}
                    className="btn btn-brand flex-1 py-2.5"
                  >
                    Отправить
                    <IconArrowRight size={18} stroke={2.5} className="ml-1.5" />
                  </button>
                  <button
                    type="button"
                    onClick={start}
                    className="btn btn-ghost px-4 py-2.5"
                  >
                    Записать заново
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    className="rounded-xl px-2 py-2.5 text-sm font-semibold text-ink/55 transition hover:text-ink"
                  >
                    Отмена
                  </button>
                </div>
              </>
            )}

            {errorMsg && (
              <p className="mt-3 text-xs font-semibold text-coral">{errorMsg}</p>
            )}
          </div>
        </div>
      )}

      {errorMsg && !open && (
        <div className="surface animate-pop-in absolute right-0 top-12 z-20 w-72 p-3 text-xs font-semibold text-coral">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
