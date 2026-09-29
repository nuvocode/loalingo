// Speech-to-text (DECISIONS D2): microphone in the webview, bundled whisper.cpp in Rust (src-tauri/src/lib.rs).
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./db";
import { resample } from "./audio";

let ready: Promise<boolean> | undefined;
/** Model present in this build? Always false in the browser preview (speaking is then hidden). */
export const sttReady = () => (ready ??= isTauri ? invoke<boolean>("stt_ready").catch(() => false) : Promise.resolve(false));

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
      // ponytail: samples go over IPC as JSON numbers (~1 MB for 15 s); raw bytes if it ever feels slow
      return invoke<string>("transcribe", { samples: Array.from(resample(all, rate)), lang });
    },
  };
}
export type Recording = Awaited<ReturnType<typeof startRecording>>;
