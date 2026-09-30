// Profile stats (DECISIONS E2, E6): XP, streak, daily goal/quests, optional hearts. Pure module, tested by src/progress.test.ts.
import { rollLeague, type LeagueState, type Who } from "./league.ts"; // .ts: node --test runs this file directly

export type Quest = { id: "q1" | "q2" | "q3"; icon: "bolt" | "book" | "dumbbell"; cur: number; goal: number };
export type Stats = {
  hearts: number; maxHearts: number; heartsOn: boolean; soundOn: boolean; reduceMotion: boolean;
  streak: number; bestStreak: number; streakFreeze: number;
  gems: number; todayXp: number; bestDayXp: number; chests: number;
  day: string; lastActive: string | null; // local dates, YYYY-MM-DD
  quests: Quest[];
  doubleXpUntil: number; legendTickets: number; madnessBest: number; // shop + Word Rush
  league: LeagueState | null; weekXp: number;
  reminderOn: boolean; reminderTime: string; remindedDay: string; // daily reminder, "HH:MM" local
  speakOn: boolean;
};

export const DAILY_XP_GOAL = 50;
const QUESTS: Quest[] = [
  { id: "q1", icon: "bolt", cur: 0, goal: DAILY_XP_GOAL },
  { id: "q2", icon: "book", cur: 0, goal: 3 },
  { id: "q3", icon: "dumbbell", cur: 0, goal: 1 },
];
export const NEW_STATS: Stats = {
  hearts: 5, maxHearts: 5, heartsOn: true, soundOn: true, reduceMotion: false, streak: 0, bestStreak: 0, streakFreeze: 0,
  gems: 0, todayXp: 0, bestDayXp: 0, chests: 0, day: "", lastActive: null, quests: QUESTS,
  doubleXpUntil: 0, legendTickets: 0, madnessBest: 0, league: null, weekXp: 0,
  reminderOn: false, reminderTime: "19:00", remindedDay: "", speakOn: true,
};

/** Daily reminder: once a day, after the chosen time, only if the learner has not practiced yet. */
export const reminderDue = (s: Stats, now = new Date()) =>
  s.reminderOn && s.lastActive !== today(now) && s.remindedDay !== today(now) &&
  `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` >= s.reminderTime;

/** Shop "Double XP": 15 minutes of ×2 on everything earned. */
export const DOUBLE_XP_MS = 15 * 60_000;
export const xpMult = (s: Stats, now = Date.now()) => (s.doubleXpUntil > now ? 2 : 1);

export const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); return today(new Date(y, m - 1, d + n)); };
const daysBetween = (a: string, b: string) => { let n = 0; while (addDays(a, n) < b) n++; return n; }; // ponytail: loop, gaps are days not years

/** Starts a new day: daily counters reset, hearts refill, a missed day breaks the streak unless freezes cover it. */
export function rollDay(s: Stats, day: string, who?: Who): Stats {
  const lg = rollLeague(s.league, s.weekXp, day, who); // a new day may also start a new league week (or redraw an old-format one)
  if (s.day === day) return lg.league === s.league ? s : { ...s, ...lg };
  let { streak, streakFreeze, lastActive } = s;
  if (lastActive && lastActive < day) {
    const missed = daysBetween(lastActive, day) - 1;
    if (missed > 0 && streakFreeze >= missed) { streakFreeze -= missed; lastActive = addDays(day, -1); }
    else if (missed > 0) streak = 0;
  }
  // ponytail: hearts refill once a day instead of a timer.
  return { ...s, ...lg, day, streak, streakFreeze, lastActive, todayXp: 0, hearts: s.maxHearts, quests: QUESTS.map((q) => ({ ...q })) };
}

/** A finished lesson or practice session: streak, daily XP and quests. Returns the new stats. */
export function recordSession(s0: Stats, r: { xp: number; gems: number; kind: "lesson" | "practice" }, day: string): Stats {
  const s = rollDay(s0, day);
  const streak = s.lastActive === day ? s.streak : s.lastActive === addDays(day, -1) ? s.streak + 1 : 1;
  const todayXp = s.todayXp + r.xp;
  const quests = s.quests.map((q) => ({
    ...q, cur: q.cur + (q.id === "q1" ? r.xp : q.id === "q2" ? +(r.kind === "lesson") : +(r.kind === "practice")),
  }));
  const allDone = (qs: Quest[]) => qs.every((q) => q.cur >= q.goal);
  return {
    ...s, streak, bestStreak: Math.max(s.bestStreak, streak), lastActive: day,
    todayXp, bestDayXp: Math.max(s.bestDayXp, todayXp), gems: s.gems + r.gems, quests, weekXp: s.weekXp + r.xp,
    chests: s.chests + +(allDone(quests) && !allDone(s.quests)), // all daily quests → one reward chest
  };
}
