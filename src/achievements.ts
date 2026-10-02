// Achievements: tiered families computed from stats the app already keeps. Every metric only grows, so nothing is
// stored: an earned achievement stays earned. Titles live in i18n as profile.ach.<family>.title / .desc.
export type AchInput = { bestStreak: number; bestDayXp: number; xp: number; lessons: number; stories: number; legendary: number; words: number };

export const FAMILIES = [
  { id: "streak", icon: "roots", metric: "bestStreak", tiers: [3, 7, 30, 100, 365] },
  { id: "dayXp", icon: "bolt", metric: "bestDayXp", tiers: [50, 100, 250] },
  { id: "xp", icon: "star", metric: "xp", tiers: [100, 1000, 5000, 20000] },
  { id: "lessons", icon: "book", metric: "lessons", tiers: [1, 10, 50, 100] },
  { id: "stories", icon: "story", metric: "stories", tiers: [1, 5, 20] },
  { id: "legendary", icon: "spark", metric: "legendary", tiers: [1, 10] },
  { id: "words", icon: "captions", metric: "words", tiers: [50, 200, 500] },
] as const satisfies readonly { id: string; icon: string; metric: keyof AchInput; tiers: readonly number[] }[];

export type Family = (typeof FAMILIES)[number];
/** `tier` is 1-based (shown as I, II, …). */
export type Achievement = { id: string; family: Family["id"]; icon: Family["icon"]; tier: number; goal: number; cur: number; earned: boolean };

export function achievements(input: AchInput): Achievement[] {
  return FAMILIES.flatMap((f) => f.tiers.map((goal, i) => {
    const cur = input[f.metric];
    return { id: `${f.id}${i + 1}`, family: f.id, icon: f.icon, tier: i + 1, goal, cur, earned: cur >= goal };
  }));
}

/** The next tier of each family, closest to done first; ties go to the smaller goal. */
export function nearest(list: Achievement[], n = 3): Achievement[] {
  const next = FAMILIES.flatMap((f) => list.find((a) => a.family === f.id && !a.earned) ?? []);
  return next.sort((a, b) => b.cur / b.goal - a.cur / a.goal || a.goal - b.goal).slice(0, n);
}

export const roman = (n: number) => ["I", "II", "III", "IV", "V"][n - 1] ?? String(n);
