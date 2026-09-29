// ponytail: sample data from docs/design/index.html. Exercises are replaced by AI generation (Faz 2). Titles are i18n keys (mock.*) so the preview follows the UI language;
// exercise content stays as-is (TR speaker learning EN) because it is course content, not UI copy.
import type { IconName } from "./icons";

export const LEAGUE = [
  { n: "Aylin", xp: 482, c: "#e91e63" }, { n: "Mert", xp: 431, c: "#1cb0f6" }, { n: "Zeynep", xp: 395, c: "#58cc02" },
  { n: "", xp: 0, c: "#ffc800", me: true }, { n: "Kaan", xp: 297, c: "#ce82ff" }, { n: "Elif", xp: 260, c: "#ff9600" },
  { n: "Deniz", xp: 214, c: "#00b8a9" }, { n: "Baran", xp: 180, c: "#8d6e63" }, { n: "Selin", xp: 142, c: "#5c6bc0" }, { n: "Umut", xp: 98, c: "#ef5350" },
];

export const WORDS = [
  { w: "hello", t: "merhaba", s: 4 }, { w: "goodbye", t: "güle güle", s: 3 }, { w: "please", t: "lütfen", s: 4 },
  { w: "thank you", t: "teşekkürler", s: 5 }, { w: "yes", t: "evet", s: 5 }, { w: "no", t: "hayır", s: 5 },
  { w: "water", t: "su", s: 2 }, { w: "bread", t: "ekmek", s: 1 }, { w: "friend", t: "arkadaş", s: 2 },
  { w: "family", t: "aile", s: 1 }, { w: "morning", t: "sabah", s: 3 }, { w: "night", t: "gece", s: 2 },
];

export const MISTAKES = [
  { q: "'Teşekkür ederim' hangisidir?", yours: "Thank", correct: "Thank you" },
  { q: "'Günaydın' nasıl denir?", yours: "Good night", correct: "Good morning" },
];

export const FRIENDS = [
  { n: "Zeynep", streak: 34, c: "#58cc02" }, { n: "Mert", streak: 21, c: "#1cb0f6" }, { n: "Elif", streak: 9, c: "#ff9600" },
];

export const NOTIFS: { icon: IconName; key: string }[] = [
  { icon: "flame", key: "n1" }, { icon: "trophy", key: "n2" }, { icon: "users", key: "n3" },
];

export type Exercise =
  | { type: "choice"; q: string; opts: string[]; a: number; listen?: string }
  | { type: "bank"; q: string; answer: string[]; bank: string[] };

export const EXERCISES: Record<string, Exercise[]> = {
  "1-3": [
    { type: "choice", q: "'Lütfen' İngilizce nasıl denir?", opts: ["Please", "Thanks", "Sorry", "Hello"], a: 0 },
    { type: "bank", q: "Cümleyi çevir: 'Teşekkür ederim'", answer: ["Thank", "you"], bank: ["Thank", "very", "you", "are", "much"] },
    { type: "choice", q: "'Goodbye' ne demek?", opts: ["Güle güle", "Günaydın", "İyi geceler", "Merhaba"], a: 0 },
    { type: "bank", q: "Cümleyi kur: 'Good morning'", answer: ["Good", "morning"], bank: ["night", "Good", "morning", "evening"] },
    { type: "choice", q: "Hangisi kibar bir istektir?", opts: ["Yes, please", "No way", "Go away", "Stop it"], a: 0 },
  ],
  "practice-mistakes": MISTAKES.map((m) => ({ type: "choice", q: m.q, opts: [m.correct, m.yours, "Welcome", "Excuse"], a: 0 })),
  "practice-listen": [
    { type: "choice", listen: "Hello", q: "Duyduğun kelime hangisi?", opts: ["Hello", "Yellow", "Below", "Follow"], a: 0 },
    { type: "choice", listen: "Water", q: "Duyduğun kelime hangisi?", opts: ["Water", "Later", "Letter", "Waiter"], a: 0 },
    { type: "choice", listen: "Friend", q: "Duyduğun kelime hangisi?", opts: ["Friend", "Field", "Find", "Fine"], a: 0 },
    { type: "choice", listen: "Bread", q: "Duyduğun kelime hangisi?", opts: ["Bread", "Break", "Great", "Brand"], a: 0 },
  ],
};
