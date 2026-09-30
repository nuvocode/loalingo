# L — Klavye kontrolü Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dersler ve hikâyeler başladıktan sonra yalnız klavyeyle yürütülebilsin (spec: `docs/superpowers/specs/2026-09-30-l-keyboard-controls-design.md`).

**Architecture:** Saf `src/keys.ts` bir tuşu ve ekranın durumunu alıp bir eyleme çevirir; `Lesson` ve `Story` birer `keydown` dinleyicisiyle bu eylemi mevcut fonksiyonlara bağlar. Egzersiz mantığı değişmez.

**Tech Stack:** React 19, TypeScript, `node --test` (type-stripping; testler `.ts` uzantısıyla import eder).

## Global Constraints

- Tuşlar spec'teki tablo ile birebir: `Enter` ana buton; `Esc` bugünkü gibi; `1`–`9` seçenek (9'dan fazla seçenekte kapalı); eşleştirmede sol `1`–`5`, sağ `6`–`9`, `0`; cevaptan sonra `1` Açıkla, `2` İtiraz; `Space` dinle / mikrofon / bankaya ekle; Atla'nın kısayolu yok.
- `e.repeat` ve `Ctrl`/`Cmd`/`Alt` basılı olaylar yok sayılır; `Shift+Enter` kısayol değildir.
- Odak `input`/`textarea`/`contenteditable` içindeyken ve açık pencere varken ders kısayolları çalışmaz (`Esc` hariç).
- İşlenen kısayolda `preventDefault` çağrılır.
- Yeni bağımlılık yok.
- `pnpm test` ve `pnpm -s tsc --noEmit -p .` temiz.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Dosyalar

- Create: `src/keys.ts`, `src/keys.test.ts`
- Modify: `src/Lesson.tsx`, `src/Mic.tsx`, `src/Talk.tsx` (`Story`), `src/styles.css`

---

### Task 1: `src/keys.ts` — tuş → eylem (saf, testli)

**Files:**
- Create: `src/keys.ts`, `src/keys.test.ts`

**Interfaces:**
- Produces:
  - `export type KeyState = { kind: "choice" | "bank" | "match" | "speak" | "input" | "other"; answered: boolean; options?: number; matchL?: number; matchR?: number; typed?: string; hit?: number; listen?: boolean; canExplain?: boolean; canAppeal?: boolean }`
  - `export type KeyEvt = { key: string; repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }`
  - `export type KeyAction = { do: "primary" } | { do: "pick"; index: number } | { do: "match"; side: "l" | "r"; index: number } | { do: "bankType"; text: string } | { do: "bankAdd"; index: number } | { do: "bankUndo" } | { do: "explain" } | { do: "appeal" } | { do: "listen" } | { do: "mic" }`
  - `export function keyAction(e: KeyEvt, s: KeyState): KeyAction | null`
  - `export function bankMatch(bank: string[], used: number[], typed: string): number`
  - `export const inField: (t: EventTarget | null) => boolean`

- [ ] **Step 1: Failing test** — `src/keys.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bankMatch, keyAction, type KeyState } from "./keys.ts";

const k = (key: string, extra = {}) => ({ key, ...extra });
const choice: KeyState = { kind: "choice", answered: false, options: 4 };

test("choice: digits pick, Enter is the main button", () => {
  assert.deepEqual(keyAction(k("1"), choice), { do: "pick", index: 0 });
  assert.deepEqual(keyAction(k("4"), choice), { do: "pick", index: 3 });
  assert.equal(keyAction(k("5"), choice), null);
  assert.deepEqual(keyAction(k("Enter"), choice), { do: "primary" });
  assert.equal(keyAction(k("1"), { ...choice, options: 10 }), null); // more options than digits: off
});

test("ignores repeats, modifiers and Shift+Enter", () => {
  assert.equal(keyAction(k("Enter", { repeat: true }), choice), null);
  assert.equal(keyAction(k("1", { ctrlKey: true }), choice), null);
  assert.equal(keyAction(k("1", { metaKey: true }), choice), null);
  assert.equal(keyAction(k("1", { altKey: true }), choice), null);
  assert.equal(keyAction(k("Enter", { shiftKey: true }), choice), null);
});

test("Space replays the audio when there is some", () => {
  assert.deepEqual(keyAction(k(" "), { ...choice, listen: true }), { do: "listen" });
  assert.equal(keyAction(k(" "), choice), null);
  assert.deepEqual(keyAction(k(" "), { kind: "other", answered: false, listen: true }), { do: "listen" });
});

test("match: left 1–5, right 6–9 then 0", () => {
  const m: KeyState = { kind: "match", answered: false, matchL: 5, matchR: 5 };
  assert.deepEqual(keyAction(k("1"), m), { do: "match", side: "l", index: 0 });
  assert.deepEqual(keyAction(k("5"), m), { do: "match", side: "l", index: 4 });
  assert.deepEqual(keyAction(k("6"), m), { do: "match", side: "r", index: 0 });
  assert.deepEqual(keyAction(k("0"), m), { do: "match", side: "r", index: 4 });
  const small: KeyState = { kind: "match", answered: false, matchL: 3, matchR: 3 };
  assert.deepEqual(keyAction(k("4"), small), { do: "match", side: "r", index: 0 });
  assert.equal(keyAction(k("7"), small), null);
});

test("bank: typing, adding, undoing, checking", () => {
  const b = (typed: string, hit: number): KeyState => ({ kind: "bank", answered: false, typed, hit });
  assert.deepEqual(keyAction(k("c"), b("", -1)), { do: "bankType", text: "c" });
  assert.deepEqual(keyAction(k("a"), b("c", 2)), { do: "bankType", text: "ca" });
  assert.deepEqual(keyAction(k(" "), b("ca", 2)), { do: "bankAdd", index: 2 });
  assert.deepEqual(keyAction(k("Enter"), b("ca", 2)), { do: "bankAdd", index: 2 });
  assert.equal(keyAction(k("Enter"), b("zz", -1)), null);
  assert.equal(keyAction(k(" "), b("", -1)), null);
  assert.deepEqual(keyAction(k("Backspace"), b("ca", 2)), { do: "bankType", text: "c" });
  assert.deepEqual(keyAction(k("Backspace"), b("", -1)), { do: "bankUndo" });
  assert.deepEqual(keyAction(k("Enter"), b("", -1)), { do: "primary" });
});

test("speak: Space toggles the mic", () => {
  assert.deepEqual(keyAction(k(" "), { kind: "speak", answered: false }), { do: "mic" });
});

test("after an answer: Enter continues, 1 explains, 2 appeals", () => {
  const a: KeyState = { kind: "choice", answered: true, options: 4, canExplain: true, canAppeal: true };
  assert.deepEqual(keyAction(k("Enter"), a), { do: "primary" });
  assert.deepEqual(keyAction(k("1"), a), { do: "explain" });
  assert.deepEqual(keyAction(k("2"), a), { do: "appeal" });
  assert.equal(keyAction(k("1"), { ...a, canExplain: false }), null);
  assert.equal(keyAction(k("2"), { ...a, canAppeal: false }), null);
  assert.equal(keyAction(k("c"), { kind: "bank", answered: true, typed: "", hit: -1 }), null);
});

test("bankMatch: first unused word starting with the typed text, ignoring case and accents", () => {
  const bank = ["Café", "cat", "dog", "cat"];
  assert.equal(bankMatch(bank, [], "ca"), 0);
  assert.equal(bankMatch(bank, [], "cafe"), 0);
  assert.equal(bankMatch(bank, [0], "ca"), 1);
  assert.equal(bankMatch(bank, [0, 1], "ca"), 3);
  assert.equal(bankMatch(bank, [], "x"), -1);
  assert.equal(bankMatch(bank, [], ""), -1);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test src/keys.test.ts`
Expected: FAIL — cannot find module `./keys.ts`.

- [ ] **Step 3: `src/keys.ts`**

```ts
// Keyboard control of lessons and stories (spec L). Pure: a key plus the screen's state in, an action out.

export type KeyState = {
  kind: "choice" | "bank" | "match" | "speak" | "input" | "other";
  answered: boolean; // feedback is showing
  options?: number; // choice
  matchL?: number; matchR?: number; // match column sizes
  typed?: string; hit?: number; // bank: typed text and the word it points at (-1 = none)
  listen?: boolean; // there is audio to replay
  canExplain?: boolean; canAppeal?: boolean;
};
export type KeyEvt = { key: string; repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean };
export type KeyAction =
  | { do: "primary" } | { do: "pick"; index: number } | { do: "match"; side: "l" | "r"; index: number }
  | { do: "bankType"; text: string } | { do: "bankAdd"; index: number } | { do: "bankUndo" }
  | { do: "explain" } | { do: "appeal" } | { do: "listen" } | { do: "mic" };

/** "1".."9" → 0..8, "0" → 9, anything else → -1. */
const digit = (key: string) => (/^[0-9]$/.test(key) ? (Number(key) + 9) % 10 : -1);

export function keyAction(e: KeyEvt, s: KeyState): KeyAction | null {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Enter" && e.shiftKey) return null;
  const d = digit(e.key);
  const listen = e.key === " " && s.listen ? { do: "listen" as const } : null;
  if (s.answered) {
    if (e.key === "Enter") return { do: "primary" };
    if (d === 0 && s.canExplain) return { do: "explain" };
    if (d === 1 && s.canAppeal) return { do: "appeal" };
    return listen;
  }
  switch (s.kind) {
    case "choice":
      if (d >= 0 && d < (s.options ?? 0) && (s.options ?? 0) <= 9) return { do: "pick", index: d };
      break;
    case "match": {
      const l = s.matchL ?? 0, r = s.matchR ?? 0;
      if (d >= 0 && l + r <= 10) {
        if (d < l) return { do: "match", side: "l", index: d };
        if (d < l + r) return { do: "match", side: "r", index: d - l };
      }
      break;
    }
    case "speak":
      if (e.key === " ") return { do: "mic" };
      break;
    case "bank": {
      const typed = s.typed ?? "", hit = s.hit ?? -1;
      if (e.key === "Backspace") return typed ? { do: "bankType", text: typed.slice(0, -1) } : { do: "bankUndo" };
      if (typed && (e.key === " " || e.key === "Enter")) return hit >= 0 ? { do: "bankAdd", index: hit } : null;
      if (e.key.length === 1 && e.key !== " ") return { do: "bankType", text: typed + e.key };
      break;
    }
  }
  if (e.key === "Enter") return { do: "primary" };
  return listen;
}

const fold = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

/** Index of the first unused bank word starting with `typed` (case and accents ignored), or -1. */
export function bankMatch(bank: string[], used: number[], typed: string): number {
  if (!typed) return -1;
  const f = fold(typed);
  return bank.findIndex((w, i) => !used.includes(i) && fold(w).startsWith(f));
}

/** Keys typed into a text field belong to the field, not to the shortcuts. */
export const inField = (t: EventTarget | null) =>
  !!(t as Element | null)?.closest?.("input, textarea, [contenteditable]");
```

- [ ] **Step 4: Run to see it pass**

Run: `node --test src/keys.test.ts` → PASS. Then `pnpm test` and `pnpm -s tsc --noEmit -p .` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/keys.ts src/keys.test.ts
git commit -m "Map keys to lesson actions in keys.ts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Derste klavye (`Lesson.tsx`, `Mic.tsx`, CSS)

**Files:**
- Modify: `src/Lesson.tsx`, `src/Mic.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `keyAction`, `bankMatch`, `inField`, `KeyState` (Task 1).
- Produces: `MicButton` gets an optional `trigger?: number` prop — every change (other than the first render / `0`) toggles recording as if clicked.

- [ ] **Step 1: `src/Mic.tsx`** — signature and one effect:

```tsx
export function MicButton({ lang, onText, disabled, trigger = 0 }: { lang: string; onText: (text: string) => void; disabled?: boolean; trigger?: number }) {
```

After the existing `useEffect(() => () => { rec.current?.stop(false); }, []);` add:

```tsx
  // Keyboard (spec L): each bump of `trigger` presses the button.
  useEffect(() => { if (trigger && !disabled) toggle(); }, [trigger]);
```

- [ ] **Step 2: `src/Lesson.tsx` imports** — add:

```tsx
import { bankMatch, inField, keyAction, type KeyAction, type KeyState } from "./keys";
```

- [ ] **Step 3: state** — after `const [text, setText] = useState("");` add:

```tsx
  const [typed, setTyped] = useState(""); // bank: letters typed to pick a word (spec L)
  const [micPress, setMicPress] = useState(0); // speak: Space bumps this to press the mic
```

and in `reset()` add `setTyped("");` (after `setText("");`).

- [ ] **Step 4: explain / appeal openers** — replace the two footer `onClick` bodies with named functions. Add after `submitAppeal`:

```tsx
  const openExplain = () => { if (it && ctx && fb) openSheet(<ExplainSheet run={() => explain(ctx, questionOf(it), fb.correct, fb.given)} />); };
  const openAppeal = () => openSheet(<AppealSheet onSend={submitAppeal} />);
```

Footer buttons become (the `<kbd>` badges show the shortcut):

```tsx
                  {fb.judged && !fb.appealed && ctx && <button className="btn btn-ghost" onClick={openAppeal}>🚩 {t("lesson.appeal")} <kbd className="kbd">2</kbd></button>}
                  {!fb.ok && ctx && <button className="btn btn-ghost" onClick={openExplain}>{t("lesson.explain")} <kbd className="kbd">1</kbd></button>}
```

- [ ] **Step 5: keyboard listener** — replace the existing Escape effect:

```tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sheet) askQuit(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
```

with this block, placed **after** the `canCheck` / `last` / `listenBtn` constants (it needs `canCheck`, `matchCols`, `pickMatch`, `check`, `next`):

```tsx
  // Keyboard (spec L): one listener maps keys to the same actions as the buttons.
  const hit = it?.kind === "bank" ? bankMatch(it.bank, bankSel, typed) : -1;
  const audio = !it ? "" : it.kind === "learn" ? it.phrase : (it.kind === "choice" || it.kind === "input") ? it.listen : "";
  const keyState: KeyState = {
    kind: load.state !== "ready" || result || !it || it.kind === "learn" ? "other" : it.kind,
    answered: !!fb && !result,
    options: it?.kind === "choice" ? it.options.length : 0,
    matchL: matchCols?.l.length, matchR: matchCols?.r.length,
    typed, hit, listen: !!audio && !result,
    canExplain: !!fb && !fb.ok && !!ctx && !result,
    canAppeal: !!fb?.judged && !fb.appealed && !!ctx && !result,
  };
  const primary = () => {
    if (load.state === "error") return setGen((g) => g + 1);
    if (load.state !== "ready") return;
    if (result || !it) return quit();
    if (fb || it.kind === "learn") return next();
    if (canCheck) check();
  };
  const run = (a: KeyAction) => {
    if (!it && a.do !== "primary") return;
    switch (a.do) {
      case "primary": return primary();
      case "pick": return setSel(a.index);
      case "match": return matchCols && pickMatch(a.side, matchCols[a.side][a.index]);
      case "bankType": return setTyped(a.text);
      case "bankAdd": setBankSel([...bankSel, a.index]); return setTyped("");
      case "bankUndo": return setBankSel(bankSel.slice(0, -1));
      case "explain": return openExplain();
      case "appeal": return openAppeal();
      case "listen": return speak(audio, lang);
      case "mic": return setMicPress((n) => n + 1);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (!sheet) askQuit(); return; }
      if (sheet || inField(e.target) || checking) return;
      const a = keyAction(e, keyState);
      if (!a) return;
      e.preventDefault();
      run(a);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
```

Note: `matchCols` and `pickMatch` are declared above `canCheck` already; `matchCols?.l.length` is `undefined` when not a match item, which `keyAction` treats as 0.

- [ ] **Step 6: mic trigger** — the speak item's `MicButton` gets `trigger={micPress}`:

```tsx
      <MicButton lang={lang} disabled={!!fb} trigger={micPress} onText={(txt) => {
```

- [ ] **Step 7: bank typed line + highlight** — in the bank body, between the `bank-area` div and the `bank` div:

```tsx
      {typed && <p className="bank-typed" aria-live="polite">{typed}</p>}
```

and the bank token class becomes:

```tsx
          <button className={`tok ${bankSel.includes(j) ? "used" : j === hit ? "sel" : ""}`} key={j} disabled={!!fb} onClick={() => setBankSel([...bankSel, j])}>{w}</button>
```

- [ ] **Step 8: match badges** — match buttons show their key (`1`–`5` left, then right continues, `0` for the 10th):

```tsx
            {matchCols![side].map((v, vi) => {
              const cls = matched.done.includes(v) ? "correct" : matched.wrong.includes(v) ? "wrong" : matched.left === v ? "sel" : "";
              const n = (side === "l" ? vi : matchCols!.l.length + vi) + 1;
              return <button key={v} className={`opt ${cls}`} disabled={matched.done.includes(v) || !!fb} onClick={() => pickMatch(side, v)}>
                {matchCols!.l.length + matchCols!.r.length <= 10 && <span className="opt-num">{n % 10}</span>}<span>{v}</span></button>;
            })}
```

- [ ] **Step 9: ExplainSheet Enter** — its button gets `autoFocus` so `Enter` presses "Anladım" natively:

```tsx
    <button className="btn btn-primary btn-block" autoFocus onClick={closeSheet}>{t("lesson.gotIt")}</button>
```

- [ ] **Step 10: CSS** — append to `src/styles.css`:

```css
/* Keyboard control (spec L) */
.kbd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;margin-left:6px;border:2px solid currentColor;border-radius:6px;font:inherit;font-size:11px;font-weight:800;opacity:.6}
.tok.sel{border-color:var(--blue);background:var(--sky)}
.bank-typed{text-align:center;font-weight:800;color:var(--blue);margin:-12px 0 0}
```

- [ ] **Step 11: tsc + tests** — `pnpm -s tsc --noEmit -p .` and `pnpm test` → clean.

- [ ] **Step 12: Browser check** (`preview_start` name `web`, localhost:1420; an AI provider is configured in the preview). Start a lesson and, without the mouse:
  - choice: `2` selects option 2, `Enter` checks, `Enter` continues.
  - bank: type the first letters of a word → it is highlighted and the typed line shows; `Space` adds it; `Backspace` on empty removes the last word; `Enter` checks.
  - input: type, `Enter` checks; after feedback `Enter` continues.
  - match: `1` then the right number pairs them.
  - wrong answer: `1` opens Açıkla, `Enter` closes it, `Enter` continues.
  - result screen: `Enter` ends the lesson.
  - `Esc` still asks to quit; holding `Enter` does not skip several questions.
  If a kind does not appear in the generated lesson, try `practice-listen` / `practice-mistakes` / `practice-madness` (match) from the Pratik screen, and note what could not be exercised.

- [ ] **Step 13: Commit**

```bash
git add src/Lesson.tsx src/Mic.tsx src/styles.css
git commit -m "Drive lessons from the keyboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Hikâyede klavye (`Story` in `src/Talk.tsx`)

**Files:**
- Modify: `src/Talk.tsx` (`Story`)

**Interfaces:**
- Consumes: `keyAction`, `inField`, `KeyState` (Task 1). `useApp().sheet`.

- [ ] **Step 1: Import** — add to `src/Talk.tsx`:

```tsx
import { inField, keyAction, type KeyState } from "./keys";
```

- [ ] **Step 2: `sheet`** — in `Story`, the `useApp()` destructure adds `sheet`:

```tsx
  const { course, enrollment, profile, s, setS, completeStep, sheet } = useApp();
```

- [ ] **Step 3: listener** — in `Story`, right after the `check` constant:

```tsx
  // Keyboard (spec L): digits pick an answer, Enter is the footer button, Space replays the line. Esc stays in useQuit.
  const keyState: KeyState = {
    kind: q && !checked ? "choice" : "other",
    answered: false,
    options: q?.options.length ?? 0,
    listen: !!story && !result && !q,
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || inField(e.target)) return;
      const a = keyAction(e, keyState);
      if (!a) return;
      e.preventDefault();
      if (a.do === "pick") return setSel(a.index);
      if (a.do === "listen") return speak(story!.lines[lastLine].text, lang);
      if (a.do !== "primary") return;
      if (err) return setGen((g) => g + 1);
      if (!story) return;
      if (result) return quit();
      if (q && !checked) { if (sel !== null) check(); return; }
      next();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
```

(After a story question is checked, `kind` is `"other"`, so `Enter` continues — same as the footer.)

- [ ] **Step 4: tsc + tests** — clean.

- [ ] **Step 5: Browser check** — open a story (Öğren → a unit's story). Without the mouse: `Enter` advances lines, `Space` replays the current line, at a question `1`–`4` selects and `Enter` checks then continues, the result screen closes with `Enter`, `Esc` asks to quit.

- [ ] **Step 6: Commit**

```bash
git add src/Talk.tsx
git commit -m "Drive stories from the keyboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: tuş haritası (Task 1 test + Task 2/3 wiring), rozetler (Task 2 Step 4, 8), banka satırı (Step 7), Açıkla penceresinde Enter (Step 9), kenar durumlar (Task 1 modifiers/repeat, Task 2 `sheet`/`inField`/`checking`/`preventDefault`).
- Deviation from spec wording: eşleştirme rozetleri seçmelideki gibi `.opt-num` span'ı (görsel tutarlılık); cevap sonrası butonlarda `<kbd>`.
