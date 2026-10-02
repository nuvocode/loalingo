# #40 Planning drill + Practice card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Practice gets a single "Fluency drills" card. It opens a two-step sheet. The first drill is planning time: think N seconds, then talk for 3 minutes to a character. A time bar runs in the top bar.

**Architecture:**
- A drill is a mode of the voice `Chat`, the same way rehearsal is.
- Its id is `drill:planning:<who>:<uri-encoded JSON>`. `parseTalkId` turns it into a `Talk` with `drill` set, so App routes it to `Chat` with no new screen.
- Pure logic (planning progression, id, mm:ss) lives in `src/drills.ts` with node tests. `Chat` adds the planning pre-screen, a countdown and the drill conditions.

**Tech Stack:** React + TypeScript, i18next (5 locales), node --test.

## Global Constraints

- `pnpm test` and `npx tsc --noEmit -p .` must both pass
- Practice gets exactly ONE new card; no new section heading
- The planning pre-screen has no `input`/`textarea`; the countdown or the button calls `turn([])` exactly once
- No `.timer-box`: time is shown only in the `Shell` top bar (bar + small `mm:ss`)
- Drill sessions are not written to memory (`rememberSession`)
- Session length 3 min; planning progression 60 → 30 → 0, two sessions per step, never goes back up
- Every new i18n key exists in all 5 locales (en, tr, de, es, fr); `src/locales.test.ts` checks this
- Ponytail: minimal diff, match surrounding style; prompts to the model are in English like the existing ones

**Note on the spec:** Kaneo says "`planningHistory` drops zeros". The zeros it means are the `planningTimeSec: 0` of ordinary sessions. Here `planningHistory` keeps only planning-drill rows, and it does keep their 0s. Otherwise, once the learner reached 0, history would empty and the drill would jump back to 60. Ladder rung 1 (60 s) is `drill: "ladder"`, so it never counts.

---

### Task 1: drills.ts, the id route and chatTurn options

**Files:**
- Create: `src/drills.ts`
- Create: `src/drills.test.ts`
- Modify: `src/characters.ts` (`Talk` type and `parseTalkId`)
- Modify: `src/App.tsx:129` and `:198` (route regex), `src/Lesson.tsx:27` (no-hearts regex)
- Modify: `src/lessons.ts:205-233` (`chatTurn` options)

**Interfaces:**
- Produces:
  - `type Drill = { kind: "planning"; topic: string; planningSec: number; minutes: number }`
  - `drillId(who: string, d: Drill): string`
  - `parseDrill(rest: string[]): Drill | null`. `rest` is what follows `drill:<who>:`.
  - `nextPlanningSec(past: number[]): number`
  - `planningHistory(rows: SessionRow[]): number[]`
  - `mmss(sec: number): string`
  - `DRILL_MINUTES = 3`, `DRILL_KEEP = 12`
  - `Talk` gains `drill?: Drill`
  - `chatTurn(c, who, topic, history, opts: { rules?: string[]; keep?: number } = {})`

- [ ] **Step 1: Write the failing test** `src/drills.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { drillId, mmss, nextPlanningSec, parseDrill, planningHistory, type Drill } from "./drills.ts";
import { parseTalkId } from "./characters.ts";
import type { SessionRow } from "./speech.ts";

test("nextPlanningSec: 60 → 30 → 0, two sessions per step, never back up", () => {
  assert.equal(nextPlanningSec([]), 60);
  assert.equal(nextPlanningSec([60]), 60);
  assert.equal(nextPlanningSec([60, 60]), 30);
  assert.equal(nextPlanningSec([30, 60, 60]), 30);
  assert.equal(nextPlanningSec([30, 30, 60, 60]), 0);
  assert.equal(nextPlanningSec([0, 30, 30]), 0);
  assert.equal(nextPlanningSec([60, 30, 30]), 0); // a stray 60 (newest) does not pull it back up
});

const row = (c: SessionRow["conditions"]): SessionRow => ({ utterances: 1, latency_ms: null, wpm: 100, long_pauses: 0, words: 5, native_words: 0, conditions: c });

test("planningHistory: only planning drills, newest first, zeros kept", () => {
  const rows = [ // oldest first, as listSpeechSessions returns them
    row({ mode: "drill", drill: "planning", planningTimeSec: 60, topicFamiliarity: "prepared" }),
    row({ mode: "chat", planningTimeSec: 0, topicFamiliarity: "novel" }),
    row({ mode: "drill", drill: "ladder", planningTimeSec: 60, topicFamiliarity: "prepared", rung: 1 }),
    row(undefined),
    row({ mode: "drill", drill: "planning", planningTimeSec: 0, topicFamiliarity: "prepared" }),
  ];
  assert.deepEqual(planningHistory(rows), [0, 60]);
});

test("drill id round-trips through parseTalkId", () => {
  const d: Drill = { kind: "planning", topic: "my trip: day 1", planningSec: 30, minutes: 3 };
  const t = parseTalkId(drillId("leo", d));
  assert.ok(t);
  assert.equal(t.voice, true);
  assert.equal(t.who, "leo");
  assert.deepEqual(t.drill, d);
  assert.equal(parseTalkId(drillId("nobody", d)), null);
  assert.equal(parseDrill(["planning", "%7Bbad"]), null);
  assert.equal(parseDrill(["planning", encodeURIComponent(JSON.stringify({ topic: " ", planningSec: 30, minutes: 3 }))]), null);
});

test("mmss", () => {
  assert.equal(mmss(0), "0:00");
  assert.equal(mmss(65), "1:05");
  assert.equal(mmss(180), "3:00");
});
```

Before writing the test, check that `SessionRow` in `src/speech.ts` has exactly the fields used in `row()`. If any are missing or different, adjust the `row()` literal to match the real type; do not change the type.

- [ ] **Step 2: Run the test and check that it fails**

Run: `node --test src/drills.test.ts`
Expected: FAIL, because `./drills.ts` cannot be found.

- [ ] **Step 3: Write `src/drills.ts`**

```ts
// Fluency drills (epic #31, docs/superpowers/specs/2026-10-02-fluency-drills-design.md): a mode of the voice Chat.
// Pure: the talk id, planning progression and time format. The sheet lives in screens/Screens.tsx, the screen in Talk.tsx.
import type { SessionRow } from "./speech.ts";

export type Drill = { kind: "planning"; topic: string; planningSec: number; minutes: number };
export const DRILL_MINUTES = 3;
/** Drill prompts only carry the last few messages; a 3-minute monologue grows the history fast. */
export const DRILL_KEEP = 12;

const STEPS = [60, 30, 0];
/** Planning seconds for the next session. `past` is newest first. The lowest step reached so far moves down once two sessions were spent on it; it never goes back up. */
export function nextPlanningSec(past: number[]): number {
  if (!past.length) return STEPS[0];
  const cur = Math.min(...past);
  return past.filter((x) => x === cur).length >= 2 ? STEPS[Math.min(STEPS.indexOf(cur) + 1, STEPS.length - 1)] : cur;
}

/** Planning seconds of past planning drills, newest first (`rows` come oldest first). Ladder rung 1 has planning too, but it does not count. */
// ponytail: only sees the rows the caller loaded (Screens loads the last 100 sessions); after 100 other sessions it starts again at 60
export const planningHistory = (rows: SessionRow[]) =>
  rows.filter((r) => r.conditions?.mode === "drill" && r.conditions.drill === "planning").map((r) => r.conditions!.planningTimeSec).reverse();

/** `drill:<who>:<kind>:<uri-encoded JSON>`; `who` is checked by parseTalkId. */
export const drillId = (who: string, d: Drill) =>
  `drill:${who}:${d.kind}:${encodeURIComponent(JSON.stringify({ topic: d.topic, planningSec: d.planningSec, minutes: d.minutes }))}`;

/** `rest` = the id after `drill:<who>:`; null when it is not a usable drill. */
export function parseDrill(rest: string[]): Drill | null {
  const [kind, enc] = rest;
  if (rest.length !== 2 || kind !== "planning") return null;
  let b: unknown;
  try { b = JSON.parse(decodeURIComponent(enc)); } catch { return null; }
  const { topic, planningSec, minutes } = (b ?? {}) as Record<string, unknown>;
  if (typeof topic !== "string" || !topic.trim() || typeof planningSec !== "number" || typeof minutes !== "number" || minutes <= 0) return null;
  return { kind, topic, planningSec: Math.max(0, planningSec), minutes };
}

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;
```

- [ ] **Step 4: Route the id.**

In `src/characters.ts`:
- Add `import { parseDrill, type Drill } from "./drills.ts";` next to the existing rehearsal import, using the same import style as that file.
- Change the `Talk` type to `export type Talk = { voice: boolean; who: CharacterId; topic: { id?: string; goal: string }; rehearse?: RehearsalBrief; drill?: Drill };`.
- Update its doc comment: "`rehearse` only on a rehearsal (see rehearsal.ts), `drill` only on a fluency drill (see drills.ts)".
- At the top of `parseTalkId`, right after the `const [kind, who, ...rest]` line, add:

```ts
  if (kind === "drill") {
    const d = parseDrill(rest);
    if (!Object.prototype.hasOwnProperty.call(CHARACTERS, who) || !d) return null;
    return { voice: true, who: who as CharacterId, topic: { goal: FREE_GOAL + d.topic }, drill: d };
  }
```

`FREE_GOAL` is declared above `parseTalkId` in the same file, so it is in scope.

In `src/App.tsx`, change both regexes `/^(chat|call|rehearse):/` (lines 129 and 198) to `/^(chat|call|rehearse|drill):/`. In `src/Lesson.tsx:27` add `drill` to `/^(story|chat|call|rehearse|tutor):/` (drills cost no hearts, like chats).

- [ ] **Step 5: chatTurn options.** In `src/lessons.ts`:

Change the signature to:

```ts
/** `opts.rules` add lines to the system prompt (drills); `opts.keep` caps how many past messages the prompt carries. */
export function chatTurn(c: Base & { about?: string[] }, who: CharacterId, topic: { goal: string }, history: ChatMsg[], opts: { rules?: string[]; keep?: number } = {}) {
```

In the `system` array, insert `...(opts.rules ?? []),` immediately before the `"Respond only with JSON matching the schema.",` line.

In the `prompt`, replace `history.map(` with `history.slice(-(opts.keep ?? history.length)).map(`.

Watch the edge case: `history.slice(-0)` returns the whole array, which is fine. With `keep` undefined and an empty history, `last` is undefined and the opening branch runs before `slice` is reached.

- [ ] **Step 6: Run the tests and type check**

Run: `pnpm test && npx tsc --noEmit -p .`
Expected: every test passes, including the 4 new ones, and tsc prints nothing.

If the import of `./drills.ts` from `characters.ts` creates a cycle problem in node (drills.ts imports only a *type* from speech.ts, so it should not), report it instead of restructuring.

- [ ] **Step 7: Commit**

```bash
git add src/drills.ts src/drills.test.ts src/characters.ts src/App.tsx src/Lesson.tsx src/lessons.ts
git commit -m "Drills: planning progression, drill id route, chatTurn rules"
```

---

### Task 2: Drill mode in the voice Chat (`src/Talk.tsx`)

**Files:**
- Modify: `src/Talk.tsx`: `Shell` (lines 22-43) and `Chat` (lines 281-439)
- Modify: the 5 locale files `src/locales/{en,tr,de,es,fr}.json`, `practice` object, keys `planning`, `planningTitle`, `startSpeaking`, `timeUp`

**Interfaces:**
- Consumes (from Task 1): `Talk.drill?: Drill`, `mmss`, `DRILL_KEEP`, and `chatTurn(..., { rules, keep })`.

- [ ] **Step 1: Shell shows time.** Add an optional `time?: string` prop to `Shell`, after `progress`. Render it right after the `.lesson-progress` div:

```tsx
        {time && <span className="muted small" style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }} role="timer">{time}</span>}
```

- [ ] **Step 2: Chat state.** In `Chat`:
- Destructure `drill` from `talk`: `const { who, topic, voice, rehearse, drill } = talk;`.
- Add the import `import { DRILL_KEEP, mmss } from "./drills";`.
- After the `ending` ref, add:

```tsx
  const total = drill ? drill.minutes * 60 : 0;
  const [left, setLeft] = useState(total); // drill: seconds of talk left
  const [plan, setPlan] = useState(drill?.planningSec ?? 0); // drill: planning seconds left; talk starts at 0
  const talking = !drill || plan <= 0;
```

- Change the `conditions` ref initialiser to:

```tsx
  const conditions = useRef<Conditions>(drill
    ? { ...FREE_CONTEXT, mode: "drill", drill: "planning", planningTimeSec: drill.planningSec, topicFamiliarity: "prepared" }
    : { ...FREE_CONTEXT, mode: rehearse ? "rehearse" : "chat" });
```

- [ ] **Step 3: The prompt.** In `turn`, change the `chatTurn` call to pass drill options:

```tsx
      const r = await chatTurn({ course, level: enrollment.level, native: profile.native_lang, about: await about }, who, topic, history,
        drill ? { rules: [`This is a speaking drill: the learner is telling you about ${drill.topic}. React briefly, ask at most one short question, and let the learner do most of the talking.`], keep: DRILL_KEEP } : {});
```

- [ ] **Step 4: Open the chat once, after planning.**
- Replace `useEffect(() => { if (!opened.current) { opened.current = true; turn([]); } }, []);` with:

```tsx
  useEffect(() => { if (talking && !opened.current) { opened.current = true; turn([]); } }, [talking]);
```

  This covers all three cases:
  - Non-drills and 0-second drills are `talking` from the start, so they behave as before.
  - When planning ends, `talking` flips once, and `opened` makes sure `turn([])` runs exactly once.
- Add the two clocks right below that line:

```tsx
  // Drill clocks: planning counts down first, then the talk time; the talk ends itself at 0.
  useEffect(() => {
    if (!drill || result) return;
    const id = setInterval(() => (plan > 0 ? setPlan((p) => p - 1) : setLeft((l) => Math.max(0, l - 1))), 1000);
    return () => clearInterval(id);
  }, [!!drill, !!result, plan > 0]);
  useEffect(() => { if (drill && talking && left === 0 && !result) finish(); }, [left]);
```

- [ ] **Step 5: Ending.**
- In `remember`, add `!drill &&` at the start of the condition: `if (profile && !drill && (rehearse || topic.goal.startsWith(FREE_GOAL)))`. Update the ponytail comment to say drills are not remembered either.
- Change `over` to:

```tsx
  const over = drill ? left === 0 : !rehearse && (goal || mine >= CHAT_TURNS);
```

  When `over`, the `MicButton` unmounts and its cleanup releases the mic.
- In `finish`, keep the XP formula. The `Done` title for a drill is `t("practice.timeUp")` when `left === 0`. Change the result body line to:

```tsx
    body = deb ? <DebriefCard d={deb} r={result} turns={turns} /> : <Done title={t(drill && left === 0 ? "practice.timeUp" : goal ? "roleplay.goalDone" : "roleplay.done")} r={result} />;
```

- [ ] **Step 6: The planning pre-screen and the labels.**
- Change `topicLabel` so a drill shows "<drill> · <topic>":

```tsx
  const topicLabel = drill ? `${t("practice.planning")} · ${drill.topic}` : rehearse ? rehearse.about ?? "" : topic.id ? t(`roleplay.topics.${who}.${topic.id}`) : topic.goal.slice(FREE_GOAL.length);
```

- In the `else` branch that builds `body` and `footer` (not the `result` branch), add a first case for planning. Turn `} else {` into `} else if (!talking) {` with the block below, followed by the existing `} else {`:

```tsx
  } else if (!talking) {
    body = (
      <div className="result-wrap">
        <span className="muted">{t("practice.planningTitle")}</span>
        <h2 style={{ fontSize: 24, fontWeight: 900 }}>{drill!.topic}</h2>
        <span role="timer" style={{ fontSize: 56, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{mmss(plan)}</span>
      </div>
    );
    footer = <><span /><button className="btn btn-primary" onClick={() => setPlan(0)}>{t("practice.startSpeaking")}</button></>;
  } else {
```

  The pre-screen has no input. Setting `plan` to 0 flips `talking`, and the effect from Step 4 calls `turn([])` once.
- Change the `Shell` call so drills get the time bar:

```tsx
  return <Shell label={name} time={drill && talking && !result ? mmss(left) : undefined}
    progress={result ? 100 : drill ? (talking ? (left / total) * 100 : 100) : Math.min(100, (mine / (rehearse ? REHEARSE_LONG : CHAT_TURNS)) * 100)} onClose={askQuit} body={body} footer={footer} />;
```

  The bar drains as time runs out, and is full during planning.

- [ ] **Step 7: i18n.** Add these keys inside the `practice` object of all 5 locales:

| key | en | tr | de | es | fr |
|---|---|---|---|---|---|
| planning | Planning time | Planlama süresi | Planungszeit | Tiempo para planear | Temps de préparation |
| planningTitle | Think about what you'll say | Ne söyleyeceğini düşün | Überleg dir, was du sagst | Piensa en lo que vas a decir | Pense à ce que tu vas dire |
| startSpeaking | Start speaking | Konuşmaya başla | Jetzt sprechen | Empezar a hablar | Commencer à parler |
| timeUp | Time's up! | Süre doldu! | Zeit ist um! | ¡Se acabó el tiempo! | Temps écoulé ! |

- [ ] **Step 8: Check**

Run: `pnpm test && npx tsc --noEmit -p .`
Expected: everything passes, including `locales.test.ts`, and tsc prints nothing.

- [ ] **Step 9: Commit**

```bash
git add src/Talk.tsx src/locales
git commit -m "Drills: planning pre-screen and time bar in the voice chat"
```

---

### Task 3: Practice card + two-step DrillsSheet (`src/screens/Screens.tsx`)

**Files:**
- Modify: `src/screens/Screens.tsx`:
  - imports
  - `Practice` (lines 84-138)
  - new `CastPicker`, extracted from `RehearseSheet` (lines 417-430)
  - new `DrillsSheet`
- Modify: the 5 locale files, `practice` object

**Interfaces:**
- Consumes:
  - `drillId`, `nextPlanningSec`, `planningHistory` and `DRILL_MINUTES` (Task 1)
  - `db.listSpeechSessions(profileId, limit)`, which returns `SessionRow[]` oldest first
  - `currentUnit(level, done)` from `../tutor`

- [ ] **Step 1: Extract `CastPicker`.**
- Move the face picker out of `RehearseSheet` into a component placed above `RehearseSheet`. Leave its markup unchanged:

```tsx
/** The cast as a row of faces; one is picked. */
function CastPicker({ value, onChange }: { value: CharacterId; onChange: (c: CharacterId) => void }) {
  const { t } = useTranslation();
  return (
    <div className="od-field" style={{ "--od-gap": "6px" } as React.CSSProperties}>
      <b id="cast-pick">{t("roleplay.briefCast")}</b>
      <div className="seg" role="radiogroup" aria-labelledby="cast-pick">
        {(Object.keys(CHARACTERS) as CharacterId[]).map((k) => {
          const { name, color, face } = CHARACTERS[k];
          return (
            <button key={k} role="radio" aria-checked={value === k} aria-label={name} title={name} className={`btn ${value === k ? "btn-blue" : "btn-ghost"}`}
              style={{ padding: 4 }} onClick={() => onChange(k)}>
              <Face spec={face} color={color} size={44} label={name} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- In `RehearseSheet`, replace the whole `<div className="od-field" style={field}>` block that contains `rh-cast` with `<CastPicker value={cast} onChange={setCast} />`.

- [ ] **Step 2: `DrillsSheet`.** Add it after `RehearseSheet`:

```tsx
/** Fluency drills (epic #31): step 1 picks a drill, step 2 sets it up. Only the planning drill so far; #41–#44 add theirs to `list`. */
function DrillsSheet() {
  const { t } = useTranslation();
  const { closeSheet, profile, course, enrollment, done } = useApp();
  const start = useStartLesson();
  const level = course && enrollment ? course.levels[enrollment.level] : undefined;
  const [pick, setPick] = useState<"planning" | null>(null);
  const [topic, setTopic] = useState(level ? currentUnit(level, done).title : "");
  const [cast, setCast] = useState<CharacterId>("leo");
  const [planSec, setPlanSec] = useState(60);
  useEffect(() => { if (profile) db.listSpeechSessions(profile.id, 100).then((rows) => setPlanSec(nextPlanningSec(planningHistory(rows)))).catch(() => {}); }, [profile?.id]);
  const list = [
    { id: "planning" as const, icon: "clock" as IconName, title: t("practice.planning"), desc: planSec ? t("practice.planningDesc", { sec: planSec, min: DRILL_MINUTES }) : t("practice.planningDescNone", { min: DRILL_MINUTES }) },
  ];
  const go = () => {
    if (!topic.trim()) return;
    closeSheet();
    start(drillId(cast, { kind: "planning", topic: topic.trim(), planningSec: planSec, minutes: DRILL_MINUTES }));
  };
  if (!pick) return (
    <div className="od-stack" style={{ "--od-gap": "12px", textAlign: "left" } as React.CSSProperties}>
      <h3 style={{ textAlign: "center" }}>{t("practice.drills")}</h3>
      {list.map((d) => (
        <button key={d.id} className="card row-item" onClick={() => setPick(d.id)}>
          <span style={iconBox("var(--sky)", "var(--blue)", 40, 10)}><Icon name={d.icon} /></span>
          <span className="od-field od-fill"><b>{d.title}</b><span className="muted small">{d.desc}</span></span>
        </button>
      ))}
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
    </div>
  );
  return (
    <div className="od-stack" style={{ "--od-gap": "14px", textAlign: "left" } as React.CSSProperties}>
      <h3 style={{ textAlign: "center" }}>{list.find((d) => d.id === pick)!.title}</h3>
      <label className="od-field" style={{ "--od-gap": "6px" } as React.CSSProperties}>
        <b>{t("practice.drillTopic")}</b>
        <input className="input" value={topic} maxLength={120} placeholder={t("practice.drillTopicPlaceholder")}
          onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
      </label>
      <CastPicker value={cast} onChange={setCast} />
      <span className="rp-actions sheet-actions">
        <button className="btn btn-ghost" onClick={() => setPick(null)}>{t("voice.back")}</button>
        <button className="btn btn-blue" disabled={!topic.trim()} onClick={go}>{t("practice.start")}</button>
      </span>
    </div>
  );
}
```

Before using `useApp()` fields, check what it actually exposes. `done` is used by `TutorCall` (`const { course, enrollment, profile, done, ... } = useApp()`), so it exists. Check that `"leo"` is a key of `CHARACTERS` in `src/characters.ts`. If it is not, use the first key and say so in the report.

Imports to add:
- `import { currentUnit } from "../tutor";`
- `import { DRILL_MINUTES, drillId, nextPlanningSec, planningHistory } from "../drills";`

- [ ] **Step 3: The one Practice card.** In `Practice`, insert this card right after the speaking-practice card (the `{/* Speaking: bundled Whisper ... */}` one):

```tsx
        {card(() => speakBlock ? toast(t(speakBlock)) : openSheet(<DrillsSheet />), "clock", "var(--sky)", "var(--blue)", t("practice.drills"), speakBlock ? t(speakBlock) : t("practice.drillsDesc"))}
```

- [ ] **Step 4: i18n.** Add these keys inside `practice` in all 5 locales. `planningDesc` uses `{{sec}}` and `{{min}}`; `planningDescNone` uses `{{min}}`.

| key | en | tr | de | es | fr |
|---|---|---|---|---|---|
| drills | Fluency drills | Akıcılık alıştırmaları | Flüssigkeitsübungen | Ejercicios de fluidez | Exercices de fluidité |
| drillsDesc | Timed speaking on one topic | Tek konuda süreli konuşma | Zeitlich begrenztes Sprechen zu einem Thema | Hablar con tiempo sobre un tema | Parler en temps limité sur un sujet |
| planningDesc | Think {{sec}} s, then talk {{min}} min | {{sec}} sn düşün, sonra {{min}} dk konuş | {{sec}} s nachdenken, dann {{min}} Min. sprechen | Piensa {{sec}} s y luego habla {{min}} min | Réfléchis {{sec}} s, puis parle {{min}} min |
| planningDescNone | Talk {{min}} min, no planning | Planlamasız {{min}} dk konuş | {{min}} Min. sprechen, ohne Planung | Habla {{min}} min sin planear | Parle {{min}} min sans préparation |
| drillTopic | Topic | Konu | Thema | Tema | Sujet |
| drillTopicPlaceholder | e.g. my last holiday | ör. son tatilim | z. B. mein letzter Urlaub | p. ej. mis últimas vacaciones | ex. mes dernières vacances |

- [ ] **Step 5: Check**

Run: `pnpm test && npx tsc --noEmit -p .`
Expected: everything passes and tsc prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Screens.tsx src/locales
git commit -m "Practice: Fluency drills card and two-step sheet (planning drill)"
```

---

## Browser check (controller, after Task 3)

At http://localhost:1420, open Practice and check:
- There is exactly one new card.
- The sheet's step 1 lists "Planning time · Think 60 s, then talk 3 min". Clicking it shows step 2, and Back returns to step 1.

In the drill:
- The pre-screen has no `input` or `textarea`.
- The countdown runs. "Start speaking" opens the chat once: one AI greeting.
- The top bar shows `m:ss` and the bar drains.

Speaking itself needs `pnpm tauri dev`.
