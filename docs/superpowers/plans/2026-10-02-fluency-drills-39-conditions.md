# #39 Condition logging — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every voice session (tutor call and voice chat) saves one `speech_sessions` row together with the conditions it was spoken under. This is the data the fluency drills build on.

**Architecture:**
- **Schema:** migration v4 adds two nullable columns: `conditions` (JSON `Conditions`) and `avoided`.
- **Measuring:** tap-to-talk recordings get speech metrics the same way hands-free `listen()` already does. `startRecording()` measures, `MicButton` passes the metrics on, and the voice `Chat` collects them and saves one row at the end.

**Tech stack:** React + TypeScript, sql.js (preview) / tauri-plugin-sql, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-02-fluency-drills-design.md` (section "Data").

## Global constraints

- Branch `feature/fluency-drills` (from `test`). Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Checks: `pnpm test` and `npx tsc --noEmit -p .` must both pass.
- `src/speech.test.ts` passes unchanged.
- Nothing is measured or saved when voice analysis (`s.speechOn`) is off.
- Ponytail: minimal diff. Mark deliberate shortcuts with `ponytail:` comments.

---

### Task 1: Conditions type, migration v4, db read/write

**Files:**
- Modify: `src/speech.ts` (next to `SessionRow`, ~line 139)
- Modify: `src/migrations.ts` (append v4)
- Modify: `src/db.ts:237-247` (`saveSpeechSession`, `listSpeechSessions`)
- Modify: `src/TutorCall.tsx:312`
- Test: `src/migrate.test.ts`

**Interfaces:**
- **Produces** `export type Conditions = { mode: "tutor" | "chat" | "rehearse" | "drill"; drill?: "planning" | "432" | "ladder" | "structure"; planningTimeSec: number; topicFamiliarity: "prepared" | "novel"; round?: number; rung?: number }`
- **Produces** `export const FREE_CONTEXT = { planningTimeSec: 0, topicFamiliarity: "novel" } as const`
- **Produces** `SessionRow` gains optional fields: `mode?: Conditions["mode"]; conditions?: Conditions | null; avoided?: string | null`
- **Produces** `saveSpeechSession(profileId, enrollmentId, x: SpeechSummary, conditions: Conditions | null, avoided: string | null = null)`. The mode comes from `conditions?.mode ?? "chat"`.
- **Produces** `listSpeechSessions(profileId, limit = 10)`, oldest first as before; the rows carry `mode`, `conditions` (parsed) and `avoided`.

- [ ] **Step 1: Write the failing test.** Append to `src/migrate.test.ts`:

```ts
test("v4: speech_sessions has nullable conditions and avoided", async () => {
  const db = fresh();
  await runMigrations(db, MIGRATIONS);
  const cols = await db.select<{ name: string; notnull: number }>("PRAGMA table_info(speech_sessions)");
  for (const c of ["conditions", "avoided"]) assert.equal(cols.find((x) => x.name === c)?.notnull, 0, c);
});
```

- [ ] **Step 2: Run it and see it fail.** Run `pnpm test 2>&1 | grep -A3 "v4:"`. Expected: FAIL (`undefined !== 0`).

- [ ] **Step 3: Add migration v4.** In `src/migrations.ts`, add after the v3 entry:

```ts
  {
    v: 4, // fluency drills: the conditions a voice session was spoken under (JSON Conditions, src/speech.ts; NULL = not measured)
    // and the target structure the learner avoided in it (structure drill)
    sql: `ALTER TABLE speech_sessions ADD COLUMN conditions TEXT;
ALTER TABLE speech_sessions ADD COLUMN avoided TEXT`,
  },
```

- [ ] **Step 4: Run it and see it pass.** Run `pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"`. Expected: fail 0.

- [ ] **Step 5: Add the type.** In `src/speech.ts`, just above `export type SessionRow`:

```ts
/** What a voice session was spoken under, saved with its row (speech_sessions.conditions) so drills compare like with like. */
export type Conditions = {
  mode: "tutor" | "chat" | "rehearse" | "drill";
  drill?: "planning" | "432" | "ladder" | "structure";
  planningTimeSec: number;
  topicFamiliarity: "prepared" | "novel";
  round?: number; // 4/3/2
  rung?: number; // pressure ladder
};
/** Ordinary talk: no planning time, a topic the learner did not prepare. */
export const FREE_CONTEXT = { planningTimeSec: 0, topicFamiliarity: "novel" } as const;
```

Replace the `SessionRow` line with:

```ts
export type SessionRow = { utterances: number; latency_ms: number | null; wpm: number; long_pauses: number; words: number; native_words: number;
  mode?: Conditions["mode"]; conditions?: Conditions | null; avoided?: string | null };
```

- [ ] **Step 6: Update db.ts.** Replace `saveSpeechSession` and `listSpeechSessions` in `src/db.ts`:

```ts
export async function saveSpeechSession(profileId: number, enrollmentId: number | null, x: SpeechSummary, conditions: Conditions | null, avoided: string | null = null) {
  await (await db()).execute(
    `INSERT INTO speech_sessions(profile_id, enrollment_id, mode, utterances, silences, latency_ms, wpm, pause_ratio, long_pauses, level, fillers, words, native_words, speech_ms, conditions, avoided)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [profileId, enrollmentId, conditions?.mode ?? "chat", x.utterances, x.silences, x.latencyMs, x.wpm, x.pauseRatio, x.longPauses, x.level, x.fillers, x.words, x.nativeWords, x.speechMs,
      conditions && JSON.stringify(conditions), avoided]);
}

/** The last `limit` voice sessions, oldest first: the coaching card (SPR-27) and the drills read them. */
export async function listSpeechSessions(profileId: number, limit = 10): Promise<SessionRow[]> {
  const rows = await (await db()).select<SessionRow & { conditions: string | null }>(
    "SELECT utterances, latency_ms, wpm, long_pauses, words, native_words, mode, conditions, avoided FROM speech_sessions WHERE profile_id = $1 ORDER BY id DESC LIMIT $2", [profileId, limit]);
  const parse = (s: string | null) => { try { return s ? JSON.parse(s) as Conditions : null; } catch { return null; } }; // a broken row counts as not measured
  return rows.map((r) => ({ ...r, conditions: parse(r.conditions) })).reverse();
}
```

In `src/db.ts:13`, change the import to `import type { Baseline, Conditions, SessionRow, SpeechSummary } from "./speech";`.

- [ ] **Step 7: TutorCall.** In `src/TutorCall.tsx:312`, replace the call and add `FREE_CONTEXT` to its `./speech` import:

```ts
    if (profile && c.speech.length) void db.saveSpeechSession(profile.id, enrollment?.id ?? null, summarize(c.speech, c.silences), { ...FREE_CONTEXT, mode: "tutor", topicFamiliarity: "prepared" }).catch(() => {});
```

- [ ] **Step 8: Check.** Run `npx tsc --noEmit -p . && pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"`. Expected: no type errors, fail 0.

- [ ] **Step 9: Commit.**

```bash
git add src/speech.ts src/migrations.ts src/db.ts src/TutorCall.tsx src/migrate.test.ts
git commit -m "Speech sessions: conditions and avoided columns (migration v4)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tap-to-talk metrics and saving the voice chat

**Files:**
- Modify: `src/stt.ts` (`startRecording`)
- Modify: `src/Mic.tsx` (`MicButton`)
- Modify: `src/Talk.tsx` (`Chat`: collect, then save in `finish` and `stepOut`)

**Interfaces:**
- **Consumes** `Conditions`, `FREE_CONTEXT`, `saveSpeechSession` from Task 1, and the existing `speechMetrics(samples, rate, transcript, timing, native, target): Utterance` and `summarize(us, silences)`.
- **Produces** `startRecording(lang, onAutoStop?, native?)`; `stop()` resolves to `{ text: string; m?: Utterance }`.
- **Produces** `MicButton` gains the optional prop `native?: string`; `onText(text: string, m?: Utterance)`.
- **Produces** `Chat` gains `conditions` (a `useRef<Conditions>`). Task #40 replaces its initial value for drills.

- [ ] **Step 1: startRecording.** `src/stt.ts` already imports `speechMetrics` and `Utterance` from `./speech`. Change the signature and `stop()`:

```ts
/** Starts recording; `stop()` returns the transcript (`stop(false)` just releases the mic). Auto-stops after MAX_RECORD_S (onAutoStop fires).
 *  With `native` the transcript also gets its speech signals; there is no tutor turn to time, so `latencyMs` is null. */
export async function startRecording(lang: string, onAutoStop?: () => void, native?: string) {
```

```ts
    async stop(transcribe = true): Promise<{ text: string; m?: Utterance }> {
      if (stopped) return { text: "" };
      stopped = true;
      clearTimeout(timer);
      proc.disconnect(); src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      const rate = ctx.sampleRate;
      await ctx.close();
      if (!transcribe) return { text: "" };
      const all = concat(chunks), text = await transcribeSamples(all, rate, lang);
      return { text, m: native && text ? speechMetrics(all, rate, text, { latencyMs: null }, native, lang) : undefined };
    },
```

- [ ] **Step 2: MicButton.** In `src/Mic.tsx`:

```ts
import { type Utterance } from "./speech";
```

```ts
export function MicButton({ lang, onText, disabled, trigger = 0, native }: { lang: string; onText: (text: string, m?: Utterance) => void; disabled?: boolean; trigger?: number; native?: string }) {
```

In `stop`: `try { const r2 = await r.stop(); onText(r2.text, r2.m); }`. In `toggle`: `rec.current = await startRecording(lang, stop, native);`. `Lesson.tsx` keeps `onText={(txt) => …}` and simply ignores the second argument.

- [ ] **Step 3: Collect in Chat.** In `src/Talk.tsx`, add `import { FREE_CONTEXT, summarize, type Conditions, type Utterance } from "./speech";`. Inside `Chat`, after `const ending = useRef(false);`:

```ts
  const native = voice && s.speechOn ? profile?.native_lang : undefined; // voice analysis off: nothing measured or saved
  const spoken = useRef<Utterance[]>([]);
  const conditions = useRef<Conditions>({ ...FREE_CONTEXT, mode: rehearse ? "rehearse" : "chat" });
  /** One speech_sessions row per voice chat that measured something. */
  const saveSpeech = () => {
    if (profile && spoken.current.length) void db.saveSpeechSession(profile.id, enrollment?.id ?? null, summarize(spoken.current, 0), conditions.current).catch(() => {});
  };
```

Change the mic line to:

```tsx
      {voice && !over && <MicButton lang={lang} native={native} disabled={busy} onText={(said, m) => { if (m) spoken.current.push(m); send(said); }} />}
```

Call `saveSpeech();` right after `remember();` in both `stepOut` and `finish`.

- [ ] **Step 4: Check.** Run `npx tsc --noEmit -p . && pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"`. Expected: no type errors, fail 0, `speech.test.ts` untouched.

- [ ] **Step 5: Browser check.**
  - The preview (http://localhost:1420) has no Whisper, so speaking can't be tested end to end there.
  - Instead, check that the app loads without errors and the preview DB is now at v4: run `await (await import("/src/db.ts")).listSpeechSessions(1)` in the console. Expected: it resolves.
  - The full flow is checked in `pnpm tauri dev`: one voice chat with voice analysis on writes a row with `mode='chat'` and filled `conditions`.

- [ ] **Step 6: Commit.**

```bash
git add src/stt.ts src/Mic.tsx src/Talk.tsx
git commit -m "Voice chat: measure tap-to-talk answers, save one speech session with its conditions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Acceptance (#39):**
- A fresh DB migrates to v4; an upgrade takes a `pre-v4-*.db` backup (already automatic in `src/db.ts:40`).
- With voice analysis on, a voice chat writes one row with `mode='chat'` and filled `conditions`.
- `speech.test.ts` passes unchanged.

Later subtasks (#40–#44) each get their own plan when they start.
