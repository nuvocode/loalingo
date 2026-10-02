# #42 Pressure ladder (3 rungs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pressure ladder is a 3-minute drill with three rungs. Each rung is a little harder than the one before:

| Rung | Planning | Topic |
|---|---|---|
| 1 | 60 s | The learner's own topic |
| 2 | None | The learner's own topic |
| 3 | None | A surprise topic |

**Architecture:**
- The ladder is a third drill kind, `ladder`, with a `rung` field.
- Rung 1 reuses the planning pre-screen through `planningSec: 60`. This does not move the planning drill's progression, because `planningHistory` only counts `drill: "planning"` rows.
- The surprise topic is picked when the sheet starts the drill, and the drill id carries it.

**Tech Stack:** React + TypeScript, i18next (5 locales), node --test.

## Global Constraints

- `pnpm test` and `npx tsc --noEmit -p .` must both pass
- 3 rungs only; no rung 4, no interruptions, no mic cap
- Session length 3 min (`DRILL_MINUTES`)
- Rows save `drill: "ladder"` and `rung`; rung 1 has `planningTimeSec: 60` and does not count toward the planning drill
- Every new i18n key exists in all 5 locales (en, tr, de, es, fr)
- Ponytail: minimal diff, match surrounding style

**Note on Kaneo:** Kaneo names the function `rungContext(1..3)`. Here the conditions table is `drillConditions`, which #41 introduced, and `ladderDrill(rung, topic, rand)` builds the drill.

---

### Task 1: Ladder in `src/drills.ts` and the Chat label

**Files:**
- Modify: `src/drills.ts`
- Modify: `src/drills.test.ts`
- Modify: `src/Talk.tsx` (`topicLabel` only)
- Modify: the 5 locale files (`practice.rungN`)

**Interfaces:**
- Produces:
  - `Drill.kind` gains `"ladder"`, and `Drill` gains `rung?: number`
  - `NOVEL_TOPICS: string[]`
  - `ladderDrill(rung: number, topic: string, rand = Math.random): Drill`
  - `drillConditions` and `drillId`/`parseDrill` handle `ladder`

- [ ] **Step 1: Write the failing tests.** Append to `src/drills.test.ts`, and add `NOVEL_TOPICS` and `ladderDrill` to its `./drills.ts` import:

```ts
test("ladderDrill + drillConditions: 3 rungs, each a little harder", () => {
  const [a, b, c] = [1, 2, 3].map((r) => ladderDrill(r, "my job", () => 0));
  assert.deepEqual(a, { kind: "ladder", topic: "my job", planningSec: 60, minutes: 3, rung: 1 });
  assert.deepEqual(b, { kind: "ladder", topic: "my job", planningSec: 0, minutes: 3, rung: 2 });
  assert.deepEqual(c, { kind: "ladder", topic: NOVEL_TOPICS[0], planningSec: 0, minutes: 3, rung: 3 });
  assert.equal(ladderDrill(3, "my job", () => 0.999).topic, NOVEL_TOPICS[NOVEL_TOPICS.length - 1]);
  assert.deepEqual(drillConditions(a), { mode: "drill", drill: "ladder", planningTimeSec: 60, topicFamiliarity: "prepared", rung: 1 });
  assert.deepEqual(drillConditions(b), { mode: "drill", drill: "ladder", planningTimeSec: 0, topicFamiliarity: "prepared", rung: 2 });
  assert.deepEqual(drillConditions(c), { mode: "drill", drill: "ladder", planningTimeSec: 0, topicFamiliarity: "novel", rung: 3 });
});

test("ladder id round-trips; rung 4 is not a drill", () => {
  const d = ladderDrill(1, "my job: the hard part");
  assert.deepEqual(parseTalkId(drillId("tom", d))?.drill, d);
  assert.equal(parseDrill(["ladder", encodeURIComponent(JSON.stringify({ rung: 4, topic: "x" }))]), null);
});
```

The existing `planningHistory` test already includes a ladder rung-1 row and expects it to be skipped. Leave it as it is.

- [ ] **Step 2: Run the tests.** Run `node --test src/drills.test.ts`. Expected: FAIL, because the exports are missing.

- [ ] **Step 3: Implement** in `src/drills.ts`.

Widen the type:

```ts
/** `round` (1–3) and `prev` (the stats of the rounds before it) only on 4/3/2; `rung` (1–3) only on the ladder. */
export type Drill = { kind: "planning" | "432" | "ladder"; topic: string; planningSec: number; minutes: number; round?: number; prev?: RoundStat[]; rung?: number };
```

Add the following after `FOUR_THREE_TWO_MINUTES`:

```ts
/** Ladder rung 3: a topic the learner did not pick. */
// ponytail: English only, short; the model talks in the course language anyway. Per-language lists if learners ask.
export const NOVEL_TOPICS = [
  "a time you got lost", "the best meal you have ever had", "something you changed your mind about", "a place you would like to live",
  "a skill you would like to learn", "your morning routine", "a small problem you solved recently", "a gift you remember",
];
/** Rung 1: 60 s planning, own topic. Rung 2: no planning, own topic. Rung 3: no planning, a surprise topic. */
export const ladderDrill = (rung: number, topic: string, rand = Math.random): Drill => ({
  kind: "ladder", topic: rung === 3 ? NOVEL_TOPICS[Math.floor(rand() * NOVEL_TOPICS.length)] : topic, planningSec: rung === 1 ? 60 : 0, minutes: DRILL_MINUTES, rung,
});
```

`DRILL_MINUTES` is declared above in the same file. If it is declared after this point, move these lines below it.

`drillConditions` gets a ladder branch first:

```ts
export const drillConditions = (d: Drill): Conditions => d.kind === "ladder"
  ? { mode: "drill", drill: "ladder", planningTimeSec: d.planningSec, topicFamiliarity: d.rung === 3 ? "novel" : "prepared", rung: d.rung }
  : d.kind === "432"
  ? /* unchanged */
```

In `drillId`, encode `{ rung: d.rung, topic: d.topic }` for ladder. Make the ternary three-way: ladder → that object; 432 → as now; planning → as now.

In `parseDrill`:
- Accept `kind === "ladder"`.
- Destructure `rung` too.
- After the topic check, add:

```ts
  if (kind === "ladder") return rung === 1 || rung === 2 || rung === 3 ? { kind, topic, planningSec: rung === 1 ? 60 : 0, minutes: DRILL_MINUTES, rung } : null;
```

- [ ] **Step 4: Chat label.** In `src/Talk.tsx`, `topicLabel` names the drill part. Change the drill name expression to:

```tsx
r432 ? t("practice.roundN", { n: r432.round, min: r432.minutes }) : drill.kind === "ladder" ? t("practice.rungN", { n: drill.rung }) : t("practice.planning")
```

Rung 1's planning pre-screen and its clock already work through `drill.planningSec`, so nothing else changes in Talk.

- [ ] **Step 5: i18n.** Add `rungN` inside `practice` in all 5 locales:

| en | tr | de | es | fr |
|---|---|---|---|---|
| Ladder · rung {{n}} | Merdiven · {{n}}. basamak | Leiter · Stufe {{n}} | Escalera · peldaño {{n}} | Échelle · échelon {{n}} |

- [ ] **Step 6: Run.** Run `pnpm test && npx tsc --noEmit -p .`. Expected: all pass, and tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/drills.ts src/drills.test.ts src/Talk.tsx src/locales
git commit -m "Drills: pressure ladder (3 rungs)"
```

---

### Task 2: Ladder in the DrillsSheet (`src/screens/Screens.tsx`)

**Files:**
- Modify: `src/screens/Screens.tsx` (`DrillsSheet`)
- Modify: the 5 locale files (`practice` object)

**Interfaces:**
- Consumes (from Task 1): `ladderDrill`.

- [ ] **Step 1: Sheet.** In `DrillsSheet`:
- Add `ladderDrill` to the drills import.
- Add state `const [rung, setRung] = useState(1);`.
- Add a third `list` entry:

```tsx
    { id: "ladder" as const, icon: "bolt" as IconName, title: t("practice.ladder"), desc: t("practice.ladderDesc") },
```

- In `go()`, the topic check becomes `if ((!topic.trim() && !(pick === "ladder" && rung === 3)) || !pick) return;`.
- The `drillId` argument becomes three-way:

```tsx
    start(drillId(cast, pick === "ladder" ? ladderDrill(rung, topic.trim())
      : pick === "432" ? { kind: "432", topic: topic.trim(), planningSec: 0, minutes: FOUR_THREE_TWO_MINUTES[0], round: 1, prev: [] }
      : { kind: "planning", topic: topic.trim(), planningSec: planSec, minutes: DRILL_MINUTES }));
```

- [ ] **Step 2: Rung control.**
- In step 2, put the rung control first: inside the step-2 stack, right after the `<h3>`, before the topic `<label>`. Add it only when `pick === "ladder"`:

```tsx
      {pick === "ladder" && <div className="od-field" style={{ "--od-gap": "6px" } as React.CSSProperties}>
        <b id="rung-pick">{t("practice.ladderRung")}</b>
        <div className="seg" role="radiogroup" aria-labelledby="rung-pick">
          {[1, 2, 3].map((r) => (
            <button key={r} role="radio" aria-checked={rung === r} className={`btn ${rung === r ? "btn-blue" : "btn-ghost"}`} onClick={() => setRung(r)}>{r}</button>
          ))}
        </div>
        <span className="muted small">{t(`practice.rung${rung}`)}</span>
      </div>}
```

- Wrap the topic `<label>` so it is hidden on rung 3, because the topic is a surprise there: `{!(pick === "ladder" && rung === 3) && <label ...>...</label>}`.
- Both Start buttons stay disabled only when they need a topic. Change their `disabled={!topic.trim()}` to `disabled={!topic.trim() && !(pick === "ladder" && rung === 3)}`. That covers the plain Start in the non-analysis branch. The two buttons in the 432 analysis branch only show for 432, so they can stay as they are.

- [ ] **Step 3: i18n.** Add these keys inside `practice` in all 5 locales:

| key | en | tr | de | es | fr |
|---|---|---|---|---|---|
| ladder | Pressure ladder | Baskı merdiveni | Druckleiter | Escalera de presión | Échelle de pression |
| ladderDesc | 3 rungs, each a little harder | 3 basamak, her biri biraz daha zor | 3 Stufen, jede etwas schwerer | 3 peldaños, cada uno un poco más difícil | 3 échelons, chacun un peu plus dur |
| ladderRung | Rung | Basamak | Stufe | Peldaño | Échelon |
| rung1 | 60 s to plan, then talk about your topic | 60 sn plan yap, sonra konunu anlat | 60 s planen, dann über dein Thema sprechen | 60 s para planear y luego habla de tu tema | 60 s pour préparer, puis parle de ton sujet |
| rung2 | No planning: talk about your topic right away | Planlama yok: konunu hemen anlat | Ohne Planung: sprich sofort über dein Thema | Sin planear: habla de tu tema enseguida | Sans préparation : parle tout de suite de ton sujet |
| rung3 | No planning, and a surprise topic | Planlama yok, konu sürpriz | Ohne Planung, mit Überraschungsthema | Sin planear y con un tema sorpresa | Sans préparation, avec un sujet surprise |

- [ ] **Step 4: Check.** Run `pnpm test && npx tsc --noEmit -p .`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Screens.tsx src/locales
git commit -m "Practice: pressure ladder in the drills sheet"
```

---

## Manual check (user, `pnpm tauri dev`)

1. Rung 1 shows the 60 s planning countdown.
2. Rung 2 starts talking right away.
3. Rung 3 hides the topic field and starts on a surprise topic.
4. Rows are saved with `drill: "ladder"` and `rung`.
5. The planning drill's suggested seconds do not change after a rung 1.
