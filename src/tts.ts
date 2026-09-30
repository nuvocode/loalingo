// Text-to-speech (spec D): system voices or local Kokoro (English only). Device setting "tts": "system" | "kokoro".
// Kokoro runs in src/kokoro.worker.ts and streams one sentence at a time, so the first sentence plays while the rest is made.
import { getSetting } from "./db";
import { pickSystemVoice } from "./voices";
import { mouthLevel, remember } from "./audio";

export type Voice = { gender: "f" | "m"; kokoro?: string };
type Chunk = { audio: Float32Array; rate: number };
type Msg = { type: string; id?: number; p?: number; message?: string } & Partial<Chunk>;

let worker: Worker | undefined;
const loadListeners = new Set<(m: Msg) => void>();
let pending: { id: number; msg: (m: Msg) => void; cancel: () => void } | undefined; // the one speak Kokoro is working on

function kokoro() {
  if (!worker) {
    worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data: m }: MessageEvent<Msg>) => {
      if (m.id === undefined) loadListeners.forEach((f) => f(m));
      else if (m.id === pending?.id) pending.msg(m);
    };
    worker.onerror = (e) => {
      const m = { type: "error", message: e.message || "Kokoro worker failed" };
      loadListeners.forEach((f) => f(m));
      pending?.msg({ ...m, id: pending.id });
    };
  }
  return worker;
}

let loaded: Promise<void> | undefined;
/** Loads (downloads on first use, then browser-cached) the Kokoro model; `onProgress` gets 0..1 of the first load. */
export function loadKokoro(onProgress: (p: number) => void = () => {}) {
  const progress = (m: Msg) => { if (m.type === "progress") onProgress(m.p!); };
  loadListeners.add(progress);
  loaded ??= new Promise<void>((ok, no) => {
    const f = (m: Msg) => {
      if (m.type === "ready") { loadListeners.delete(f); ok(); }
      else if (m.type === "error") { loadListeners.delete(f); no(new Error(m.message)); }
    };
    loadListeners.add(f);
    kokoro().postMessage({ type: "load" });
  }).catch((e) => { loaded = undefined; throw e; });
  return loaded.finally(() => loadListeners.delete(progress));
}

/** Kokoro is used for this language (English only) when the device setting picks it. */
export const usesKokoro = async (lang: string) => lang.startsWith("en") && (await getSetting("tts")) === "kokoro";

let seq = 0;
let sources: AudioBufferSourceNode[] = [];
let actx: AudioContext | undefined;
let analyser: AnalyserNode | undefined; // Kokoro audio passes through it so faces can read the loudness
const out = (ctx: AudioContext) => {
  if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.connect(ctx.destination); }
  return analyser;
};
let next = 0; // when the queued sentences end, in AudioContext time
let finish = () => {}; // resolves the current speak()
const cache = new Map<string, Chunk[]>();

/** Silences whatever is speaking (and drops Kokoro sentences still being generated). */
export function stopSpeaking() {
  seq++;
  speechSynthesis.cancel();
  for (const s of sources) try { s.stop(); } catch { /* already ended */ }
  sources = [];
  if (pending) { pending.cancel(); pending = undefined; worker?.postMessage({ type: "cancel" }); }
  finish();
}

function system(text: string, lang: string, gender: "f" | "m" | undefined, done: () => void) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const { voice, pitch } = pickSystemVoice(speechSynthesis.getVoices(), lang, gender);
  if (voice) u.voice = voice;
  u.pitch = pitch;
  u.onend = u.onerror = done;
  speechSynthesis.speak(u);
}

/** Plays Kokoro audio for `text`; resolves once the first sentence plays, throws before that to fall back. */
async function viaKokoro(text: string, voice: string, mine: number, done: () => void) {
  const key = `${voice}\n${text}`;
  const ctx = (actx ??= new AudioContext());
  await ctx.resume();
  if (mine !== seq) return; // cut while waiting; `next` belongs to the newer speak now
  next = 0;
  let left = 0, streaming = true;
  const play = (c: Chunk) => {
    if (mine !== seq) return;
    const buf = ctx.createBuffer(1, c.audio.length, c.rate);
    buf.copyToChannel(c.audio as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out(ctx));
    const at = Math.max(ctx.currentTime, next);
    next = at + buf.duration;
    left++;
    src.onended = () => { if (--left === 0 && !streaming) done(); };
    sources.push(src);
    src.start(at);
  };
  const hit = cache.get(key);
  if (hit) { remember(cache, key, hit); streaming = false; hit.forEach(play); return; }

  await loadKokoro();
  if (mine !== seq) return;
  const got: Chunk[] = [];
  await new Promise<void>((started, failed) => {
    const timer = setTimeout(() => { pending = undefined; failed(new Error("Kokoro timed out")); }, 30_000);
    pending = {
      id: mine,
      cancel: () => { clearTimeout(timer); started(); },
      msg: (m) => {
        if (m.type === "chunk") { clearTimeout(timer); got.push(m as Chunk); play(m as Chunk); started(); }
        else if (m.type === "end" || m.type === "error") {
          clearTimeout(timer);
          pending = undefined;
          streaming = false;
          if (m.type === "end") remember(cache, key, got); // ponytail: 20 lines kept, oldest dropped
          if (got.length) { if (left === 0) done(); started(); } else failed(new Error(m.message ?? "Kokoro made no audio"));
        }
      },
    };
    kokoro().postMessage({ type: "speak", id: mine, text, voice });
  });
}

/** One voice at a time: a new call cuts the previous one. Resolves when this speech ends or is cut.
 *  Falls back to the system voice if Kokoro fails before any audio. */
export async function speak(text: string, lang: string, voice?: Voice): Promise<void> {
  stopSpeaking();
  const mine = seq;
  let done!: () => void;
  const over = new Promise<void>((ok) => { done = ok; });
  finish = done;
  if (await usesKokoro(lang)) {
    try {
      await viaKokoro(text, voice?.kokoro ?? (voice?.gender === "m" ? "am_michael" : "af_heart"), mine, done);
      return over;
    } catch (e) {
      console.error(e);
    }
  }
  if (mine !== seq) return over;
  system(text, lang, voice?.gender, done);
  return over;
}

// ---- Mouth: how open a talking face's mouth is, 0..1, every animation frame ----
const mouthSubs = new Set<(open: number) => void>();
const frame = new Float32Array(1024);
let raf = 0, lastT = 0, level = 0;

function tick(t: number) {
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
  lastT = t;
  let rms = 0;
  // The system voice gives no audio to measure: a steady ~3 syllables per second while it speaks.
  if (speechSynthesis.speaking) rms = 0.02 + 0.18 * (0.5 + 0.5 * Math.sin((2 * Math.PI * 3 * t) / 1000));
  else if (analyser) {
    analyser.getFloatTimeDomainData(frame);
    rms = Math.sqrt(frame.reduce((n, x) => n + x * x, 0) / frame.length);
  }
  level = mouthLevel(level, rms, dt);
  raf = requestAnimationFrame(tick); // before the callbacks, so one that throws can't stop the loop
  mouthSubs.forEach((f) => f(level));
}

/** Calls `cb` with the mouth openness every frame until the returned function is called. */
export function onMouth(cb: (open: number) => void) {
  mouthSubs.add(cb);
  if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
  return () => {
    mouthSubs.delete(cb);
    if (!mouthSubs.size) { cancelAnimationFrame(raf); raf = 0; level = 0; }
  };
}
