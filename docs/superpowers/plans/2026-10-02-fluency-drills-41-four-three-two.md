# #41 4/3/2 drill + rounds card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The learner tells the same topic three times, in 4, 3 and then 2 minutes. After round 3, a card compares the three rounds: words/min, pause ratio and fillers.

**Architecture:**
- A round is one drill session. The id carries `round` and the previous rounds' stats (`prev`). "Next round" starts the next id, which remounts `Chat`. No table is needed.
- Rules and conditions per drill move into pure functions in `src/drills.ts`, so they can be tested. `Chat` calls these instead of building them inline.

**Tech Stack:** React + TypeScript, i18next (5 locales), node --test.

## Global Constraints

- `pnpm test` and `npx tsc --noEmit -p .` must both pass
- Rounds are 4, 3, 2 minutes, same topic, no planning
- `REPETITION_RULE` is in the prompt in rounds 2–3 only
- The rounds card has three columns and rows words/min, pause ratio, fillers; an unmeasured round shows "—"; no accuracy row
- With voice analysis (`s.speechOn`) off, step 2 of the sheet shows one line plus "Turn on and start"; plain Start still runs the drill
- Nothing is measured or saved when voice analysis is off (unchanged from #39)
- Every new i18n key exists in all 5 locales (en, tr, de, es, fr)
- Ponytail: minimal diff, match surrounding style; prompts to the model are in English

**Note on Kaneo:** Kaneo names the conditions function `fourThreeTwoContext(round)`. Here it is `drillConditions(d)`, which covers both drills, and the planning drill's inline conditions move into it.

---

### Task 1: 4/3/2 in `src/drills.ts`

**Files:**
- Modify: `src/drills.ts`
- Modify: `src/drills.test.ts`

**Interfaces:**
- Produces:
  - `type RoundStat = Pick<SpeechSummary, "wpm" | "pauseRatio" | "fillers"> | null`
  - `type Drill = { kind: "planning" | "432"; topic: string; planningSec: number; minutes: number; round?: number; prev?: RoundStat[] }`
  - `FOUR_THREE_TWO_MINUTES = [4, 3, 2]`
  - `REPETITION_RULE: string`
  - `drillRules(d: Drill): string[]`
  - `drillConditions(d: Drill): Conditions`
  - `roundStat(s: SpeechSummary | null): RoundStat`
  - `drillId` and `parseDrill` accept both kinds

- [ ] **Step 1: Write the failing tests.** Append to `src/drills.test.ts`. Extend its import line to `import { REPETITION_RULE, drillConditions, drillId, drillRules, mmss, nextPlanningSec, parseDrill, planningHistory, roundStat, type Drill } from "./drills.ts";`.

```ts
const r432 = (round: number, prev: Drill["prev"] = []): Drill => ({ kind: "432", topic: "my weekend", planningSec: 0, minutes: [4, 3, 2][round - 1], round, prev });
const plan: Drill = { kind: "planning", topic: "my weekend", planningSec: 30, minutes: 3 };

test("drillConditions: 4/3/2 rounds and planning", () => {
  assert.deepEqual(drillConditions(r432(1)), { mode: "drill", drill: "432", planningTimeSec: 0, topicFamiliarity: "novel", round: 1 });
  assert.deepEqual(drillConditions(r432(2)), { mode: "drill", drill: "432", planningTimeSec: 0, topicFamiliarity: "prepared", round: 2 });
  assert.deepEqual(drillConditions(r432(3)), { mode: "drill", drill: "432", planningTimeSec: 0, topicFamiliarity: "prepared", round: 3 });
  assert.deepEqual(drillConditions(plan), { mode: "drill", drill: "planning", planningTimeSec: 30, topicFamiliarity: "prepared" });
});

test("drillRules: REPETITION_RULE only in 4/3/2 rounds 2–3", () => {
  assert.ok(!drillRules(r432(1)).includes(REPETITION_RULE));
  assert.ok(drillRules(r432(2)).includes(REPETITION_RULE));
  assert.ok(drillRules(r432(3)).includes(REPETITION_RULE));
  assert.ok(!drillRules(plan).includes(REPETITION_RULE));
  assert.ok(drillRules(plan)[0].includes("my weekend"));
});

test("4/3/2 id carries round and prev; minutes follow the round", () => {
  const prev = [{ wpm: 90, pauseRatio: 0.2, fillers: 3 }, null];
  const t = parseTalkId(drillId("mia", r432(3, prev)));
  assert.ok(t);
  assert.deepEqual(t.drill, r432(3, prev));
  assert.equal(t.drill?.minutes, 2);
  assert.equal(parseDrill(["432", encodeURIComponent(JSON.stringify({ topic: "x", round: 4, prev: [] }))]), null);
  // a broken stat becomes null, and prev never holds more than round - 1 entries
  assert.deepEqual(parseDrill(["432", encodeURIComponent(JSON.stringify({ topic: "x", round: 2, prev: [{ wpm: "fast" }, { wpm: 1, pauseRatio: 0, fillers: 0 }] }))])?.prev, [null]);
});

test("roundStat keeps only the compared numbers", () => {
  assert.equal(roundStat(null), null);
  assert.deepEqual(roundStat({ utterances: 3, silences: 0, latencyMs: null, wpm: 101, pauseRatio: 0.1, longPauses: 1, level: 0.1, fillers: 2, words: 40, nativeWords: 0, speechMs: 20000 }),
    { wpm: 101, pauseRatio: 0.1, fillers: 2 });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test src/drills.test.ts`
Expected: FAIL, because the new exports are missing.

- [ ] **Step 3: Implement.** In `src/drills.ts`:

Change the import to `import type { Conditions, SessionRow, SpeechSummary } from "./speech.ts";`. Then replace the `Drill` type with:

```ts
/** Compared across 4/3/2 rounds; null = not measured (voice analysis off or nothing said). */
export type RoundStat = Pick<SpeechSummary, "wpm" | "pauseRatio" | "fillers"> | null;
/** `round` (1–3) and `prev` (the stats of the rounds before it) only on 4/3/2. */
export type Drill = { kind: "planning" | "432"; topic: string; planningSec: number; minutes: number; round?: number; prev?: RoundStat[] };
export const FOUR_THREE_TWO_MINUTES = [4, 3, 2];
```

Add the following below `DRILL_KEEP`:

```ts
/** 4/3/2 rounds 2–3: the learner retells the same thing in less time. */
export const REPETITION_RULE = "The learner already told you this once, with more time. Let them tell it again: bring up nothing new, keep your reactions short, so they can say it faster and more smoothly.";

/** Extra system-prompt lines for a drill turn. */
export const drillRules = (d: Drill) => [
  `This is a speaking drill: the learner is telling you about ${d.topic}. React briefly, ask at most one short question, and let the learner do most of the talking.`,
  ...(d.kind === "432" && (d.round ?? 1) > 1 ? [REPETITION_RULE] : []),
];

/** What the speech_sessions row records about the drill. From round 2 on, the 4/3/2 topic is one the learner has already told. */
export const drillConditions = (d: Drill): Conditions => d.kind === "432"
  ? { mode: "drill", drill: "432", planningTimeSec: 0, topicFamiliarity: (d.round ?? 1) > 1 ? "prepared" : "novel", round: d.round }
  : { mode: "drill", drill: "planning", planningTimeSec: d.planningSec, topicFamiliarity: "prepared" };

export const roundStat = (s: SpeechSummary | null): RoundStat => s && { wpm: s.wpm, pauseRatio: s.pauseRatio, fillers: s.fillers };
const statOf = (x: unknown): RoundStat => {
  const o = (x ?? {}) as Record<string, unknown>;
  return typeof o.wpm === "number" && typeof o.pauseRatio === "number" && typeof o.fillers === "number" ? { wpm: o.wpm, pauseRatio: o.pauseRatio, fillers: o.fillers } : null;
};
```

Replace `drillId` and `parseDrill` with:

```ts
/** `drill:<who>:<kind>:<uri-encoded JSON>`; `who` is checked by parseTalkId. */
export const drillId = (who: string, d: Drill) => `drill:${who}:${d.kind}:${encodeURIComponent(JSON.stringify(d.kind === "432"
  ? { topic: d.topic, round: d.round, prev: d.prev ?? [] }
  : { topic: d.topic, planningSec: d.planningSec, minutes: d.minutes }))}`;

/** `rest` = the id after `drill:<who>:`; null when it is not a usable drill. */
export function parseDrill(rest: string[]): Drill | null {
  const [kind, enc] = rest;
  if (rest.length !== 2 || (kind !== "planning" && kind !== "432")) return null;
  let b: unknown;
  try { b = JSON.parse(decodeURIComponent(enc)); } catch { return null; }
  const { topic, planningSec, minutes, round, prev } = (b ?? {}) as Record<string, unknown>;
  if (typeof topic !== "string" || !topic.trim()) return null;
  if (kind === "432") {
    if (round !== 1 && round !== 2 && round !== 3) return null;
    return { kind, topic, planningSec: 0, minutes: FOUR_THREE_TWO_MINUTES[round - 1], round, prev: (Array.isArray(prev) ? prev : []).slice(0, round - 1).map(statOf) };
  }
  if (typeof planningSec !== "number" || typeof minutes !== "number" || minutes <= 0) return null;
  return { kind, topic, planningSec: Math.max(0, planningSec), minutes };
}
```

Update the file's header comment so it says "planning and 4/3/2" where it lists what the module holds, if it lists drills.

- [ ] **Step 4: Run**

Run: `pnpm test && npx tsc --noEmit -p .`
Expected: all tests pass, including the earlier `drill id round-trips` test (a planning drill still parses without `round`/`prev`). tsc prints nothing; `src/Talk.tsx` still compiles because `Drill` only widened.

- [ ] **Step 5: Commit**

```bash
git add src/drills.ts src/drills.test.ts
git commit -m "Drills: 4/3/2 rounds, repetition rule, drill conditions"
```

---

### Task 2: Rounds in the voice Chat (`src/Talk.tsx`)

**Files:**
- Modify: `src/Talk.tsx`
- Modify: the 5 locale files (`practice` object)

**Interfaces:**
- Consumes (from Task 1): `drillRules`, `drillConditions`, `drillId`, `roundStat`, `FOUR_THREE_TWO_MINUTES` and `type RoundStat`.
- Consumes: `useStartLesson` from `./Lesson`. `Talk.tsx` already imports `sfx` from there.

- [ ] **Step 1: Use the pure helpers.**
- Change the drills import to `import { DRILL_KEEP, FOUR_THREE_TWO_MINUTES, drillConditions, drillId, drillRules, mmss, roundStat, type RoundStat } from "./drills";`.
- Change the Lesson import to `import { sfx, useStartLesson } from "./Lesson";`.
- In `Chat`:
  - The `conditions` ref initialiser becomes `drill ? drillConditions(drill) : { ...FREE_CONTEXT, mode: rehearse ? "rehearse" : "chat" }`.
  - In `turn`, the `chatTurn` options become `drill ? { rules: drillRules(drill), keep: DRILL_KEEP } : {}`. Remove the inline rule string.

- [ ] **Step 2: The round's stat and the next round.**
- After the `paused` line in `Chat`, add:

```tsx
  const start = useStartLesson();
  const [stat, setStat] = useState<RoundStat>(null); // 4/3/2: this round's numbers, set by finish()
  const r432 = drill?.kind === "432" ? drill : null;
```

- In `finish()`, after the existing `saveSpeech();` line, add:

```tsx
    if (r432) setStat(roundStat(spoken.current.length ? summarize(spoken.current, 0) : null));
```

- `topicLabel` becomes:

```tsx
  const topicLabel = drill ? `${r432 ? t("practice.roundN", { n: r432.round, min: r432.minutes }) : t("practice.planning")} · ${drill.topic}` : rehearse ? rehearse.about ?? "" : topic.id ? t(`roleplay.topics.${who}.${topic.id}`) : topic.goal.slice(FREE_GOAL.length);
```

- Replace the `if (result) { ... }` branch body with the code below. Keep the existing `Done` title expression exactly.

```tsx
  if (result) {
    body = deb ? <DebriefCard d={deb} r={result} turns={turns} /> : <>
      <Done title={t(drill && left === 0 ? "practice.timeUp" : goal ? "roleplay.goalDone" : "roleplay.done")} r={result} />
      {r432?.round === 3 && <Rounds stats={[...(r432.prev ?? []), stat]} />}
    </>;
    const round = r432?.round ?? 3;
    footer = round < 3
      ? <><button className="btn btn-ghost" onClick={quit}>{t("lesson.end")}</button>
        <button className="btn btn-primary" onClick={() => { stopSpeaking(); start(drillId(who, { ...r432!, round: round + 1, minutes: FOUR_THREE_TWO_MINUTES[round], prev: [...(r432!.prev ?? []), stat] })); }}>{t("practice.nextRound")}</button></>
      : <><span /><button className="btn btn-primary" onClick={quit}>{t("lesson.end")}</button></>;
```

  A new id remounts `Chat`, because App keys it by `lessonId`. `stopSpeaking` is already imported from `./tts`.

- [ ] **Step 3: The `Rounds` card.** Add it above `export function Chat`:

```tsx
/** 4/3/2 after round 3: the same topic told three times, side by side. "—" = not measured. */
function Rounds({ stats }: { stats: RoundStat[] }) {
  const { t } = useTranslation();
  const rows: [string, (s: NonNullable<RoundStat>) => string][] = [
    [t("practice.roundsWpm"), (s) => String(Math.round(s.wpm))],
    [t("practice.roundsPause"), (s) => `${Math.round(s.pauseRatio * 100)}%`],
    [t("practice.roundsFillers"), (s) => String(s.fillers)],
  ];
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <b>{t("practice.roundsTitle")}</b>
      <table style={{ width: "100%", marginTop: 8, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
        <thead><tr><th />{FOUR_THREE_TWO_MINUTES.map((min, i) => <th key={i} className="small">{t("practice.roundN", { n: i + 1, min })}</th>)}</tr></thead>
        <tbody>{rows.map(([k, f]) => (
          <tr key={k}><th className="small" style={{ textAlign: "left" }}>{k}</th>{[0, 1, 2].map((i) => <td key={i}>{stats[i] ? f(stats[i]!) : "—"}</td>)}</tr>
        ))}</tbody>
      </table>
      <p className="muted small" style={{ marginTop: 8 }}>{t("practice.roundsNote")}</p>
      {[0, 1, 2].some((i) => !stats[i]) && <p className="muted small">{t("practice.roundsUnmeasured")}</p>}
    </div>
  );
}
```

- [ ] **Step 4: i18n.** Add these keys inside `practice` in all 5 locales. `roundN` takes `{{n}}` and `{{min}}`.

| key | en | tr | de | es | fr |
|---|---|---|---|---|---|
| nextRound | Next round | Sonraki tur | Nächste Runde | Siguiente ronda | Manche suivante |
| roundN | Round {{n}} · {{min}} min | {{n}}. tur · {{min}} dk | Runde {{n}} · {{min}} Min. | Ronda {{n}} · {{min}} min | Manche {{n}} · {{min}} min |
| roundsTitle | Your three rounds | Üç turun | Deine drei Runden | Tus tres rondas | Tes trois manches |
| roundsWpm | Words/min | Kelime/dk | Wörter/Min. | Palabras/min | Mots/min |
| roundsPause | Pauses | Duraklama | Pausen | Pausas | Pauses |
| roundsFillers | Fillers | Dolgu sözcüğü | Füllwörter | Muletillas | Mots de remplissage |
| roundsNote | Same topic, less time: more words a minute and fewer pauses mean it is flowing better. | Aynı konu, daha az süre: dakikada daha çok kelime ve daha az duraklama, daha akıcı demek. | Gleiches Thema, weniger Zeit: mehr Wörter pro Minute und weniger Pausen heißen, es läuft flüssiger. | Mismo tema, menos tiempo: más palabras por minuto y menos pausas significan más fluidez. | Même sujet, moins de temps : plus de mots par minute et moins de pauses, c'est plus fluide. |
| roundsUnmeasured | — : not measured (voice analysis off, or nothing was said). | — : ölçülmedi (ses analizi kapalı ya da hiç konuşulmadı). | — : nicht gemessen (Sprachanalyse aus oder nichts gesagt). | — : sin medir (análisis de voz desactivado o no se dijo nada). | — : non mesuré (analyse vocale désactivée ou rien dit). |

- [ ] **Step 5: Check**

Run: `pnpm test && npx tsc --noEmit -p .`
Expected: everything passes and tsc prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/Talk.tsx src/locales
git commit -m "Drills: 4/3/2 rounds and the rounds card in the voice chat"
```

---

### Task 3: 4/3/2 in the DrillsSheet (`src/screens/Screens.tsx`)

**Files:**
- Modify: `src/screens/Screens.tsx` (`DrillsSheet`)
- Modify: the 5 locale files (`practice` object)

**Interfaces:**
- Consumes (from Task 1): `FOUR_THREE_TWO_MINUTES` and `type Drill`.

- [ ] **Step 1: Sheet.** In `DrillsSheet`:
- Extend the drills import with `FOUR_THREE_TWO_MINUTES, type Drill`.
- Take `s` and `setS` from `useApp()` too.
- `pick` state becomes `useState<Drill["kind"] | null>(null)`.
- Add a second `list` entry after planning:

```tsx
    { id: "432" as const, icon: "refresh" as IconName, title: t("practice.fourThreeTwo"), desc: t("practice.fourThreeTwoDesc") },
```

- Replace `go` with:

```tsx
  const go = (analysis = false) => {
    if (!topic.trim() || !pick) return;
    if (analysis) setS((s) => ({ ...s, speechOn: true }));
    closeSheet();
    start(drillId(cast, pick === "432"
      ? { kind: "432", topic: topic.trim(), planningSec: 0, minutes: FOUR_THREE_TWO_MINUTES[0], round: 1, prev: [] }
      : { kind: "planning", topic: topic.trim(), planningSec: planSec, minutes: DRILL_MINUTES }));
  };
```

- The topic input's `onKeyDown` stays `go()`. Change the Start button's `onClick={go}` to `onClick={() => go()}`, so that the click event is not passed as `analysis`.

- [ ] **Step 2: Ask for voice analysis.**
- In step 2, insert this right after `<CastPicker ... />`:

```tsx
      {pick === "432" && !s.speechOn && <p className="muted small">{t("practice.needAnalysis")}</p>}
```

- In the actions row, the Start button turns ghost when the analysis prompt shows, and "Turn on and start" becomes the blue one:

```tsx
      <span className="rp-actions sheet-actions">
        <button className="btn btn-ghost" onClick={() => setPick(null)}>{t("voice.back")}</button>
        {pick === "432" && !s.speechOn
          ? <><button className="btn btn-ghost" disabled={!topic.trim()} onClick={() => go()}>{t("practice.start")}</button>
            <button className="btn btn-blue" disabled={!topic.trim()} onClick={() => go(true)}>{t("practice.enableAndStart")}</button></>
          : <button className="btn btn-blue" disabled={!topic.trim()} onClick={() => go()}>{t("practice.start")}</button>}
      </span>
```

- [ ] **Step 3: i18n.** Add these keys inside `practice` in all 5 locales:

| key | en | tr | de | es | fr |
|---|---|---|---|---|---|
| fourThreeTwo | 4/3/2 | 4/3/2 | 4/3/2 | 4/3/2 | 4/3/2 |
| fourThreeTwoDesc | Same topic: 4, 3, then 2 minutes | Aynı konu: 4, 3, sonra 2 dakika | Gleiches Thema: 4, 3, dann 2 Minuten | Mismo tema: 4, 3 y luego 2 minutos | Même sujet : 4, 3, puis 2 minutes |
| needAnalysis | Comparing the rounds needs voice analysis. | Turları karşılaştırmak için ses analizi gerekir. | Für den Vergleich der Runden braucht es die Sprachanalyse. | Comparar las rondas requiere el análisis de voz. | Comparer les manches nécessite l'analyse vocale. |
| enableAndStart | Turn on and start | Aç ve başlat | Einschalten und starten | Activar y empezar | Activer et commencer |

- [ ] **Step 4: Check**

Run: `pnpm test && npx tsc --noEmit -p .`
Expected: everything passes and tsc prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Screens.tsx src/locales
git commit -m "Practice: 4/3/2 in the drills sheet, asks for voice analysis"
```

---

## Manual check (user, `pnpm tauri dev`)

1. Go to Practice → Fluency drills → 4/3/2.
2. With voice analysis off, the note and "Turn on and start" show.
3. Round 1 runs 4:00.
4. Next round → round 2 runs 3:00. The AI does not introduce new things.
5. Round 3 runs 2:00. Then the card shows 3 columns; an unmeasured round shows "—".

Check the DB: rows are saved with `drill: "432"` and `round` 1–3.
