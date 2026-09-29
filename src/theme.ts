import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "sprigo.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch { return "system"; }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

// Apply before first render to avoid a light flash.
apply(read());

// ponytail: UI prefs live in localStorage; move to SQLite with the rest of the settings in Faz 1.
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  useEffect(() => {
    apply(pref);
    try { localStorage.setItem(KEY, pref); } catch {}
    if (pref !== "system") return;
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [pref]);
  return [pref, setPref] as const;
}
