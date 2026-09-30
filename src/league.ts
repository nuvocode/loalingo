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
