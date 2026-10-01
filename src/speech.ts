// Speech signals (SPR-25): fluency and hesitation per utterance, from the mic samples and the transcript. No model, no stored audio.
// Pure module, tested by src/speech.test.ts; measured in listen() (src/stt.ts), saved per call in src/db.ts.
import { VAD, rms } from "./audio.ts"; // .ts: node --test runs this file directly

export type Utterance = {
  latencyMs: number | null; // from the tutor going quiet to the learner starting; null when they spoke again without being prompted
  speechMs: number; // first to last voiced window
  words: number; wpm: number;
  pauseRatio: number; // share of speechMs spent in pauses of MIN_PAUSE_MS or more
  longPauses: number; // quiet stretches over LONG_PAUSE_MS
  level: number; // mean RMS of the voiced windows; only compare against the learner's own average (mics differ)
  fillers: number;
  nativeWords: number; // words in the learner's own language (L1 fallback)
};

const WIN_MS = 20;
export const MIN_PAUSE_MS = 250; // the usual silent-pause cut-off in fluency research
export const LONG_PAUSE_MS = 1000;

// ponytail: common fillers and small native-word lists; whisper drops many fillers, so counts are a floor, not a total.
const FILLERS = new Set(["um", "umm", "uh", "uhh", "er", "erm", "hmm", "mm", "eh", "ee", "eee", "ıı", "ııı", "şey", "äh", "ähm", "öh", "euh", "bah", "este", "pues", "ehm", "cioè", "tipo", "né"]);
const COMMON: Record<string, string[]> = {
  en: ["the", "and", "is", "are", "i", "you", "it", "what", "how", "yes", "no", "not", "this", "that", "my", "with", "but", "know"],
  tr: ["ve", "bir", "bu", "ne", "evet", "hayır", "ben", "sen", "değil", "var", "yok", "için", "ama", "nasıl", "çok", "da", "de", "mi", "bilmiyorum"],
  de: ["und", "ich", "ist", "nicht", "das", "die", "der", "ja", "nein", "was", "wie", "du", "ein", "aber", "mit", "weiß"],
  es: ["que", "y", "es", "no", "sí", "yo", "el", "la", "qué", "cómo", "pero", "con", "por", "muy", "sé"],
  fr: ["et", "je", "est", "pas", "oui", "non", "le", "la", "les", "que", "quoi", "comment", "mais", "avec", "très", "sais"],
  it: ["e", "che", "è", "non", "sì", "io", "il", "la", "cosa", "come", "ma", "con", "per", "molto", "so"],
  pt: ["e", "que", "é", "não", "sim", "eu", "o", "a", "como", "mas", "com", "para", "muito", "sei", "você"],
};
// Natives without Latin letters: any word in their script counts.
const SCRIPT: Record<string, RegExp> = { ru: /\p{Script=Cyrillic}/u, ar: /\p{Script=Arabic}/u, ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u, ko: /\p{Script=Hangul}/u, zh: /\p{Script=Han}/u };

const tokens = (s: string) => s.toLocaleLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);

/** Words that are the learner's own language, not the one they are practising. */
export function nativeCount(words: string[], native: string, target: string): number {
  if (native === target) return 0;
  const script = SCRIPT[native];
  if (script) return SCRIPT[target]?.source === script.source ? 0 : words.filter((w) => script.test(w)).length;
  const mine = new Set(COMMON[native] ?? []), theirs = new Set(COMMON[target] ?? []);
  return words.filter((w) => mine.has(w) && !theirs.has(w)).length;
}

export function speechMetrics(samples: Float32Array, rate: number, transcript: string, timing: { latencyMs: number | null }, native: string, target: string): Utterance {
  const win = Math.max(1, Math.round((rate * WIN_MS) / 1000));
  const voiced: boolean[] = [], levels: number[] = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    const r = rms(samples.subarray(i, i + win)), on = r >= VAD.threshold;
    voiced.push(on);
    if (on) levels.push(r);
  }
  const first = voiced.indexOf(true), last = voiced.lastIndexOf(true);
  let quiet = 0, run = 0, longPauses = 0;
  for (let i = first; first >= 0 && i <= last; i++) {
    if (!voiced[i]) { run++; continue; }
    if (run * WIN_MS >= MIN_PAUSE_MS) quiet += run; // shorter gaps are between words and stop consonants
    if (run * WIN_MS > LONG_PAUSE_MS) longPauses++;
    run = 0;
  }
  const speechMs = first < 0 ? 0 : (last - first + 1) * WIN_MS;
  const all = tokens(transcript), fillers = all.filter((w) => FILLERS.has(w)).length, words = all.length - fillers;
  return {
    latencyMs: timing.latencyMs, speechMs, words,
    wpm: speechMs ? Math.round(words / (speechMs / 60000)) : 0,
    pauseRatio: speechMs ? (quiet * WIN_MS) / speechMs : 0,
    longPauses,
    level: levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0,
    fillers, nativeWords: nativeCount(all, native, target),
  };
}

/** One row per call: averages over utterances that said something, counts summed. */
export type SpeechSummary = {
  utterances: number; silences: number; latencyMs: number | null; wpm: number; pauseRatio: number;
  longPauses: number; level: number; fillers: number; words: number; nativeWords: number; speechMs: number;
};
export function summarize(us: Utterance[], silences: number): SpeechSummary {
  const said = us.filter((u) => u.words > 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const sum = (k: "longPauses" | "fillers" | "words" | "nativeWords" | "speechMs") => us.reduce((n, u) => n + u[k], 0);
  const lat = said.map((u) => u.latencyMs).filter((x): x is number => x !== null);
  return {
    utterances: said.length, silences, latencyMs: lat.length ? Math.round(avg(lat)) : null,
    wpm: Math.round(avg(said.map((u) => u.wpm))), pauseRatio: avg(said.map((u) => u.pauseRatio)), level: avg(said.map((u) => u.level)),
    longPauses: sum("longPauses"), fillers: sum("fillers"), words: sum("words"), nativeWords: sum("nativeWords"), speechMs: sum("speechMs"),
  };
}
