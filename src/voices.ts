// Pure system-voice picking by gender (tested by src/voices.test.ts). Names are macOS voices.
type V = { name: string; lang: string };
const NAMES: Record<string, { f: string[]; m: string[] }> = {
  en: { f: ["Samantha", "Karen", "Moira", "Tessa", "Serena", "Victoria"], m: ["Daniel", "Alex", "Fred", "Oliver", "Tom", "Rishi"] },
  tr: { f: ["Yelda"], m: [] },
  de: { f: ["Anna", "Petra", "Helena"], m: ["Markus", "Yannick"] },
  es: { f: ["Monica", "Paulina", "Marisol"], m: ["Jorge", "Diego", "Juan"] },
  fr: { f: ["Amelie", "Audrey", "Marie"], m: ["Thomas", "Daniel", "Nicolas"] },
};

/** A voice matching `gender` when a known name is installed, else the language's first voice with a pitch shift. */
export function pickSystemVoice<T extends V>(voices: T[], lang: string, gender?: "f" | "m"): { voice?: T; pitch: number } {
  const code = lang.slice(0, 2).toLowerCase();
  const ofLang = voices.filter((v) => v.lang.slice(0, 2).toLowerCase() === code);
  if (!gender) return { voice: ofLang[0], pitch: 1 };
  const hit = ofLang.find((v) => NAMES[code]?.[gender].some((n) => v.name.startsWith(n)));
  if (hit) return { voice: hit, pitch: 1 };
  return { voice: ofLang[0], pitch: gender === "f" ? 1.15 : 0.85 };
}
