// Garden note: a short AI-written message under the garden cards, kept for NOTE_DAYS. Pure, tested by src/gardenNote.test.ts.
import { addDays } from "./progress.ts";

export const NOTE_DAYS = 3;
export const NOTE_KEY = "garden:note"; // content_cache key; the ":" keeps it out of cachedLessonItems
const NOTE_MAX = 280;

/** What the note reacts to; a change of mood (roots dried, a fresh start) writes a new one early. */
export type Mood = "new" | "ok" | "dry";
export const moodOf = (streak: number, dry: boolean): Mood => (dry ? "dry" : streak ? "ok" : "new");

export type GardenNote = { text: string; until: string; mood: Mood; lang: string };
export type NoteInfo = {
  name: string; course: string; level: string; mood: Mood;
  roots: number; bestRoots: number; xp: number; lessons: number; stage: string; fruit: number; greenhouses: number;
};

export const noteFor = (text: string, day: string, mood: Mood, lang: string): GardenNote => ({ text, until: addDays(day, NOTE_DAYS), mood, lang });
export const noteFresh = (n: GardenNote | null, day: string, mood: Mood, lang: string) => !!n && day < n.until && n.mood === mood && n.lang === lang;

export const noteSystem = (lang: string) => [
  "You are Sprigo, a warm language-learning companion whose app is a garden: every lesson waters a tree.",
  `Write in ${lang}. Use garden words: consecutive study days are "roots", lives are "drops", a streak freeze is a "greenhouse", finished level tests are "fruit".`,
  "Never say streak, hearts, chest or freeze. No markdown, no quotes, no hashtags; at most one emoji.",
].join("\n");

const MOOD_HINT: Record<Mood, string> = {
  new: "They have no roots yet: invite them to plant the first one today.",
  ok: "Their roots are growing: celebrate it concretely and point at the next step.",
  dry: "They missed yesterday and the soil is dry: be kind, no guilt, one small lesson today brings it back.",
};

export function notePrompt(i: NoteInfo, about: string[]) {
  return [
    `Learner: ${i.name}, learning ${i.course} at ${i.level}.`,
    `Roots: ${i.roots} days (best ${i.bestRoots}). Total XP: ${i.xp}. Lessons finished: ${i.lessons}. Tree stage: ${i.stage}. Fruit: ${i.fruit}. Greenhouses: ${i.greenhouses}.`,
    about.length ? `Things they told Sprigo: ${about.join("; ")}` : "",
    MOOD_HINT[i.mood],
    `Write one personal note of 1–2 short sentences (under ${NOTE_MAX} characters) that still reads well for the next ${NOTE_DAYS} days, so no "today"-only details.`,
  ].filter(Boolean).join("\n");
}

/** Strips wrapping quotes and markdown a model may add anyway; "" means unusable. */
export function cleanNote(raw: string) {
  const t = raw.replace(/[*_#`]/g, "").trim().replace(/^["'“«]+|["'”»]+$/g, "").trim();
  return t.length > NOTE_MAX * 1.5 ? "" : t;
}
