# T — Tutor görüntülü ders modu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alıştırma ekranından açılan, Preply benzeri canlı ders: solda tutor yüzü + altyazı, sağda kullanıcının kamerası ya da profili, altta Mesaj / Mikrofon / Kamera / Sonlandır çubuğu; tutor her olayda `speak | wait | check_in | end` eylemlerinden birini seçen küçük bir ajan.

**Architecture:** Beyin saf bir modül (`src/tutor.ts`: olay tipleri, şema, prompt, sessizlik/kuyruk kuralları); model çağrısı `src/lessons.ts`'te `tutorTurn` (tek `generate()`). Eller serbest dinleme `src/stt.ts`'te `listen()`, sessizlik algılama saf `vadStep` olarak `src/audio.ts`'te. Ekran `src/TutorCall.tsx`, `Talk.tsx`'teki `Shell/Failed/Done/useQuit/usePrewarm`'ı yeniden kullanır. Giriş `lessonId = "tutor:<char>"`.

**Tech Stack:** React 19 + TS, Vercel AI SDK (`generate` + zod), Web Audio `ScriptProcessor`, `getUserMedia` (ses + video), whisper.cpp / Deepgram, i18next, `node --test`.

**Spec:** [2026-09-30-t-tutor-call-design.md](../specs/2026-09-30-t-tutor-call-design.md)

## Global Constraints

- `node --test` type-stripping: enum / parametre property yok; test dosyalarında göreli importlar `.ts` uzantılı; `tutor.ts` ve `audio.ts` saf kalır (DOM/React/Tauri yok, `tutor.ts`'in tek çalışma zamanı importu `zod`; `./course` yalnız `import type`).
- Eylemler tam olarak: `speak`, `wait`, `check_in`, `end`. Olaylar: `start`, `user_said`, `user_typed`, `silence`, `mic`, `cam`.
- Sessizlik: tutorun son sözü soruysa (`?` ile biter) 20 sn, `wait` sonrası 60 sn; kullanıcı konuşana kadar en fazla 2 `silence` olayı; `end` sonrası yok. Yalnız mikrofon açıkken.
- Ses algılayıcı: eşik RMS 0.015, 150 ms sesle başlar, 1200 ms sessizlikle biter, en fazla 15000 ms.
- `notes` en fazla 300 karakter; prompt'a son 12 mesaj girer.
- XP: kullanıcı turu × 5 + düzeltmesiz tur × 5 + çağrı ≥ 5 dk ise +20, `xpMult(s)` ile; `gems: 0`; `recordSession(kind: "practice")`.
- Kamera görüntüsü hiçbir yere gönderilmez. Tutor konuşurken mikrofon duraklar.
- Yeni kullanıcı metinleri 5 dilde (en, tr, de, fr, es), `tutor.*` altında.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Her görevden sonra: `pnpm test` ve `pnpm -s tsc --noEmit -p .` temiz.

---

### Task 1: Tutor beyni (`src/tutor.ts`) + `tutorTurn`

**Files:**
- Create: `src/tutor.ts`
- Create: `src/tutor.test.ts`
- Modify: `src/lessons.ts` (import satırları + dosya sonuna `tutorTurn`)

**Interfaces:**
- Produces (`src/tutor.ts`): `TUTOR_ACTIONS`, `TutorAction`, `TutorEvent`, `TutorMsg`, `TutorCtx`, `TutorReply`, `tutorSchema`, `looseTutor`, `HISTORY_IN_PROMPT = 12`, `NOTES_MAX = 300`, `SILENCE_S = 20`, `WAIT_S = 60`, `MAX_NUDGES = 2`, `tutorSystem(c: TutorCtx): string`, `describeEvent(e: TutorEvent): string`, `tutorPrompt(name: string, history: TutorMsg[], notes: string, e: TutorEvent): string`, `silenceDelay(last: TutorReply | null, nudges: number): number | null`, `mergeInput(queue: TutorEvent[]): TutorEvent | null`, `isNoise(text: string): boolean`, `currentUnit(level: CourseLevel, done: Set<string>): Unit`.
- Produces (`src/lessons.ts`): `tutorTurn(c: Base, who: CharacterId, unit: Unit, history: TutorMsg[], notes: string, event: TutorEvent): Promise<TutorReply>`.

- [ ] **Step 1: Write the failing test** — `src/tutor.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CourseLevel } from "./course.ts";
import { currentUnit, describeEvent, HISTORY_IN_PROMPT, isNoise, looseTutor, mergeInput, silenceDelay, tutorPrompt, tutorSystem, type TutorMsg, type TutorReply } from "./tutor.ts";

const ctx = { name: "Mia", persona: "Cheerful barista.", target: "English", native: "Turkish", level: "A2", unit: "Food", words: ["apple", "bread"], grammar: ["I like + noun"] };

test("system prompt carries level, languages, unit material and every action", () => {
  const p = tutorSystem(ctx);
  for (const s of ["A2", "English", "Turkish", "Food", "apple, bread", "I like + noun", "speak", "wait", "check_in", "end", "Have you ever", "Cheerful barista."]) assert.ok(p.includes(s), s);
});

test("prompt has the notes, only the latest history and the event", () => {
  const hist: TutorMsg[] = Array.from({ length: 20 }, (_, i) => ({ from: i % 2 ? "me" : "tutor", text: `m${i}`, via: i === 19 ? "text" : "voice" }));
  const p = tutorPrompt("Mia", hist, "on past simple", { kind: "user_typed", text: "one sec" });
  assert.ok(p.includes("on past simple"));
  assert.ok(!p.includes(": m7"), "old turn dropped");
  assert.ok(p.includes(`Mia: m${20 - HISTORY_IN_PROMPT}`));
  assert.ok(p.includes("Learner (typed): m19"));
  assert.ok(p.includes('typed in the chat: "one sec"'));
  assert.ok(tutorPrompt("Mia", [], "", { kind: "start" }).includes("(none yet)"));
});

test("describeEvent covers the events", () => {
  assert.match(describeEvent({ kind: "silence", seconds: 20 }), /20 seconds/);
  assert.match(describeEvent({ kind: "mic", on: false }), /microphone off/);
  assert.match(describeEvent({ kind: "cam", on: true }), /camera on/);
  assert.match(describeEvent({ kind: "user_said", text: "hi" }), /said: "hi"/);
  assert.match(describeEvent({ kind: "start" }), /connected/);
});

test("loose reply: a broken action means speak, missing text is empty", () => {
  assert.deepEqual(looseTutor.parse({ action: "dance", say: "Hi!" }), { action: "speak", say: "Hi!", translation: "", correction: "", notes: "" });
});

test("silence delay: questions 20 s, after wait 60 s, none for statements or an ended call, none after 2 nudges", () => {
  const r = (action: TutorReply["action"], say: string): TutorReply => ({ action, say, translation: "", correction: "", notes: "" });
  assert.equal(silenceDelay(r("speak", "How are you?"), 0), 20);
  assert.equal(silenceDelay(r("wait", "Sure, take your time."), 0), 60);
  assert.equal(silenceDelay(r("speak", "Great."), 0), null);
  assert.equal(silenceDelay(r("end", "Bye?"), 0), null);
  assert.equal(silenceDelay(r("check_in", "Are you there?"), 2), null);
  assert.equal(silenceDelay(null, 0), null);
});

test("mergeInput joins queued learner input and drops the rest", () => {
  assert.equal(mergeInput([]), null);
  assert.equal(mergeInput([{ kind: "silence", seconds: 20 }]), null);
  assert.deepEqual(mergeInput([{ kind: "user_said", text: "I went" }, { kind: "mic", on: true }, { kind: "user_typed", text: "to Rome" }]), { kind: "user_typed", text: "I went to Rome" });
});

test("isNoise: only empty text or bracketed tags", () => {
  assert.ok(isNoise("  "));
  assert.ok(isNoise("[BLANK_AUDIO]"));
  assert.ok(isNoise("(wind blowing)"));
  assert.ok(!isNoise("Yes"));
  assert.ok(!isNoise("Yes [laughs]"));
});

test("currentUnit: the first unit with an unfinished step, else the last", () => {
  const lv = { title: "A1", units: [{ id: "u1", title: "U1", steps: [{ id: "a" }] }, { id: "u2", title: "U2", steps: [{ id: "b" }, { id: "c" }] }] } as unknown as CourseLevel;
  assert.equal(currentUnit(lv, new Set()).id, "u1");
  assert.equal(currentUnit(lv, new Set(["a", "b"])).id, "u2");
  assert.equal(currentUnit(lv, new Set(["a", "b", "c"])).id, "u2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/tutor.test.ts`
Expected: FAIL — `Cannot find module .../src/tutor.ts`.

- [ ] **Step 3: Write `src/tutor.ts`**

```ts
// Tutor call brain (spec T): one event in, one structured reply out. Pure module, tested by src/tutor.test.ts;
// the model call is tutorTurn in src/lessons.ts. New capability = a new TUTOR_ACTIONS value + a handler in TutorCall.
import { z } from "zod";
import type { CourseLevel } from "./course";

export const TUTOR_ACTIONS = ["speak", "wait", "check_in", "end"] as const;
export type TutorAction = (typeof TUTOR_ACTIONS)[number];

export type TutorEvent =
  | { kind: "start" }
  | { kind: "user_said"; text: string }
  | { kind: "user_typed"; text: string }
  | { kind: "silence"; seconds: number }
  | { kind: "mic"; on: boolean }
  | { kind: "cam"; on: boolean };

export type TutorMsg = { from: "tutor" | "me"; text: string; via: "voice" | "text" };

/** What the prompt needs; lessons.ts fills it from the character, the course and the current unit. */
export type TutorCtx = { name: string; persona: string; target: string; native: string; level: string; unit: string; words: string[]; grammar: string[] };

export const tutorSchema = z.object({ action: z.enum(TUTOR_ACTIONS), say: z.string(), translation: z.string(), correction: z.string(), notes: z.string() });
// Small models drop or misspell fields: a broken action means "keep talking", missing text means nothing to show.
export const looseTutor = z.object({
  action: z.enum(TUTOR_ACTIONS).catch("speak"), say: z.string().catch(""), translation: z.string().catch(""),
  correction: z.string().catch(""), notes: z.string().catch(""),
});
export type TutorReply = z.infer<typeof tutorSchema>;

export const HISTORY_IN_PROMPT = 12; // ponytail: older turns live only in `notes`; summarise them if long lessons lose the thread
export const NOTES_MAX = 300;
export const SILENCE_S = 20, WAIT_S = 60, MAX_NUDGES = 2;

export function tutorSystem(c: TutorCtx): string {
  return [
    `You are ${c.name}, a friendly online ${c.target} tutor giving a live one-to-one video lesson inside a language-learning app. The learner is a native ${c.native} speaker at CEFR level ${c.level}.`,
    `Your personality: ${c.persona} Keep your manner, but in this call you are the learner's tutor, not at your usual job.`,
    `Lesson material, the learner's current unit "${c.unit}". Words: ${c.words.join(", ") || "(none)"}. Grammar: ${c.grammar.join(" | ") || "(none)"}.`,
    `Run the lesson like a real tutor: a short warm-up chat, then bring in a topic from the unit and practise its words and grammar with small questions, one step per turn. Then ask a real-life question about the topic ("Have you ever…?"); after the learner answers, ask them to ask you the same question and answer it yourself. If the learner brings up their own topic, follow it and weave the unit in where it fits.`,
    "Each turn you get one event and choose one action:",
    "- speak: say the next thing in the lesson.",
    `- wait: the learner needs a moment (e.g. "my mic isn't working, one sec"); say a very short OK and wait.`,
    "- check_in: the learner has been quiet; gently ask if everything is OK, or repeat your question more simply.",
    "- end: the learner wants to stop or says goodbye; say a warm goodbye.",
    `\`say\`: what you say aloud, ${c.target} only, 1–2 short sentences suited to ${c.level}. Always ${c.target}, even when the learner writes in another language. \`translation\`: \`say\` in ${c.native}.`,
    `\`correction\`: if the learner's latest message has a mistake, the corrected sentence and a very short explanation in ${c.native}; otherwise "". Ignore capitalization, punctuation and obvious speech-to-text slips.`,
    `\`notes\`: your private lesson notes for the next turn, at most ${NOTES_MAX} characters: where the lesson is and what to do next.`,
    "Messages marked (typed) were written in the call chat, not spoken; answer them aloud as usual.",
    "Respond only with JSON matching the schema.",
  ].join("\n");
}

export function describeEvent(e: TutorEvent): string {
  switch (e.kind) {
    case "start": return "The call just connected. Greet the learner warmly and start the warm-up.";
    case "user_said": return `The learner said: "${e.text}"`;
    case "user_typed": return `The learner typed in the chat: "${e.text}"`;
    case "silence": return `The learner has been silent for ${e.seconds} seconds.`;
    case "mic": return e.on ? "The learner turned their microphone on." : "The learner turned their microphone off; they can still type.";
    case "cam": return e.on ? "The learner turned their camera on." : "The learner turned their camera off.";
  }
}

export function tutorPrompt(name: string, history: TutorMsg[], notes: string, e: TutorEvent): string {
  const lines = history.slice(-HISTORY_IN_PROMPT).map((m) => `${m.from === "tutor" ? name : "Learner"}${m.via === "text" ? " (typed)" : ""}: ${m.text}`);
  return [
    `Your notes: ${notes || "(none yet)"}`,
    `Conversation so far:\n${lines.join("\n") || "(nothing yet)"}`,
    `Event: ${describeEvent(e)}`,
    `Choose your action and write ${name}'s turn.`,
  ].join("\n\n");
}

/** Seconds of learner silence before a `silence` event, or null for none. `nudges` = silence events since the learner last spoke. */
export function silenceDelay(last: TutorReply | null, nudges: number): number | null {
  if (!last || last.action === "end" || nudges >= MAX_NUDGES) return null;
  if (last.action === "wait") return WAIT_S;
  return last.say.trim().endsWith("?") ? SILENCE_S : null;
}

/** Learner input queued while the tutor was busy, as one event; null when there is none. */
export function mergeInput(queue: TutorEvent[]): TutorEvent | null {
  const said = queue.flatMap((e) => (e.kind === "user_said" || e.kind === "user_typed" ? [e] : []));
  if (!said.length) return null;
  const kind = said[said.length - 1].kind, text = said.map((e) => e.text).join(" ");
  return kind === "user_said" ? { kind, text } : { kind, text };
}

/** Speech-to-text output that is empty or only a noise tag ("[BLANK_AUDIO]", "(wind)"). One-word answers count. */
export const isNoise = (text: string) => !text.replace(/\[[^\]]*\]|\([^)]*\)/g, "").trim();

/** The unit the learner is on: the first one with an unfinished step, else the last. */
export const currentUnit = (level: CourseLevel, done: Set<string>) =>
  level.units.find((u) => u.steps.some((s) => !done.has(s.id))) ?? level.units[level.units.length - 1];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/tutor.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Add `tutorTurn` to `src/lessons.ts`**

Import satırlarına (mevcut `import { CHARACTERS, ... } from "./characters";` satırının altına) ekle:

```ts
import { looseTutor, tutorPrompt, tutorSchema, tutorSystem, type TutorEvent, type TutorMsg } from "./tutor";
```

Dosyanın en sonuna (`loadGuide`'dan sonra) ekle:

```ts
// ---- Tutor call (spec T): the tutor's reply to one event ----

export function tutorTurn(c: Base, who: CharacterId, unit: Unit, history: TutorMsg[], notes: string, event: TutorEvent) {
  const ch = CHARACTERS[who];
  const system = tutorSystem({
    name: ch.name, persona: ch.persona, target: c.course.name, native: langEn(c.native), level: c.level,
    unit: unit.title, words: unitWords(unit), grammar: unitGrammar(unit),
  });
  return generate(tutorSchema, system, tutorPrompt(ch.name, history, notes, event), undefined, looseTutor);
}
```

- [ ] **Step 6: Full check**

Run: `pnpm test && pnpm -s tsc --noEmit -p .`
Expected: all tests pass, tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/tutor.ts src/tutor.test.ts src/lessons.ts
git commit -m "Add tutor call brain: events, actions and prompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Eller serbest dinleme (`vadStep` + `listen`)

**Files:**
- Modify: `src/audio.ts` (sona ekle)
- Modify: `src/audio.test.ts` (import satırı + sona testler)
- Modify: `src/stt.ts` (import, `startRecording.stop` gövdesi, sona `transcribeSamples` + `listen`)

**Interfaces:**
- Produces (`src/audio.ts`): `VAD`, `Vad`, `VadEvent = "start" | "end" | null`, `VAD_IDLE`, `vadStep(v: Vad, rms: number, ms: number, k = VAD): [Vad, VadEvent]`, `rms(d: Float32Array): number`, `concat(parts: Float32Array[]): Float32Array`.
- Produces (`src/stt.ts`): `type Listener = { pause(): void; resume(): void; stop(): Promise<void> }`, `listen(lang: string, on: { utterance: (text: string) => void; speech?: () => void; level?: (rms: number) => void; error?: (e: Error) => void }): Promise<Listener>`. `utterance` gets the trimmed, non-empty transcript; `speech` fires when the learner starts talking; `level` gets each frame's RMS (0 on pause).

- [ ] **Step 1: Write the failing tests** — `src/audio.test.ts` import satırını değiştir:

```ts
import { VAD_IDLE, concat, mouthLevel, remember, resample, rms, vadStep, type VadEvent } from "./audio.ts";
```

ve dosyanın sonuna ekle:

```ts
/** Feeds 50 ms frames of the given loudness through the detector and lists the events. */
const vad = (frames: number[]) => {
  let v = VAD_IDLE, e: VadEvent;
  const out: string[] = [];
  for (const r of frames) { [v, e] = vadStep(v, r, 50); if (e) out.push(e); }
  return out;
};
const loud = (n: number) => Array(n).fill(0.1), quiet = (n: number) => Array(n).fill(0);

test("vadStep ignores short noise, starts after 150 ms of sound and ends after 1.2 s of quiet", () => {
  assert.deepEqual(vad([0.1, 0, 0.1, 0]), []);
  assert.deepEqual(vad([...loud(3), ...quiet(23)]), ["start"]); // 1150 ms quiet: still one utterance
  assert.deepEqual(vad([...loud(3), ...quiet(24)]), ["start", "end"]);
});

test("vadStep: a short pause does not split an utterance, 15 s is the cap", () => {
  assert.deepEqual(vad([...loud(3), ...quiet(10), ...loud(3), ...quiet(24)]), ["start", "end"]);
  assert.deepEqual(vad(loud(300)), ["start", "end"]);
});

test("rms and concat", () => {
  assert.equal(rms(Float32Array.of(0.5, -0.5)), 0.5);
  assert.equal(rms(new Float32Array(0)), 0);
  assert.deepEqual([...concat([Float32Array.of(1, 2), Float32Array.of(3)])], [1, 2, 3]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/audio.test.ts`
Expected: FAIL — `vadStep` / `VAD_IDLE` is not exported.

- [ ] **Step 3: Add to the end of `src/audio.ts`**

```ts
/** Voice detector knobs (tutor call). RMS is after the browser's noise suppression; raise `threshold` if a noisy room keeps triggering it. */
export const VAD = { threshold: 0.015, startMs: 150, endMs: 1200, maxMs: 15000 };
export type Vad = { speaking: boolean; voiced: number; quiet: number; length: number };
export type VadEvent = "start" | "end" | null;
export const VAD_IDLE: Vad = { speaking: false, voiced: 0, quiet: 0, length: 0 };

/** One mic frame through the voice detector: "start" after `startMs` of sound, "end" after `endMs` of quiet or at `maxMs`. */
export function vadStep(v: Vad, level: number, ms: number, k = VAD): [Vad, VadEvent] {
  const loud = level >= k.threshold;
  if (!v.speaking) {
    const voiced = loud ? v.voiced + ms : 0;
    return voiced >= k.startMs ? [{ speaking: true, voiced, quiet: 0, length: voiced }, "start"] : [{ ...VAD_IDLE, voiced }, null];
  }
  const length = v.length + ms, quiet = loud ? 0 : v.quiet + ms;
  return quiet >= k.endMs || length >= k.maxMs ? [VAD_IDLE, "end"] : [{ ...v, quiet, length }, null];
}

export const rms = (d: Float32Array) => Math.sqrt(d.reduce((s, x) => s + x * x, 0) / (d.length || 1));

export function concat(parts: Float32Array[]): Float32Array {
  const all = new Float32Array(parts.reduce((n, c) => n + c.length, 0));
  parts.reduce((o, c) => (all.set(c, o), o + c.length), 0);
  return all;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/audio.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `src/stt.ts` and add `listen`**

Import satırını değiştir:

```ts
import { VAD_IDLE, concat, resample, rms, vadStep, type VadEvent } from "./audio";
```

`startRecording` içindeki `stop()` gövdesinde şu bloğu:

```ts
      const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      chunks.reduce((o, c) => (all.set(c, o), o + c.length), 0);
      if (!transcribe || all.length < rate * 0.3) return ""; // under 0.3 s: nothing said
      if ((await sttProvider()) === "deepgram") return deepgramTranscribe(wav16(resample(all, rate)), lang);
      // ponytail: samples go over IPC as JSON numbers (~1 MB for 15 s); raw bytes if it ever feels slow
      return invoke<string>("transcribe", { samples: Array.from(resample(all, rate)), lang });
```

şununla değiştir:

```ts
      return transcribe ? transcribeSamples(concat(chunks), rate, lang) : "";
```

Dosyanın sonuna (`export type Recording ...` satırından sonra) ekle:

```ts
/** Transcript of raw mic samples at `rate` Hz; under 0.3 s counts as nothing said. */
async function transcribeSamples(all: Float32Array, rate: number, lang: string): Promise<string> {
  if (all.length < rate * 0.3) return "";
  if ((await sttProvider()) === "deepgram") return deepgramTranscribe(wav16(resample(all, rate)), lang);
  // ponytail: samples go over IPC as JSON numbers (~1 MB for 15 s); raw bytes if it ever feels slow
  return invoke<string>("transcribe", { samples: Array.from(resample(all, rate)), lang });
}

export type Listener = { pause(): void; resume(): void; stop(): Promise<void> };

/** Hands-free listening (tutor call, spec T): the voice detector cuts the mic stream into utterances and each one is transcribed. */
export async function listen(lang: string, on: { utterance: (text: string) => void; speech?: () => void; level?: (rms: number) => void; error?: (e: Error) => void }): Promise<Listener> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1); // ponytail: same deprecated node as startRecording
  let v = VAD_IDLE, e: VadEvent, paused = false, stopped = false, pre: Float32Array[] = [], chunks: Float32Array[] = [];
  const reset = () => { v = VAD_IDLE; pre = []; chunks = []; };
  proc.onaudioprocess = (ev) => {
    if (paused) return;
    const d = new Float32Array(ev.inputBuffer.getChannelData(0));
    const r = rms(d);
    on.level?.(r);
    [v, e] = vadStep(v, r, (d.length / ctx.sampleRate) * 1000);
    if (e === "start") { chunks = [...pre]; on.speech?.(); }
    if (v.speaking || e === "end") chunks.push(d);
    else { pre.push(d); if (pre.length > 3) pre.shift(); } // ~250 ms before the detector fired, so the first syllable is kept
    if (e !== "end") return;
    const all = concat(chunks);
    reset();
    transcribeSamples(all, ctx.sampleRate, lang).then((x) => { if (x.trim()) on.utterance(x.trim()); }, (x) => on.error?.(x as Error));
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  return {
    pause() { paused = true; reset(); on.level?.(0); },
    resume() { paused = false; },
    async stop() {
      if (stopped) return;
      stopped = paused = true;
      proc.disconnect(); src.disconnect();
      stream.getTracks().forEach((x) => x.stop());
      await ctx.close();
    },
  };
}
```

- [ ] **Step 6: Full check**

Run: `pnpm test && pnpm -s tsc --noEmit -p .`
Expected: all pass, tsc silent. (`MicButton` still works through `startRecording`; it is covered by the manual check in Task 4.)

- [ ] **Step 7: Commit**

```bash
git add src/audio.ts src/audio.test.ts src/stt.ts
git commit -m "Add hands-free listening with a voice detector

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Çağrı ekranı (`TutorCall`) + ikonlar, stiller, metinler, izinler

**Files:**
- Create: `src/TutorCall.tsx`
- Modify: `src/Talk.tsx` (`Result`, `Shell`, `Failed`, `Done`, `usePrewarm`, `useQuit` → `export`)
- Modify: `src/icons.tsx` (`chat`, `phone` ikonları)
- Modify: `src/styles.css` (sona `.call-*` stilleri)
- Modify: `src/locales/{en,tr,de,fr,es}.json` (`tutor` bloğu)
- Modify: `src-tauri/Info.plist`, `src-tauri/Entitlements.plist`

**Interfaces:**
- Consumes: Task 1 `tutorTurn`, `currentUnit`, `isNoise`, `mergeInput`, `silenceDelay`, `NOTES_MAX`, tipler; Task 2 `listen`, `Listener`, `sttReady`.
- Produces: `export function TutorCall({ who }: { who: CharacterId })` — Task 4 bunu `App.tsx`'ten açar. Locale anahtarları `tutor.card`, `tutor.cardDesc`, `tutor.pick` Task 4'te kullanılır.

- [ ] **Step 1: Export the shared pieces in `src/Talk.tsx`**

Şu tanımların başına `export` ekle (gövdeler aynı kalır):

```ts
export type Result = { xp: number; gems: number };
export function Shell(...
export function Failed(...
export function Done(...
export function usePrewarm(...
export function useQuit(...
```

- [ ] **Step 2: Add icons** — `src/icons.tsx`'te `video:` satırının altına:

```ts
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8M8 12.5h5"/></svg>',
  phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13.5c5-4.7 13-4.7 18 0l-2.2 2.7-3.6-1.3v-2.6a11 11 0 0 0-6.4 0v2.6l-3.6 1.3L3 13.5Z"/></svg>',
```

`IconName` tipi `keyof typeof I` ise başka değişiklik gerekmez; değilse aynı dosyada türetildiği yere bu iki adı ekle.

- [ ] **Step 3: Add locale keys** — şu betiği çalıştır (her dosyaya üst düzey `tutor` bloğu ekler):

```bash
node -e '
const fs = require("fs");
const T = {
  en: { card: "Lesson with a tutor", cardDesc: "A live video lesson on your current unit", pick: "Who should teach you today?", message: "Messages", micOn: "Turn microphone on", micOff: "Turn microphone off", micDenied: "Microphone isn’t available — type instead", camOn: "Turn camera on", camOff: "Turn camera off", camDenied: "Camera isn’t available", end: "End call", placeholder: "Write a message — your tutor answers out loud", done: "Lesson complete!", corrections: "Corrections from this lesson" },
  tr: { card: "Tutor ile ders", cardDesc: "Bulunduğun ünite üzerine canlı görüntülü ders", pick: "Bugün sana kim ders versin?", message: "Mesajlar", micOn: "Mikrofonu aç", micOff: "Mikrofonu kapat", micDenied: "Mikrofon kullanılamıyor — yazarak devam et", camOn: "Kamerayı aç", camOff: "Kamerayı kapat", camDenied: "Kamera kullanılamıyor", end: "Aramayı bitir", placeholder: "Mesaj yaz — tutor sesli cevap verir", done: "Ders tamamlandı!", corrections: "Bu dersteki düzeltmeler" },
  de: { card: "Unterricht mit Tutor", cardDesc: "Eine Live-Videostunde zu deiner aktuellen Einheit", pick: "Wer soll dich heute unterrichten?", message: "Nachrichten", micOn: "Mikrofon einschalten", micOff: "Mikrofon ausschalten", micDenied: "Mikrofon nicht verfügbar – schreib stattdessen", camOn: "Kamera einschalten", camOff: "Kamera ausschalten", camDenied: "Kamera nicht verfügbar", end: "Anruf beenden", placeholder: "Schreib eine Nachricht – dein Tutor antwortet laut", done: "Stunde geschafft!", corrections: "Korrekturen aus dieser Stunde" },
  fr: { card: "Cours avec un tuteur", cardDesc: "Un cours vidéo en direct sur ton unité actuelle", pick: "Qui t’enseigne aujourd’hui ?", message: "Messages", micOn: "Activer le micro", micOff: "Couper le micro", micDenied: "Micro indisponible — écris plutôt", camOn: "Activer la caméra", camOff: "Couper la caméra", camDenied: "Caméra indisponible", end: "Raccrocher", placeholder: "Écris un message — ton tuteur répond à voix haute", done: "Cours terminé !", corrections: "Corrections de ce cours" },
  es: { card: "Clase con tutor", cardDesc: "Una clase en vídeo en directo sobre tu unidad actual", pick: "¿Quién te da clase hoy?", message: "Mensajes", micOn: "Activar micrófono", micOff: "Silenciar micrófono", micDenied: "Micrófono no disponible: escribe en su lugar", camOn: "Activar cámara", camOff: "Apagar cámara", camDenied: "Cámara no disponible", end: "Colgar", placeholder: "Escribe un mensaje: tu tutor responde en voz alta", done: "¡Clase terminada!", corrections: "Correcciones de esta clase" },
};
for (const [l, v] of Object.entries(T)) {
  const f = `src/locales/${l}.json`, j = JSON.parse(fs.readFileSync(f, "utf8"));
  j.tutor = v;
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
}'
git diff --stat src/locales
```

Expected: her dosyada yalnız ~16 satır ekleme. Başka satırlar değiştiyse (ör. farklı girinti/kaçış), betiği geri al (`git checkout src/locales`) ve `tutor` bloğunu elle, dosyanın mevcut biçimiyle en sona ekle.

- [ ] **Step 4: Camera permission** — `src-tauri/Info.plist`'te `NSMicrophoneUsageDescription` `<string>` satırının altına:

```xml
  <key>NSCameraUsageDescription</key>
  <string>Sprigo shows your camera to you during tutor lessons. The picture stays on this Mac and is never uploaded.</string>
```

`src-tauri/Entitlements.plist`'te `audio-input` `<true/>` satırının altına:

```xml
  <!-- Tutor call camera preview (spec T); stays local. -->
  <key>com.apple.security.device.camera</key>
  <true/>
```

- [ ] **Step 5: Add styles** — `src/styles.css` sonuna:

```css
/* Tutor call (spec T) */
.call-grid{width:100%;max-width:1100px;display:grid;grid-template-columns:1fr 1fr;gap:16px;min-height:440px}
.call-grid.with-drawer{grid-template-columns:1fr 1fr 320px}
.call-pane{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;border-radius:var(--r);background:var(--surface);overflow:hidden;text-align:center}
.call-pane.me{box-shadow:inset 0 0 0 calc(var(--level,0) * 6px) var(--green);transition:box-shadow .08s linear}
.call-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.call-caption{max-width:440px;display:flex;flex-direction:column;gap:4px;font-size:18px;font-weight:700;color:var(--text)}
.call-caption small{font-size:14px;font-weight:600;color:var(--text-faint)}
.call-fix{max-width:440px;padding:8px 12px;border-radius:var(--r);background:var(--gold-tint);color:var(--gold-dark)}
.call-fixes{display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:16px}
.call-drawer{display:flex;flex-direction:column;gap:10px;min-height:0;max-height:440px}
.call-drawer .chat{flex:1;overflow-y:auto}
.call-bar{display:flex;gap:12px;margin:0 auto}
.call-btn{width:52px;height:52px;border-radius:99px;display:flex;align-items:center;justify-content:center;background:var(--surface);color:var(--text)}
.call-btn.on{background:var(--blue);color:var(--on-accent)}
.call-btn.off{color:var(--red)}
.call-btn.end{background:var(--red);color:var(--on-accent)}
.call-btn:disabled{opacity:.4;cursor:not-allowed}
@media (max-width:760px){.call-grid,.call-grid.with-drawer{grid-template-columns:1fr}}
```

- [ ] **Step 6: Write `src/TutorCall.tsx`**

```tsx
// Tutor video call (spec T): the tutor on the left, the learner's camera or profile on the right, a thin control bar below.
// Each event (speech, a typed message, silence, mic/cam toggles) gets one model reply; the rules live in src/tutor.ts.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import { useApp } from "./store";
import { sfx } from "./Lesson";
import { speak, stopSpeaking } from "./tts";
import { listen, sttReady, type Listener } from "./stt";
import { Face, type FaceState } from "./face/Face";
import { Avatar } from "./screens/Profiles";
import { CHARACTERS, type CharacterId } from "./characters";
import { tutorTurn } from "./lessons";
import { NOTES_MAX, currentUnit, isNoise, mergeInput, silenceDelay, type TutorEvent, type TutorMsg, type TutorReply } from "./tutor";
import { recordSession, today, xpMult } from "./progress";
import { Done, Failed, Shell, useQuit, usePrewarm, type Result } from "./Talk";

const BONUS_MS = 5 * 60_000; // a call this long earns +20 XP

/** Mutable call state read by async callbacks (timers, the mic), so it lives in a ref, not in React state. */
type Call = {
  hist: TutorMsg[]; notes: string; last: TutorReply | null; queue: TutorEvent[]; fixes: string[];
  nudges: number; // silence events since the learner last said something
  running: boolean; over: boolean; opened: boolean; micOn: boolean; failed: TutorEvent | null;
};

export function TutorCall({ who }: { who: CharacterId }) {
  const { t } = useTranslation();
  const { course, enrollment, profile, done, s, setS, gainXp, toast } = useApp();
  const ch = CHARACTERS[who];
  const lang = course?.iso ?? "en";
  const levelDef = course && enrollment ? course.levels[enrollment.level] : undefined;
  const unit = levelDef ? currentUnit(levelDef, done) : undefined;
  usePrewarm(lang);

  const c = useRef<Call>({ hist: [], notes: "", last: null, queue: [], fixes: [], nudges: 0, running: false, over: false, opened: false, micOn: false, failed: null }).current;
  const mic = useRef<Listener | null>(null);
  const cam = useRef<MediaStream | null>(null);
  const ring = useRef<HTMLElement>(null);
  const silence = useRef<ReturnType<typeof setTimeout>>(undefined);
  const started = useRef(Date.now());

  const [msgs, setMsgs] = useState<TutorMsg[]>([]);
  const [last, setLast] = useState<TutorReply | null>(null);
  const [thinking, setThinking] = useState(false);
  const [talking, setTalking] = useState(false);
  const [err, setErr] = useState("");
  const [showTr, setShowTr] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micBlock, setMicBlock] = useState<string | null>(null); // i18n key: why the mic can't be used
  const [camOn, setCamOn] = useState(false);
  const [camOk, setCamOk] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [text, setText] = useState("");
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<(Result & { fixes: string[] }) | null>(null);
  const { quit, askQuit } = useQuit(!result);

  const push = (m: TutorMsg) => { c.hist = [...c.hist, m]; setMsgs(c.hist); };
  const clearSilence = () => clearTimeout(silence.current);
  const armSilence = () => {
    clearSilence();
    const sec = c.micOn && !c.over && !c.failed ? silenceDelay(c.last, c.nudges) : null;
    if (sec) silence.current = setTimeout(() => { c.nudges++; fire({ kind: "silence", seconds: sec }); }, sec * 1000);
  };

  const voice = async (line: string) => {
    if (!line.trim() || c.over) return;
    mic.current?.pause(); setTalking(true); // the mic would hear the tutor
    try { await speak(line, lang, { gender: ch.gender, kokoro: ch.kokoroVoice }); } catch { /* the caption still shows it */ }
    finally { setTalking(false); mic.current?.resume(); }
  };

  /** One event → one reply, spoken. False when the model call failed. */
  const step = async (e: TutorEvent) => {
    if (!course || !enrollment || !profile || !unit) return false;
    setThinking(true); setErr("");
    try {
      const r = await tutorTurn({ course, level: enrollment.level, native: profile.native_lang }, who, unit, c.hist, c.notes, e);
      if (c.over) return true;
      c.notes = r.notes.slice(0, NOTES_MAX); c.last = r; c.failed = null;
      if (r.correction.trim()) c.fixes.push(r.correction.trim());
      if (r.say.trim()) push({ from: "tutor", text: r.say.trim(), via: "voice" });
      setLast(r); setShowTr(false); setThinking(false);
      await voice(r.say);
      if (r.action === "end") finish();
      return true;
    } catch (x) {
      c.failed = e; setErr((x as Error).message); setThinking(false);
      return false;
    }
  };

  /** Runs events one at a time; learner input that arrives meanwhile is merged into the next event. */
  const run = async (first: TutorEvent) => {
    c.running = true; clearSilence();
    let e: TutorEvent | null = first;
    while (e && !c.over && (await step(e))) e = mergeInput(c.queue.splice(0));
    c.running = false;
    armSilence();
  };
  const fire = (e: TutorEvent) => {
    if (c.over) return;
    if (!c.running) return void run(e);
    if (e.kind === "user_said" || e.kind === "user_typed") c.queue.push(e); // silence and toggles while busy are dropped
  };
  const input = (kind: "user_said" | "user_typed", said: string) => {
    if (isNoise(said)) return;
    c.nudges = 0;
    push({ from: "me", text: said.trim(), via: kind === "user_said" ? "voice" : "text" });
    fire({ kind, text: said.trim() });
  };
  const retry = () => { const e = c.failed; c.failed = null; setErr(""); if (e) fire(e); };

  const micStart = async (announce: boolean) => {
    try {
      const m = await listen(lang, {
        utterance: (x) => input("user_said", x),
        speech: clearSilence, // the learner started talking: no nudge mid-sentence
        level: (r) => ring.current?.style.setProperty("--level", String(Math.min(1, r * 10))),
        error: (x) => toast(x.message),
      });
      if (c.over) return void m.stop();
      mic.current = m; c.micOn = true; setMicOn(true);
      if (announce) fire({ kind: "mic", on: true });
      else if (!c.running) armSilence();
    } catch { setMicBlock("tutor.micDenied"); setDrawer(true); }
  };
  const micStop = () => {
    c.micOn = false; setMicOn(false); clearSilence();
    ring.current?.style.setProperty("--level", "0");
    const m = mic.current; mic.current = null;
    return m?.stop();
  };
  const toggleMic = () => { if (micOn) { void micStop(); fire({ kind: "mic", on: false }); } else void micStart(true); };

  const camStop = () => { cam.current?.getTracks().forEach((x) => x.stop()); cam.current = null; setCamOn(false); };
  const toggleCam = async () => {
    if (cam.current) { camStop(); return fire({ kind: "cam", on: false }); }
    try { cam.current = await navigator.mediaDevices.getUserMedia({ video: true }); setCamOn(true); fire({ kind: "cam", on: true }); }
    catch { setCamOk(false); }
  };

  const finish = () => {
    if (c.over) return;
    c.over = true; void micStop(); camStop(); stopSpeaking();
    const mine = c.hist.filter((m) => m.from === "me").length;
    const clean = Math.max(0, mine - c.fixes.length);
    const xp = (mine * 5 + clean * 5 + (Date.now() - started.current >= BONUS_MS ? 20 : 0)) * xpMult(s);
    if (xp) { setS((s) => recordSession(s, { xp, gems: 0, kind: "practice" }, today())); gainXp(xp); }
    sfx("done");
    setResult({ xp, gems: 0, fixes: [...c.fixes] });
  };
  const end = () => (c.hist.some((m) => m.from === "me") ? finish() : quit());

  useEffect(() => {
    c.over = false; // StrictMode mounts twice: the first cleanup must not end the call
    if (!c.opened) {
      c.opened = true;
      sttReady().then((ok) => {
        if (ok && s.speakOn) return micStart(false);
        setMicBlock(ok ? "stt.off" : "stt.unavailable"); setDrawer(true);
      });
      fire({ kind: "start" });
    }
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(tick); c.over = true; clearSilence(); void mic.current?.stop(); mic.current = null; camStop(); stopSpeaking(); };
  }, []);

  const faceState: FaceState = thinking ? "thinking" : talking ? "talking" : "idle";
  const micLabel = t(micOn ? "tutor.micOff" : "tutor.micOn"), camLabel = t(camOn ? "tutor.camOff" : "tutor.camOn");
  let body: React.ReactNode, footer: React.ReactNode;
  if (result) {
    body = <>
      <Done title={t("tutor.done")} r={result} />
      {result.fixes.length > 0 && <div className="call-fixes">
        <h3>{t("tutor.corrections")}</h3>
        {result.fixes.map((f, i) => <p key={i} className="call-fix small"><Icon name="spark" /> {f}</p>)}
      </div>}
    </>;
    footer = <><span /><button className="btn btn-primary" onClick={quit}>{t("lesson.end")}</button></>;
  } else {
    body = err ? <Failed msg={err} retry={retry} quit={quit} /> : (
      <div className={`call-grid${drawer ? " with-drawer" : ""}`}>
        <section className="call-pane" aria-label={ch.name}>
          <Face spec={ch.face} color={ch.color} size={200} label={ch.name} state={faceState} />
          <b>{ch.name}</b>
          {last?.say && <button className="call-caption" lang={lang} onClick={() => setShowTr((v) => !v)}>
            <span>{last.say}</span>{showTr && <small>{last.translation}</small>}
          </button>}
          {last?.correction.trim() && <p className="call-fix small"><Icon name="spark" /> {last.correction}</p>}
        </section>
        <section className="call-pane me" ref={ring} aria-label={profile?.name}>
          {camOn
            ? <video className="call-video" autoPlay muted playsInline ref={(el) => { if (el && el.srcObject !== cam.current) el.srcObject = cam.current; }} />
            : profile && <><Avatar p={profile} size={96} /><b>{profile.name}</b></>}
        </section>
        {drawer && <section className="call-drawer" aria-label={t("tutor.message")}>
          <div className="chat">
            {msgs.map((m, i) => <div key={i} className={`bubble${m.from === "me" ? " me" : ""}`} lang={lang}><span>{m.text}</span></div>)}
          </div>
          <input className="input" lang={lang} value={text} autoFocus aria-label={t("roleplay.message")} placeholder={t("tutor.placeholder")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { input("user_typed", text); setText(""); } }} />
        </section>}
      </div>
    );
    footer = (
      <div className="call-bar">
        <button className={`call-btn${drawer ? " on" : ""}`} onClick={() => setDrawer((d) => !d)} aria-pressed={drawer} aria-label={t("tutor.message")} title={t("tutor.message")}><Icon name="chat" /></button>
        <button className={`call-btn${micOn ? " on" : " off"}`} disabled={!!micBlock} onClick={toggleMic} aria-pressed={micOn} aria-label={micLabel} title={micBlock ? t(micBlock) : micLabel}><Icon name="mic" /></button>
        <button className={`call-btn${camOn ? " on" : " off"}`} disabled={!camOk} onClick={toggleCam} aria-pressed={camOn} aria-label={camLabel} title={camOk ? camLabel : t("tutor.camDenied")}><Icon name="video" /></button>
        <button className="call-btn end" onClick={end} aria-label={t("tutor.end")} title={t("tutor.end")}><Icon name="phone" /></button>
      </div>
    );
  }
  return <Shell label={ch.name} progress={result ? 100 : Math.min(100, ((now - started.current) / BONUS_MS) * 100)} onClose={askQuit} body={body} footer={footer} />;
}
```

- [ ] **Step 7: Full check**

Run: `pnpm test && pnpm -s tsc --noEmit -p .`
Expected: all pass (incl. `locales.test.ts` en/tr key parity), tsc silent. If tsc flags `s.speakOn` capture or an unused import, fix only that line.

- [ ] **Step 8: Commit**

```bash
git add src/TutorCall.tsx src/Talk.tsx src/icons.tsx src/styles.css src/locales src-tauri/Info.plist src-tauri/Entitlements.plist
git commit -m "Add tutor call screen with hands-free mic and local camera

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Giriş noktası (Alıştırma kartı + `tutor:` yönlendirmesi) ve elle doğrulama

**Files:**
- Modify: `src/App.tsx:12-13` (importlar), `src/App.tsx:147-148` (yönlendirme)
- Modify: `src/screens/Screens.tsx` (`Practice` içinde kart + yeni `TutorSheet`)

**Interfaces:**
- Consumes: Task 3 `TutorCall`, locale anahtarları `tutor.card`, `tutor.cardDesc`, `tutor.pick`.

- [ ] **Step 1: Route `tutor:` ids in `src/App.tsx`**

Importlara ekle / değiştir:

```ts
import { Chat, Story } from "./Talk";
import { TutorCall } from "./TutorCall";
import { CHARACTERS, parseTalkId, type CharacterId } from "./characters";
```

Satır 147–148'deki ifadeyi şununla değiştir:

```tsx
      {lessonId && (lessonId.startsWith("story:") ? <Story unitId={lessonId.slice(6)} />
        : lessonId.startsWith("tutor:") ? (lessonId.slice(6) in CHARACTERS && <TutorCall key={lessonId} who={lessonId.slice(6) as CharacterId} />)
        : /^(chat|call):/.test(lessonId) ? (talk && <Chat key={lessonId} who={talk.who} topic={talk.topic} voice={talk.voice} />) : <Lesson id={lessonId} />)}
```

- [ ] **Step 2: Practice card + tutor picker in `src/screens/Screens.tsx`**

`Practice` içinde `useApp()` satırını değiştir:

```ts
  const { toast, enrollment, lessonId, openSheet } = useApp();
```

Kart listesinde `practice-mistakes` kartından önce ekle (konuşma engeli yok, ders yazıyla da sürer):

```tsx
        {card(() => openSheet(<TutorSheet />), "video", "var(--green-tint)", "var(--green)", t("tutor.card"), t("tutor.cardDesc"))}
```

`Practice` fonksiyonunun hemen üstüne ekle:

```tsx
/** Picks the tutor for a video lesson (spec T). */
function TutorSheet() {
  const { t } = useTranslation();
  const { closeSheet } = useApp();
  const start = useStartLesson();
  return (
    <div className="od-stack" style={{ "--od-gap": "10px" } as React.CSSProperties}>
      <h3 style={{ textAlign: "center" }}>{t("tutor.pick")}</h3>
      {(Object.keys(CHARACTERS) as CharacterId[]).map((k) => {
        const { name, color, face } = CHARACTERS[k];
        return (
          <button key={k} className="card od-row" style={{ "--od-gap": "14px" } as React.CSSProperties} onClick={() => { closeSheet(); start(`tutor:${k}`); }}>
            <Face spec={face} color={color} size={48} label={name} />
            <span className="od-field od-fill" style={{ textAlign: "left" }}><b>{name}</b><span className="muted small">{t(`roleplay.roles.${k}`)}</span></span>
          </button>
        );
      })}
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
    </div>
  );
}
```

(`CHARACTERS`, `CharacterId`, `Face`, `useStartLesson` bu dosyada zaten import edili — `Roleplay`/`TopicSheet` kullanıyor. Değilse importa ekle.)

- [ ] **Step 3: Full check**

Run: `pnpm test && pnpm -s tsc --noEmit -p .`
Expected: all pass, tsc silent.

- [ ] **Step 4: Manual check in the app**

Run: `pnpm tauri dev`

Kontrol listesi (bir AI sağlayıcısı ayarlı ve konuşma açık olmalı):
1. Alıştırma → "Lesson with a tutor" → bir karakter seç → çağrı açılır; tutor selamlar ve sesli konuşur, yüz `thinking` → `talking` → `idle`.
2. Mikrofon kendiliğinden açık; bir cümle söyle ve sus → ~1,2 sn sonra tutor cevap verir; sen konuşurken sağ bölmenin kenarında yeşil halka oynar.
3. Tutor konuşurken mikrofon onun sesini yakalamaz (kendi sözüne cevap vermez).
4. Mesaj düğmesi → çekmece; "one sec, my mic isn't working" yaz → tutor sesli "take your time" benzeri kısa bir söz söyler.
5. Tutor soru sorduktan sonra 20 sn sus → tutor halini sorar; 2 kez sonra susar.
6. Kamera düğmesi → izin iste → kendi görüntün aynalı görünür; tekrar bas → profil geri gelir. Tutor kameraya tepki verir.
7. Altyazıya dokun → çeviri görünür. Hatalı bir cümle kur → sarı düzeltme kartı çıkar.
8. Kırmızı "End call" → özet ekranı (XP + düzeltmeler listesi) → "End" → ekran kapanır, mikrofon/kamera ışığı söner.
9. X / Esc → "çıkmak istiyor musun" sayfası → çık → özet yok.
10. AI sağlayıcısını geçersiz yap (yanlış model) → `Failed` görünür; düzelt → "Retry" aynı olayı tekrar gönderir.

Bir madde tutmazsa sebebi bul ve düzelt; `vadStep` eşiği gürültülü ortamda sorun çıkarırsa yalnız `VAD.threshold` değiştir.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/screens/Screens.tsx
git commit -m "Open the tutor call from the Practice screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Finish the branch**

`superpowers:finishing-a-development-branch` kullan; varsayılan: `t-tutor-call` → yerel `test` dalına merge (master'a değil, push yok).
