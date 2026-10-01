// Text-to-speech (spec D): system voices, local Piper (every course language) or local Kokoro (English only).
// Device setting "tts": "system" | "piper" | "kokoro". Piper and Kokoro run in workers (src/piper.worker.ts, src/kokoro.worker.ts)
// and stream one sentence at a time, so the first sentence plays while the rest is made.
import { getSetting, isCompanion } from "./db";
import { pickSystemVoice } from "./voices";
import { mouthBright, mouthLevel, remember, zcr } from "./audio";

export type Voice = { gender: "f" | "m"; kokoro?: string };
export type TtsProvider = "system" | "piper" | "kokoro";
type Engine = Exclude<TtsProvider, "system">;
type Chunk = { audio: Float32Array; rate: number };
type Msg = { type: string; id?: number; p?: number; message?: string; voice?: string } & Partial<Chunk>;

export const ttsProvider = async (): Promise<TtsProvider> => {
  if (isCompanion) return "system"; // phone: Kokoro and Piper run out of memory in iOS Safari (docs/MOBILE.md §4)
  const v = await getSetting("tts");
  return v === "kokoro" || v === "piper" ? v : "system";
};

// ponytail: one voice per language and gender; Turkish has no female Piper voice, dfki is the closest
const PIPER: Record<string, Record<"f" | "m", string>> = {
  en: { f: "en_US-hfc_female-medium", m: "en_US-hfc_male-medium" },
  de: { f: "de_DE-kerstin-low", m: "de_DE-thorsten-medium" },
  fr: { f: "fr_FR-siwis-medium", m: "fr_FR-tom-medium" },
  es: { f: "es_ES-sharvard-medium", m: "es_ES-davefx-medium" },
  tr: { f: "tr_TR-dfki-medium", m: "tr_TR-fahrettin-medium" },
};
const piperVoice = (lang: string, gender: "f" | "m" = "f") => PIPER[lang.slice(0, 2)]?.[gender];

/** The local engine and its voice for this language, or null for the system voice. */
async function engineFor(lang: string, voice?: Voice): Promise<[Engine, string] | null> {
  const p = await ttsProvider();
  if (p === "kokoro" && lang.startsWith("en")) return ["kokoro", voice?.kokoro ?? (voice?.gender === "m" ? "am_michael" : "af_heart")];
  const v = p === "piper" && piperVoice(lang, voice?.gender);
  return v ? ["piper", v] : null;
}

const workers: Partial<Record<Engine, Worker>> = {};
const loadListeners: Record<Engine, Set<(m: Msg) => void>> = { kokoro: new Set(), piper: new Set() };
let pending: { id: number; msg: (m: Msg) => void; cancel: () => void } | undefined; // the one speak a worker is working on

function worker(e: Engine) {
  let w = workers[e];
  if (!w) {
    w = workers[e] = e === "kokoro"
      ? new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" })
      : new Worker(new URL("./piper.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = ({ data: m }: MessageEvent<Msg>) => {
      if (m.id === undefined) loadListeners[e].forEach((f) => f(m));
      else if (m.id === pending?.id) pending.msg(m);
    };
    w.onerror = (ev) => {
      const m = { type: "error", message: ev.message || `${e} worker failed` };
      loadListeners[e].forEach((f) => f(m));
      pending?.msg({ ...m, id: pending.id });
    };
  }
  return w;
}

const loads = new Map<string, Promise<void>>();
/** Loads (downloads on first use, then cached) an engine's model; `onProgress` gets 0..1 of the first load. */
function load(e: Engine, voice: string, onProgress: (p: number) => void = () => {}) {
  const key = `${e}:${voice}`;
  // Piper tags its messages with the voice, so two voices loading at once don't answer each other.
  const mine = (m: Msg) => m.voice === undefined || m.voice === voice;
  const progress = (m: Msg) => { if (m.type === "progress" && mine(m)) onProgress(m.p!); };
  loadListeners[e].add(progress);
  let p = loads.get(key);
  if (!p) {
    p = new Promise<void>((ok, no) => {
      const f = (m: Msg) => {
        if (!mine(m)) return;
        if (m.type === "ready") { loadListeners[e].delete(f); ok(); }
        else if (m.type === "error") { loadListeners[e].delete(f); no(new Error(m.message)); }
      };
      loadListeners[e].add(f);
      worker(e).postMessage({ type: "load", voice });
    }).catch((err) => { loads.delete(key); throw err; });
    loads.set(key, p);
  }
  return p.finally(() => loadListeners[e].delete(progress));
}

export const loadKokoro = (onProgress?: (p: number) => void) => load("kokoro", "", onProgress);
/** Loads the Piper voice for a language (the female one unless told otherwise). */
export const loadPiper = (lang: string, onProgress?: (p: number) => void, gender?: "f" | "m") =>
  load("piper", piperVoice(lang, gender) ?? PIPER.en.f, onProgress);

/** Starts loading the local voice this language will use, so the first line is not waiting on the model. */
export async function prewarm(lang: string, voice?: Voice) {
  const got = await engineFor(lang, voice);
  if (got) await load(got[0], got[0] === "kokoro" ? "" : got[1]);
}

let seq = 0;
let sources: AudioBufferSourceNode[] = [];
let actx: AudioContext | undefined;
let analyser: AnalyserNode | undefined; // local-engine audio passes through it so faces can read the loudness
const out = (ctx: AudioContext) => {
  if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.connect(ctx.destination); }
  return analyser;
};
let next = 0; // when the queued sentences end, in AudioContext time
let finish = () => {}; // resolves the current speak()
const cache = new Map<string, Chunk[]>();

/** Silences whatever is speaking (and drops local-engine sentences still being generated). */
export function stopSpeaking() {
  seq++;
  speechSynthesis.cancel();
  for (const s of sources) try { s.stop(); } catch { /* already ended */ }
  sources = [];
  if (pending) { pending.cancel(); pending = undefined; Object.values(workers).forEach((w) => w.postMessage({ type: "cancel" })); }
  finish();
}

/** The system voice list, which browsers fill in after startup: an empty first answer would mean the default (often female) voice. */
function systemVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((ok) => {
    const got = () => { clearTimeout(t); speechSynthesis.removeEventListener("voiceschanged", got); ok(speechSynthesis.getVoices()); };
    const t = setTimeout(got, 1500);
    speechSynthesis.addEventListener("voiceschanged", got);
  });
}

let onStart: ((at: number) => void) | undefined; // the current speak's `started`
const begun = (at = performance.now()) => { const f = onStart; onStart = undefined; f?.(at); };

async function system(text: string, lang: string, gender: "f" | "m" | undefined, mine: number, done: () => void) {
  const voices = await systemVoices();
  if (mine !== seq) return; // cut while waiting
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const { voice, pitch } = pickSystemVoice(voices, lang, gender);
  if (voice) u.voice = voice;
  u.pitch = pitch;
  u.onstart = () => begun();
  u.onend = u.onerror = done;
  speechSynthesis.speak(u);
}

/** Plays local-engine audio for `text`; resolves once the first sentence plays, throws before that to fall back. */
async function viaWorker(e: Engine, text: string, voice: string, mine: number, done: () => void) {
  const key = `${e}:${voice}\n${text}`;
  const ctx = (actx ??= new AudioContext());
  await ctx.resume();
  if (mine !== seq) return; // cut while waiting; `next` belongs to the newer speak now
  next = 0;
  let left = 0, streaming = true, first = true;
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
    if (first) { first = false; begun(performance.now() + (at - ctx.currentTime) * 1000); }
    src.onended = () => { if (--left === 0 && !streaming) done(); };
    sources.push(src);
    src.start(at);
  };
  const hit = cache.get(key);
  if (hit) { remember(cache, key, hit); streaming = false; hit.forEach(play); return; }

  const loading = load(e, e === "kokoro" ? "" : voice);
  // A Piper voice not downloaded yet keeps downloading, but this line falls back to the system voice.
  if (e === "piper" && !(await Promise.race([loading.then(() => true), new Promise((ok) => setTimeout(ok, 5000, false))]))) throw new Error("Piper voice still loading");
  if (mine !== seq) return;
  const got: Chunk[] = [];
  await new Promise<void>((started, failed) => {
    const timer = setTimeout(() => { pending = undefined; failed(new Error(`${e} timed out`)); }, 30_000);
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
          if (got.length) { if (left === 0) done(); started(); } else failed(new Error(m.message ?? `${e} made no audio`));
        }
      },
    };
    worker(e).postMessage({ type: "speak", id: mine, text, voice });
  });
}

/** One voice at a time: a new call cuts the previous one. Resolves when this speech ends or is cut.
 *  Falls back to the system voice if the local engine fails before any audio. `started` gets the time its audio begins. */
export async function speak(text: string, lang: string, voice?: Voice, started?: (at: number) => void): Promise<void> {
  stopSpeaking();
  onStart = started;
  const mine = seq;
  let done!: () => void;
  const over = new Promise<void>((ok) => { done = ok; });
  finish = done;
  const local = await engineFor(lang, voice);
  if (local) {
    try {
      await viaWorker(local[0], text, local[1], mine, done);
      return over;
    } catch (e) {
      console.error(e);
    }
  }
  if (mine !== seq) return over;
  await system(text, lang, voice?.gender, mine, done);
  return over;
}

// ---- Mouth: how open a talking face's mouth is (0..1) and its shape (0 round .. 1 wide), every animation frame ----
const mouthSubs = new Set<(open: number, bright: number) => void>();
const frame = new Float32Array(1024);
let raf = 0, lastT = 0, level = 0, bright = 0;

function tick(t: number) {
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
  lastT = t;
  let rms = 0, rate = 0;
  // The system voice gives no audio to measure: uneven pseudo-syllables (three beats that drift in and out of step) instead of a metronome.
  if (speechSynthesis.speaking) {
    const s = t / 1000, beat = Math.sin(2 * Math.PI * 3.1 * s) * 0.6 + Math.sin(2 * Math.PI * 4.7 * s) * 0.4;
    rms = 0.02 + 0.2 * Math.max(0, beat) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.7 * s));
    rate = 0.03 + 0.07 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 1.9 * s));
  } else if (analyser) {
    analyser.getFloatTimeDomainData(frame);
    rms = Math.sqrt(frame.reduce((n, x) => n + x * x, 0) / frame.length);
    rate = zcr(frame);
  }
  level = mouthLevel(level, rms, dt);
  if (rms > 0.03) bright = mouthBright(bright, rate, dt); // silence is noisy, keep the last vowel's shape
  raf = requestAnimationFrame(tick); // before the callbacks, so one that throws can't stop the loop
  mouthSubs.forEach((f) => f(level, bright));
}

/** Calls `cb` with the mouth openness and shape every frame until the returned function is called. */
export function onMouth(cb: (open: number, bright: number) => void) {
  mouthSubs.add(cb);
  if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
  return () => {
    mouthSubs.delete(cb);
    if (!mouthSubs.size) { cancelAnimationFrame(raf); raf = 0; level = 0; bright = 0; }
  };
}
