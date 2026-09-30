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
