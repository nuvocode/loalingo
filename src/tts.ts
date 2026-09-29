// Text-to-speech (spec D): system voices or local Kokoro (English only). Device setting "tts": "system" | "kokoro".
import { getSetting } from "./db";
import { pickSystemVoice } from "./voices";

export type Voice = { gender: "f" | "m"; kokoro?: string };
type Kokoro = import("kokoro-js").KokoroTTS;

let model: Promise<Kokoro> | undefined;
/** Loads (downloads on first use, then browser-cached) the Kokoro model; `onProgress` gets 0..1 of the first load. */
export function loadKokoro(onProgress: (p: number) => void = () => {}) {
  return (model ??= (async () => {
    const { KokoroTTS } = await import("kokoro-js"); // separate chunk: ~MBs of onnx runtime stay out of the main bundle
    const files: Record<string, [number, number]> = {};
    const progress_callback = (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status !== "progress" || !e.file || !e.total) return;
      files[e.file] = [e.loaded ?? 0, e.total];
      const all = Object.values(files);
      onProgress(all.reduce((n, f) => n + f[0], 0) / all.reduce((n, f) => n + f[1], 0));
    };
    // ponytail: wasm only; kokoro-js wants fp32 (~320 MB) on webgpu, q8 keeps the download at ~90 MB
    return KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "wasm", progress_callback });
  })().catch((e) => { model = undefined; throw e; }));
}

let seq = 0;
let playing: AudioBufferSourceNode | undefined;
let actx: AudioContext | undefined;

/** Silences whatever is speaking (and drops a Kokoro sentence still being generated). */
export function stopSpeaking() {
  seq++;
  speechSynthesis.cancel();
  try { playing?.stop(); } catch { /* already ended */ }
  playing = undefined;
}

function system(text: string, lang: string, gender?: "f" | "m") {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const { voice, pitch } = pickSystemVoice(speechSynthesis.getVoices(), lang, gender);
  if (voice) u.voice = voice;
  u.pitch = pitch;
  speechSynthesis.speak(u);
}

/** One voice at a time: a new call cuts the previous one. Falls back to the system voice if Kokoro fails. */
export async function speak(text: string, lang: string, voice?: Voice) {
  stopSpeaking();
  const mine = seq;
  if (lang.startsWith("en") && (await getSetting("tts")) === "kokoro") {
    try {
      const k = await loadKokoro();
      const a = await k.generate(text, { voice: (voice?.kokoro ?? (voice?.gender === "m" ? "am_michael" : "af_heart")) as "af_heart" });
      if (mine !== seq) return;
      actx ??= new AudioContext();
      await actx.resume();
      const buf = actx.createBuffer(1, a.audio.length, a.sampling_rate);
      buf.copyToChannel(a.audio as Float32Array<ArrayBuffer>, 0);
      const src = actx.createBufferSource();
      src.buffer = buf;
      src.connect(actx.destination);
      src.onended = () => { if (playing === src) playing = undefined; };
      playing = src;
      src.start();
      return;
    } catch (e) {
      console.error(e);
      if (mine !== seq) return;
    }
  }
  system(text, lang, voice?.gender);
}
