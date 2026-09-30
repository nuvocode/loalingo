// Nudges (Settings → Reminders): up to 3 notifications a day inviting the learner to study, quiet once they have. Pure, tested by src/nudge.test.ts.
import { rng } from "./league.ts";
import { today, type Stats } from "./progress.ts";

export const SLOTS = [600, 900, 1170]; // 10:00, 15:00, 19:30, in minutes after midnight
export const NUDGES = { general: 6, streak: 4, evening: 2 } as const; // message counts per group in locales `nudges.*`
export type NudgeGroup = keyof typeof NUDGES;

/** Today's nudge times (ms), each shifted up to ±30 min; the same all day. */
export function slotTimes(day: string) {
  const r = rng(`nudge:${day}`), [y, m, d] = day.split("-").map(Number);
  return SLOTS.map((min) => new Date(y, m - 1, d, 0, min + Math.round(r() * 60 - 30)).getTime());
}

/** The slot to send now, or null: reminders off, practiced today, nothing due yet, or already sent. Missed slots don't pile up: only the latest is sent. */
export function nudgeDue(s: Stats, now = new Date()): number | null {
  const day = today(now);
  if (!s.reminderOn || s.lastActive === day) return null;
  const due = slotTimes(day).filter((at) => at <= now.getTime()).length - 1;
  if (due < 0) return null;
  const [sentDay, sent] = s.reminded.split(":");
  return sentDay === day && Number(sent) >= due ? null : due;
}

/** Which message a slot shows: evening "last call" when there are roots to keep, else roots or general; a day's slots never repeat one. */
export function nudgeMessage(slot: number, streak: number, day: string): { group: NudgeGroup; i: number } {
  const base = Math.floor(rng(`msg:${day}`)() * 60);
  const group: NudgeGroup = streak > 0 && slot === 2 ? "evening" : streak > 0 && rng(`msg:${day}:${slot}`)() < 0.5 ? "streak" : "general";
  return { group, i: (base + slot) % NUDGES[group] };
}
