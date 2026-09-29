// Speech-to-text (DECISIONS D2): microphone in the webview, bundled whisper.cpp in Rust (src-tauri/src/lib.rs).
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri, getSetting } from "./db";
import { resample } from "./audio";
import { wav16 } from "./wav";

export type SttProvider = "whisper" | "deepgram";
export const sttProvider = async (): Promise<SttProvider> => ((await getSetting("stt")) === "deepgram" ? "deepgram" : "whisper");

// ponytail: the dev browser preview has no keychain, so it keeps the key in localStorage. Never used in the app.
const DEV_KEY = "loalingo.devkey.deepgram";
export const getDeepgramKey = () => (isTauri ? invoke<string | null>("secret_get", { key: "stt-key.deepgram" }) : Promise.resolve(localStorage.getItem(DEV_KEY)));
export async function setDeepgramKey(value: string | null) {
  if (isTauri) return invoke("secret_set", { key: "stt-key.deepgram", value });
  value ? localStorage.setItem(DEV_KEY, value) : localStorage.removeItem(DEV_KEY);
}

const http = (isTauri ? tauriFetch : window.fetch.bind(window)) as typeof fetch;
/** Deepgram nova-3 transcript of a 16 kHz WAV; throws with the server's message on HTTP errors. */
export async function deepgramTranscribe(wav: Uint8Array, lang: string, key?: string | null): Promise<string> {
  key ??= await getDeepgramKey();
  if (!key) throw new Error("No Deepgram key");
  const r = await http(`https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=${encodeURIComponent(lang.slice(0, 2))}`, {
    method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" }, body: wav as BodyInit,
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}

let ready: Promise<boolean> | undefined;
/** Speaking available? Deepgram: key present. Whisper: model present in this build (always false in the browser preview). */
export const sttReady = () => (ready ??= (async () => {
  if ((await sttProvider()) === "deepgram") return !!(await getDeepgramKey().catch(() => null));
  return isTauri ? invoke<boolean>("stt_ready").catch(() => false) : false;
})());
/** Call after the provider or the key changes. */
export const resetSttReady = () => { ready = undefined; };

export const MAX_RECORD_S = 15;

/** Starts recording; `stop()` returns the transcript (`stop(false)` just releases the mic). Auto-stops after MAX_RECORD_S (onAutoStop fires). */
export async function startRecording(lang: string, onAutoStop?: () => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  // ponytail: ScriptProcessor is deprecated but works everywhere without a worklet file
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc);
  proc.connect(ctx.destination);
  const timer = setTimeout(() => onAutoStop?.(), MAX_RECORD_S * 1000);
  let stopped = false;
  return {
    async stop(transcribe = true): Promise<string> {
      if (stopped) return "";
      stopped = true;
      clearTimeout(timer);
      proc.disconnect(); src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      const rate = ctx.sampleRate;
      await ctx.close();
      const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      chunks.reduce((o, c) => (all.set(c, o), o + c.length), 0);
      if (!transcribe || all.length < rate * 0.3) return ""; // under 0.3 s: nothing said
      if ((await sttProvider()) === "deepgram") return deepgramTranscribe(wav16(resample(all, rate)), lang);
      // ponytail: samples go over IPC as JSON numbers (~1 MB for 15 s); raw bytes if it ever feels slow
      return invoke<string>("transcribe", { samples: Array.from(resample(all, rate)), lang });
    },
  };
}
export type Recording = Awaited<ReturnType<typeof startRecording>>;
