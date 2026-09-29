// Weekly league against simulated rivals (local-first: no server). Pure module, tested by src/league.test.ts.

export type Rival = { n: string; c: string; rate: number }; // rate = XP per day
export type LeagueState = { week: string; tier: number; rivals: Rival[]; last?: "up" | "down" | "stay" };

export const TIERS = 10; // Seed … Forest (names: i18n league.tier0..9)
export const PROMOTE = 3, DEMOTE = 3;
const NAMES = ["Aylin", "Mert", "Zeynep", "Kaan", "Elif", "Deniz", "Baran", "Selin", "Umut", "Lena", "Jonas", "Sofia", "Mateo", "Yuki", "Aarav",
  "Chloe", "Liam", "Nora", "Omar", "Ines", "Marco", "Hana", "Leo", "Maya", "Ivan", "Sara", "Theo", "Amir", "Lucia", "Emil"];
const COLORS = ["#e91e63", "#4c6ef5", "#12b886", "#b07cf0", "#f4862a", "#00b8a9", "#8d6e63", "#5c6bc0", "#ef5350", "#f5b014"];

/** Monday of the week containing `day` (YYYY-MM-DD, local). */
export function weekOf(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d - ((new Date(y, m - 1, d).getDay() + 6) % 7));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
const weekStartMs = (week: string) => { const [y, m, d] = week.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
const DAY_MS = 86_400_000;

// Seeded PRNG (mulberry32) so a week's rivals are stable and tests are deterministic.
function rng(seed: string) {
  let a = [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 2654435761), 1779033703);
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function newLeague(week: string, tier: number, last?: LeagueState["last"]): LeagueState {
  const r = rng(`${week}:${tier}`);
  const names = [...NAMES].sort(() => r() - 0.5).slice(0, 9);
  const base = 15 + tier * 12; // higher tiers are busier
  return { week, tier, last, rivals: names.map((n, i) => ({ n, c: COLORS[i], rate: Math.round(base * (0.15 + r() * 1.7)) })) };
}

/** Rival XP at `now`: linear through the week, full at its end. */
export const rivalXp = (r: Rival, week: string, now: number) =>
  Math.floor(r.rate * Math.min(7, Math.max(0, (now - weekStartMs(week)) / DAY_MS)));

/** 1-based rank of the learner among rivals (ties go to the learner). */
export const rankOf = (l: LeagueState, myXp: number, now: number) => 1 + l.rivals.filter((r) => rivalXp(r, l.week, now) > myXp).length;

/** New week: settle the old one (top 3 up, bottom 3 down) and draw new rivals. Returns the same objects if nothing changes. */
export function rollLeague(l: LeagueState | null, weekXp: number, day: string): { league: LeagueState; weekXp: number } {
  const week = weekOf(day);
  if (!l) return { league: newLeague(week, 0), weekXp: 0 };
  if (l.week === week) return { league: l, weekXp };
  const rank = rankOf(l, weekXp, weekStartMs(l.week) + 7 * DAY_MS);
  const last = weekXp > 0 && rank <= PROMOTE ? "up" : rank > l.rivals.length + 1 - DEMOTE ? "down" : "stay";
  const tier = Math.min(TIERS - 1, Math.max(0, l.tier + (last === "up" ? 1 : last === "down" ? -1 : 0)));
  return { league: newLeague(week, tier, last), weekXp: 0 };
}

export const msLeft = (l: LeagueState, now: number) => weekStartMs(l.week) + 7 * DAY_MS - now;
