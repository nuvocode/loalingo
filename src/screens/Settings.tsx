import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../store";
import { languages } from "../i18n";
import type { ThemePref } from "../theme";
import { CourseFlag, CourseSheet, ProfileForm, useLangName } from "./Profiles";

const gap = (g: string) => ({ "--od-gap": g }) as React.CSSProperties;

function ToggleRow({ k, initial }: { k: string; initial: boolean }) {
  const { t } = useTranslation();
  // ponytail: visual toggles only, as in the design; wired to real settings when each feature lands.
  const [on, setOn] = useState(initial);
  return (
    <div className="card od-row" style={gap("12px")}>
      <span className="od-field od-fill"><b>{t(`settings.${k}`)}</b><span className="muted small">{t(`settings.${k}Desc`)}</span></span>
      <button className={`btn ${on ? "btn-primary" : "btn-ghost"}`} style={{ minWidth: 84 }} aria-pressed={on} onClick={() => setOn(!on)}>
        {t(on ? "settings.on" : "settings.off")}
      </button>
    </div>
  );
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, course, enrollment, profile, updateProfile, openSheet, closeSheet, logout } = useApp();
  const langName = useLangName();
  const themes: ThemePref[] = ["system", "light", "dark"];
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return (
    <>
      <h1 className="section-title" style={{ marginTop: 24 }}>{t("settings.title")}</h1>
      <div className="od-stack" style={{ ...gap("12px"), marginTop: 14 }}>
        <ToggleRow k="sound" initial />
        <ToggleRow k="speaking" initial />
        <ToggleRow k="reminder" initial />
        <ToggleRow k="reduceMotion" initial={false} />
      </div>

      <h2 className="section-title">{t("settings.appearance")}</h2>
      <div className="od-stack" style={gap("12px")}>
        <div className="card od-row" style={{ ...gap("12px"), flexWrap: "wrap" }}>
          <span className="od-field od-fill"><b>{t("settings.theme")}</b><span className="muted small">{t("settings.themeDesc")}</span></span>
          <div className="seg" role="radiogroup" aria-label={t("settings.theme")}>
            {themes.map((th) => (
              <button key={th} role="radio" aria-checked={theme === th} className={`btn ${theme === th ? "btn-blue" : "btn-ghost"}`} onClick={() => setTheme(th)}>
                {t(`settings.theme${cap(th)}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="card od-row" style={gap("12px")}>
          <label className="od-field od-fill" htmlFor="ui-lang"><b>{t("settings.language")}</b><span className="muted small">{t("settings.languageDesc")}</span></label>
          <select id="ui-lang" className="select" value={i18n.resolvedLanguage} onChange={(e) => { i18n.changeLanguage(e.target.value); updateProfile({ ui_lang: e.target.value }); }}>
            {languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>
      </div>

      <h2 className="section-title">{t("settings.course")}</h2>
      <div className="card od-row">
        <span style={{ fontSize: 28 }}>{course && <CourseFlag c={course} />}</span>
        <span className="od-field od-fill"><b>{course ? langName(course.iso) : "—"}</b>
          <span className="muted small">{t("settings.courseDesc", { level: enrollment?.level, native: langName(profile!.native_lang) })}</span></span>
        <button className="btn btn-ghost" onClick={() => openSheet(<CourseSheet />)}>{t("settings.change")}</button>
      </div>

      <h2 className="section-title">{t("settings.account")}</h2>
      <div className="od-stack" style={gap("12px")}>
        <button className="btn btn-ghost btn-block" onClick={() => openSheet(<><h3 style={{ marginBottom: 14 }}>{t("settings.editProfile")}</h3><ProfileForm initial={profile!} onDone={closeSheet} /></>)}>{t("settings.editProfile")}</button>
        <button className="btn btn-danger btn-block" onClick={logout}>{t("settings.logout")}</button>
      </div>
    </>
  );
}
