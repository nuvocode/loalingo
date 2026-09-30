# M — Gerçekçi lig rakipleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lig rakipleri dile göre karışık isimler, lige göre zorluk, haftalık ±%20 sürpriz, kişiye özgü tutku ve 10–40 XP'lik adımlarla gerçekçi ilerlesin.

**Architecture:** `src/league.ts` saf kalır. Her rakibin haftalık hedefi (`total`) ve tutkusu (`passion`) lig kurulurken tohumdan çekilir. Oturumlar (`sessions`) rakibin kendi alanlarından deterministik türetilir ve önbelleğe alınır. `rivalXp` imzası aynı kalır; `rankOf`, `useLeague` değişmez. `rollDay`/`rollLeague` isteğe bağlı `who = { id, lang }` alır ve eski biçimli ligi yeniden kurar.

**Tech Stack:** TypeScript, React 19, `node --test` (type stripping, testler `.ts` import eder).

**Spec:** `docs/superpowers/specs/2026-09-30-m-realistic-league-design.md`

## Global Constraints

- Lig ortalaması `mean(tier) = 7 × (15 + 12 × tier)` haftalık XP; lig temposu `pace ∈ [0.8, 1.2]`; `total = max(10, round5(mean × pace × spread))`, `spread ∈ [0.2, 2.0]` ortaya yığılı.
- `passion ∈ [0, 1]`; oturum zamanı yoğunluğu `∝ t^k`, `k = 0.2 + 2.3 × (1 − passion)`.
- Oturum: 10–40 XP, 5'in katı, 08:00–24:00 yerel saat, toplam = `total`.
- Lig tohumu `hafta:seviye:profilId`; 9 rakibin 4 ya da 5'i kullanıcının dilinden, dil yoksa `en`; isim tekrar etmez.
- Rakipler kullanıcıya tepki vermez.
- Commit trailer tam olarak: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Komutlar: `pnpm test`, `pnpm -s tsc --noEmit -p .`

---

### Task 1: Rakip modeli (`src/league.ts`)

**Files:**
- Modify (tamamen değiştir): `src/league.ts`
- Modify (tamamen değiştir): `src/league.test.ts`

**Interfaces:**
- Produces:
  - `type Rival = { n: string; c: string; total: number; passion: number }`
  - `type Who = { id: number; lang: string }`
  - `type LeagueState = { week; tier; rivals: Rival[]; last?; who?: Who }`
  - `NAMES: Record<string, string[]>`
  - `newLeague(week, tier, last?, who?)`
  - `sessions(r: Rival, week: string): { at: number; xp: number }[]`
  - `rivalXp(r, week, now)`, `rankOf`, `msLeft`, `weekOf`, `TIERS`, `PROMOTE`, `DEMOTE` (aynı imza)
  - `rollLeague(l, weekXp, day, who = l?.who)`

- [ ] **Step 1: Testleri yaz.** `src/league.test.ts` içeriğini tamamen şununla değiştir:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { NAMES, newLeague, rankOf, rivalXp, rollLeague, sessions, weekOf, type LeagueState, type Rival } from "./league.ts";

const W = "2026-09-28", start = new Date(2026, 8, 28).getTime(), DAY = 86_400_000;
const who = { id: 1, lang: "tr" };
const avg = (l: LeagueState) => l.rivals.reduce((a, r) => a + r.total, 0) / l.rivals.length;

test("weeks start on Monday", () => {
  assert.equal(weekOf("2026-09-28"), "2026-09-28"); // Monday
  assert.equal(weekOf("2026-10-04"), "2026-09-28"); // Sunday
  assert.equal(weekOf("2026-10-05"), "2026-10-05");
});

test("rivals are stable per week and grow through it", () => {
  const a = newLeague(W, 2, undefined, who);
  assert.deepEqual(a, newLeague(W, 2, undefined, who));
  assert.notDeepEqual(a.rivals, newLeague(W, 2, undefined, { id: 2, lang: "tr" }).rivals, "each learner gets their own league");
  assert.equal(new Set(a.rivals.map((r) => r.n)).size, 9);
  for (const r of a.rivals) {
    assert.ok(r.passion >= 0 && r.passion <= 1);
    assert.equal(rivalXp(r, W, start), 0);
    assert.equal(rivalXp(r, W, start + 30 * DAY), r.total, "all of it by the week's end");
    let prev = 0;
    for (let h = 0; h <= 168; h += 3) { const x = rivalXp(r, W, start + h * 3_600_000); assert.ok(x >= prev); prev = x; }
  }
});

test("sessions: 10–40 XP in fives, 08:00–24:00, inside the week, summing to total", () => {
  for (const tier of [0, 5, 9]) for (const r of newLeague(W, tier, undefined, who).rivals) {
    const s = sessions(r, W);
    assert.equal(s.reduce((a, x) => a + x.xp, 0), r.total);
    assert.deepEqual(s, sessions({ ...r }, W), "same rival, same sessions");
    s.forEach((x, i) => {
      assert.ok(x.xp >= 10 && x.xp <= 40 && x.xp % 5 === 0, `step ${x.xp}`);
      assert.ok(x.at >= start && x.at < start + 7 * DAY);
      assert.ok(new Date(x.at).getHours() >= 8);
      if (i) assert.ok(x.at >= s[i - 1].at);
    });
  }
});

test("the week gets busier, low passion starts late", () => {
  const mid = start + 3.5 * DAY;
  let early = 0, all = 0;
  for (let t = 0; t < 10; t++) for (const r of newLeague(W, t, undefined, who).rivals) { early += rivalXp(r, W, mid); all += r.total; }
  assert.ok(early < all / 2, `${early} of ${all} by midweek`);
  const lazy: Rival = { n: "A", c: "#000", total: 400, passion: 0 };
  assert.ok(rivalXp(lazy, W, mid) < rivalXp({ ...lazy, passion: 1 }, W, mid));
});

test("standings change during the week", () => {
  const l = newLeague(W, 4, undefined, who);
  const order = (now: number) => l.rivals.map((r) => [r.n, rivalXp(r, W, now)] as const).sort((a, b) => b[1] - a[1]).map((x) => x[0]).join();
  const seen = new Set<string>();
  for (let d = 1; d <= 7; d++) seen.add(order(start + d * DAY));
  assert.ok(seen.size > 2, `${seen.size} distinct orders`);
});

test("higher leagues are busier, weeks vary, totals stay in range", () => {
  assert.ok(avg(newLeague(W, 9, undefined, who)) > avg(newLeague(W, 0, undefined, who)));
  const weeks = ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"].map((w) => avg(newLeague(w, 3, undefined, who)));
  assert.ok(new Set(weeks).size > 1, "a surprise every week");
  for (const t of [0, 9]) {
    const mean = 7 * (15 + 12 * t);
    for (const r of newLeague(W, t, undefined, who).rivals) assert.ok(r.total >= 10 && r.total >= mean * 0.16 - 5 && r.total <= mean * 2.4 + 5, `${r.total}`);
  }
});

test("about half the names come from the learner's language", () => {
  for (let id = 1; id <= 6; id++) {
    const l = newLeague(W, 0, undefined, { id, lang: "tr" });
    const tr = l.rivals.filter((r) => NAMES.tr.includes(r.n)).length;
    assert.ok(tr === 4 || tr === 5, `${tr} Turkish names`);
    assert.equal(new Set(l.rivals.map((r) => r.n)).size, 9);
  }
  const unknown = newLeague(W, 0, undefined, { id: 1, lang: "xx" });
  assert.ok(unknown.rivals.filter((r) => NAMES.en.includes(r.n)).length >= 4, "unknown language falls back to English");
});

test("new week settles the league: top 3 up, bottom 3 down, idle stays out of promotion", () => {
  const l = newLeague(W, 3, undefined, who);
  const same = rollLeague(l, 50, "2026-10-02");
  assert.equal(same.league, l, "same week: unchanged");
  const up = rollLeague(l, 1e6, "2026-10-05");
  assert.equal(up.league.tier, 4); assert.equal(up.league.last, "up"); assert.equal(up.weekXp, 0);
  assert.deepEqual(up.league.who, who, "the learner carries over");
  assert.ok(rankOf(l, 0, new Date(2026, 9, 5).getTime()) > 7);
  const down = rollLeague(l, 0, "2026-10-05");
  assert.equal(down.league.tier, 2); assert.equal(down.league.last, "down");
  assert.equal(rollLeague(newLeague(W, 0), 0, "2026-10-05").league.tier, 0, "no tier below Seed");
  assert.equal(rollLeague(null, 0, "2026-10-05").league.week, "2026-10-05");
});

test("an old-format league is redrawn, keeping tier and weekly XP", () => {
  const old = { week: W, tier: 3, last: "up", rivals: [{ n: "Aylin", c: "#000", rate: 20 }] } as unknown as LeagueState;
  const same = rollLeague(old, 120, "2026-10-01", who);
  assert.equal(same.league.tier, 3); assert.equal(same.league.last, "up"); assert.equal(same.weekXp, 120);
  assert.equal(same.league.rivals.length, 9); assert.deepEqual(same.league.who, who);
  const next = rollLeague(old, 120, "2026-10-05", who);
  assert.equal(next.league.tier, 3); assert.equal(next.league.week, "2026-10-05"); assert.equal(next.weekXp, 0);
});
```

- [ ] **Step 2: Başarısız olduğunu gör**

Run: `node --test src/league.test.ts`
Expected: FAIL (`NAMES`/`sessions` export edilmiyor).

- [ ] **Step 3: Uygula.** `src/league.ts` içeriğini tamamen şununla değiştir:

```ts
// Weekly league against simulated rivals (local-first: no server). Pure module, tested by src/league.test.ts.

/** A rival's whole week is fixed when the league is drawn: `total` XP by Sunday night, `passion` 0–1 (1 = steady from Monday, 0 = crams at the end). */
export type Rival = { n: string; c: string; total: number; passion: number };
export type Who = { id: number; lang: string };
export type LeagueState = { week: string; tier: number; rivals: Rival[]; last?: "up" | "down" | "stay"; who?: Who };

export const TIERS = 10; // Seed … Forest (names: i18n league.tier0..9)
export const PROMOTE = 3, DEMOTE = 3;
/** 10 names per UI language; about half of a league comes from the learner's own. */
export const NAMES: Record<string, string[]> = {
  tr: ["Aylin", "Mert", "Zeynep", "Kaan", "Elif", "Deniz", "Baran", "Selin", "Umut", "Ece"],
  en: ["Liam", "Chloe", "Noah", "Emma", "Oliver", "Grace", "Jack", "Ava", "Harry", "Mia"],
  de: ["Lena", "Jonas", "Felix", "Hannah", "Lukas", "Marie", "Paul", "Clara", "Finn", "Greta"],
  es: ["Sofía", "Mateo", "Lucía", "Diego", "Valeria", "Pablo", "Carmen", "Javier", "Elena", "Alba"],
  fr: ["Léa", "Hugo", "Manon", "Louis", "Camille", "Jules", "Inès", "Arthur", "Zoé", "Théo"],
};
const COLORS = ["#e91e63", "#4c6ef5", "#12b886", "#b07cf0", "#f4862a", "#00b8a9", "#8d6e63", "#5c6bc0", "#ef5350", "#f5b014"];

/** Monday of the week containing `day` (YYYY-MM-DD, local). */
export function weekOf(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d - ((new Date(y, m - 1, d).getDay() + 6) % 7));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
const weekStartMs = (week: string) => { const [y, m, d] = week.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
const DAY_MS = 86_400_000, HOUR_MS = 3_600_000;

// Seeded PRNG (mulberry32) so a week's rivals are stable and tests are deterministic.
function rng(seed: string) {
  let a = [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 2654435761), 1779033703);
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = <T,>(a: T[], r: () => number) => a.map((x) => [r(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

export function newLeague(week: string, tier: number, last?: LeagueState["last"], who?: Who): LeagueState {
  const r = rng(`${week}:${tier}:${who?.id ?? 0}`);
  const lang = who && NAMES[who.lang] ? who.lang : "en";
  const local = 4 + Math.floor(r() * 2); // 4 or 5 from the learner's language
  const others = shuffle(Object.entries(NAMES).filter(([k]) => k !== lang).flatMap(([, v]) => v), r);
  const names = shuffle([...shuffle(NAMES[lang], r).slice(0, local), ...others.slice(0, 9 - local)], r);
  const mean = 7 * (15 + 12 * tier); // weekly XP of an average rival; higher tiers are busier
  const pace = 0.8 + r() * 0.4; // this week's surprise: ±20% for the whole league
  return {
    week, tier, last, who,
    rivals: names.map((n, i) => ({
      n, c: COLORS[i],
      // spread 0.2–2×, piled up in the middle: a few keen, a few nearly idle
      total: Math.max(10, Math.round((mean * pace * (0.2 + 0.9 * (r() + r()))) / 5) * 5),
      passion: Math.round(r() * 100) / 100,
    })),
  };
}

const cache = new Map<string, { at: number; xp: number }[]>(); // ponytail: never evicted, ~9 rivals a week

/** A rival's study sessions this week, oldest first: 10–40 XP each (in fives), 08:00–24:00 local, summing to `total`. */
export function sessions(r: Rival, week: string) {
  const key = `${week}:${r.n}:${r.total}:${r.passion}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = rng(key), k = 0.2 + 2.3 * (1 - r.passion); // density ∝ t^k: everyone speeds up, low passion most
  const [y, m, d] = week.split("-").map(Number);
  const out: { at: number; xp: number }[] = [];
  for (let left = r.total; left > 0; left -= out[out.length - 1].xp) {
    const most = Math.min(40, left) / 5;
    let xp;
    do xp = 5 * (2 + Math.floor(g() * (most - 1))); while (left - xp === 5); // never leave a step below 10
    const t = 7 * g() ** (1 / (k + 1)), day = Math.floor(t);
    out.push({ at: new Date(y, m - 1, d + day, 8).getTime() + Math.floor((t - day) * 16 * HOUR_MS), xp });
  }
  out.sort((a, b) => a.at - b.at);
  cache.set(key, out);
  return out;
}

/** Rival XP at `now`: the sessions done by then. */
export const rivalXp = (r: Rival, week: string, now: number) =>
  sessions(r, week).reduce((sum, s) => (s.at <= now ? sum + s.xp : sum), 0);

/** 1-based rank of the learner among rivals (ties go to the learner). */
export const rankOf = (l: LeagueState, myXp: number, now: number) => 1 + l.rivals.filter((r) => rivalXp(r, l.week, now) > myXp).length;

/** New week: settle the old one (top 3 up, bottom 3 down) and draw new rivals. Returns the same objects if nothing changes.
 *  A league saved before rivals had `total` (old `rate` format) is redrawn at the same tier. */
export function rollLeague(l: LeagueState | null, weekXp: number, day: string, who = l?.who): { league: LeagueState; weekXp: number } {
  const week = weekOf(day);
  if (!l) return { league: newLeague(week, 0, undefined, who), weekXp: 0 };
  const legacy = l.rivals.some((r) => typeof r.total !== "number");
  if (l.week === week) return legacy ? { league: newLeague(week, l.tier, l.last, who), weekXp } : { league: l, weekXp };
  if (legacy) return { league: newLeague(week, l.tier, "stay", who), weekXp: 0 };
  const rank = rankOf(l, weekXp, weekStartMs(l.week) + 7 * DAY_MS);
  const last = weekXp > 0 && rank <= PROMOTE ? "up" : rank > l.rivals.length + 1 - DEMOTE ? "down" : "stay";
  const tier = Math.min(TIERS - 1, Math.max(0, l.tier + (last === "up" ? 1 : last === "down" ? -1 : 0)));
  return { league: newLeague(week, tier, last, who), weekXp: 0 };
}

export const msLeft = (l: LeagueState, now: number) => weekStartMs(l.week) + 7 * DAY_MS - now;
```

- [ ] **Step 4: Testler geçsin**

Run: `node --test src/league.test.ts`
Expected: 9 pass, 0 fail.

- [ ] **Step 5: Tip kontrolü.** Run: `pnpm -s tsc --noEmit -p .`. Expected: hata yok. (`progress.ts` `rollLeague`'i 3 argümanla çağırıyor; `who` isteğe bağlı olduğu için derlenir.)

- [ ] **Step 6: Commit**

```bash
git add src/league.ts src/league.test.ts
git commit -m "Give league rivals weekly targets, passion and stepped sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Profili lige bağla, lig ekranını canlı tut

**Files:**
- Modify: `src/progress.ts:2` (import), `src/progress.ts:45-48` (`rollDay`)
- Modify: `src/progress.test.ts` (import + yeni test)
- Modify: `src/store.tsx:102`
- Modify: `src/screens/Screens.tsx` (`League` bileşeni)

**Interfaces:**
- Consumes: Task 1'den `rollLeague(l, weekXp, day, who = l?.who)`, `type Who`, `type LeagueState`
- Produces: `rollDay(s: Stats, day: string, who?: Who): Stats` — hiçbir şey değişmezse aynı nesneyi döndürür. `recordSession` değişmez (ligin kayıtlı `who`'sunu kullanır).

- [ ] **Step 1: Test yaz.** `src/progress.test.ts` import satırının altına ekle:

```ts
import type { LeagueState } from "./league.ts";
```

Dosyanın sonuna ekle:

```ts
test("rollDay redraws an old-format league the same day and passes the learner on", () => {
  const old = { week: "2026-09-28", tier: 2, rivals: [{ n: "Aylin", c: "#000", rate: 20 }] } as unknown as LeagueState;
  const s = { ...NEW_STATS, day: "2026-10-01", league: old, weekXp: 80 };
  const r = rollDay(s, "2026-10-01", { id: 7, lang: "de" });
  assert.equal(r.league!.tier, 2); assert.equal(r.weekXp, 80);
  assert.deepEqual(r.league!.who, { id: 7, lang: "de" });
  assert.ok(r.league!.rivals.every((x) => x.total > 0));
  assert.equal(rollDay(r, "2026-10-01"), r, "nothing to do: same object");
});
```

- [ ] **Step 2: Başarısız olduğunu gör.** Run: `node --test src/progress.test.ts`. Expected: yeni test FAIL (aynı gün erken dönüş eski ligi korur).

- [ ] **Step 3: `src/progress.ts`**

Import:

```ts
import { rollLeague, type LeagueState, type Who } from "./league.ts"; // .ts: node --test runs this file directly
```

`rollDay`'in ilk üç satırını değiştir:

```ts
export function rollDay(s: Stats, day: string, who?: Who): Stats {
  const lg = rollLeague(s.league, s.weekXp, day, who); // a new day may also start a new league week (or redraw an old-format one)
  if (s.day === day) return lg.league === s.league ? s : { ...s, ...lg };
```

(Önceki `if (s.day === day && s.league) return s;` satırı silinir; `rollLeague` aynı haftada aynı nesneyi döndürdüğü için sonuç aynıdır.)

- [ ] **Step 4: Testler geçsin.** Run: `node --test src/progress.test.ts src/league.test.ts`. Expected: hepsi pass.

- [ ] **Step 5: `src/store.tsx:102`**

```ts
    const stats = rollDay(fresh.stats, today(), { id: fresh.id, lang: fresh.ui_lang });
```

- [ ] **Step 6: `src/screens/Screens.tsx` — `League` açıkken dakikada bir yeniden çiz.** `export function League()` içinde `const { rows, name, left, last } = useLeague();` satırından hemen önce ekle:

```ts
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(id); }, []); // rivals keep studying
```

(`useState`/`useEffect` dosyada zaten import edili.)

- [ ] **Step 7: Doğrula.** Run: `pnpm test` ve `pnpm -s tsc --noEmit -p .`. Expected: hepsi pass, tip hatası yok.

- [ ] **Step 8: Tarayıcı önizlemesi.** `preview_start` name `web` (localhost:1420). Lig ekranını aç: 9 rakip, karışık isimler (yaklaşık yarısı profilin arayüz dilinden), hafta ilerledikçe 5'in katı XP'ler. `javascript_tool` ile `Date.now`'u birkaç gün ileri kaydırıp (ör. `const n=Date.now; Date.now=()=>n()+2*864e5`) bir dakika bekle ya da sayfayı yeniden çiz; sıralamanın değiştiğini gör. Konsolda hata olmamalı.

- [ ] **Step 9: Commit**

```bash
git add src/progress.ts src/progress.test.ts src/store.tsx src/screens/Screens.tsx
git commit -m "Seed each learner's league and keep the standings live

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
