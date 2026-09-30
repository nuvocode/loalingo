// Piper runs here for the same reason as Kokoro (src/kokoro.worker.ts): onnx inference would block the UI thread.
// Same messages as the Kokoro worker, plus the voice id in "load"; one sentence per chunk.
import { TtsSession } from "@mintplex-labs/piper-tts-web";

const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);
const sessions = new Map<string, Promise<TtsSession>>();
let current = 0;

function load(voice: string) {
  let s = sessions.get(voice);
  if (!s) {
    // The library keeps one session and would only swap the voice id, not the model: start a fresh one per voice.
    (TtsSession as unknown as { _instance: unknown })._instance = null;
    const progress = (p: { loaded: number; total: number }) => { if (p.total) post({ type: "progress", voice, p: p.loaded / p.total }); };
    s = TtsSession.create({ voiceId: voice as never, progress });
    s.catch(() => sessions.delete(voice));
    sessions.set(voice, s);
  }
  return s;
}

/** The 16-bit mono wav the library returns, as samples. */
async function samples(wav: Blob) {
  const v = new DataView(await wav.arrayBuffer()), audio = new Float32Array((v.byteLength - 44) / 2);
  for (let i = 0; i < audio.length; i++) audio[i] = v.getInt16(44 + i * 2, true) / 32768;
  return { audio, rate: v.getUint32(24, true) };
}

self.onmessage = async ({ data: m }: MessageEvent) => {
  if (m.type === "load") load(m.voice).then(() => post({ type: "ready", voice: m.voice }), (e) => post({ type: "error", voice: m.voice, message: String(e?.message ?? e) }));
  else if (m.type === "cancel") current = 0;
  else if (m.type === "speak") {
    current = m.id;
    try {
      const s = await load(m.voice);
      const sentences = (m.text as string).match(/[^.!?…\n]+[.!?…]*/g)?.map((x) => x.trim()).filter((x) => /\p{L}|\d/u.test(x)) ?? [];
      for (const text of sentences) {
        const { audio, rate } = await samples(await s.predict(text));
        if (current !== m.id) return;
        post({ type: "chunk", id: m.id, audio, rate }, [audio.buffer]);
      }
      if (current === m.id) post({ type: "end", id: m.id });
    } catch (e) {
      post({ type: "error", id: m.id, message: String((e as Error)?.message ?? e) });
    }
  }
};
