import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Adding a UI language = dropping `src/locales/<iso>.json` next to en.json. No code change needed.
const files = import.meta.glob<{ default: Record<string, any> }>("./locales/*.json", { eager: true });

const resources: Record<string, { translation: Record<string, any> }> = {};
export const languages: { code: string; name: string }[] = [];
for (const [path, mod] of Object.entries(files)) {
  const code = path.match(/\/(\w[\w-]*)\.json$/)![1];
  resources[code] = { translation: mod.default };
  languages.push({ code, name: mod.default._meta?.name ?? code });
}
languages.sort((a, b) => a.name.localeCompare(b.name));

const LANG_KEY = "loalingo.uiLang";
function stored() {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
}

i18n.use(initReactI18next).init({
  resources,
  lng: stored() ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// `lang` drives CSS text-transform casing (Turkish İ/ı in the uppercase nav labels).
const syncLang = (lng: string) => { document.documentElement.lang = lng; };
syncLang(i18n.language);
i18n.on("languageChanged", (lng) => {
  syncLang(lng);
  try { localStorage.setItem(LANG_KEY, lng); } catch {}
});

export default i18n;
