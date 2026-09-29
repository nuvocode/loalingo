import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../store";
import { languages } from "../i18n";
import type { ThemePref } from "../theme";
import { PROVIDERS, getKey, listModels, setKey, type AiConfig, type ProviderId } from "../ai";
import { CourseFlag, CourseSheet, ProfileForm, useLangName } from "./Profiles";
import { notifyAllowed } from "../notify";

const gap = (g: string) => ({ "--od-gap": g }) as React.CSSProperties;

function ToggleRow({ k, initial, onChange }: { k: string; initial: boolean; onChange?: (on: boolean) => void }) {
  const { t } = useTranslation();
  // ponytail: rows without onChange are visual only, as in the design; wired when each feature lands.
  const [on, setOnState] = useState(initial);
  const setOn = (v: boolean) => { setOnState(v); onChange?.(v); };
  return (
    <div className="card od-row" style={gap("12px")}>
      <span className="od-field od-fill"><b>{t(`settings.${k}`)}</b><span className="muted small">{t(`settings.${k}Desc`)}</span></span>
      <button className={`btn ${on ? "btn-primary" : "btn-ghost"}`} style={{ minWidth: 84 }} aria-pressed={on} onClick={() => setOn(!on)}>
        {t(on ? "settings.on" : "settings.off")}
      </button>
    </div>
  );
}

/** DECISIONS C1/C6: device-wide provider, key in the OS keychain. */
function AiSheet() {
  const { t } = useTranslation();
  const { ai, setAi, toast, closeSheet } = useApp();
  const [provider, setProvider] = useState<ProviderId>(ai?.provider ?? "ollama");
  const [baseURL, setBaseURL] = useState(ai?.baseURL ?? PROVIDERS[provider].baseURL);
  const [model, setModel] = useState(ai?.model ?? "");
  const [key, setKeyState] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const needsKey = PROVIDERS[provider].needsKey;

  useEffect(() => { getKey(provider).then((k) => setKeyState(k ?? "")); setModels([]); setStatus(null); }, [provider]);

  const pick = (p: ProviderId) => {
    setProvider(p);
    setBaseURL(ai?.provider === p ? ai.baseURL : PROVIDERS[p].baseURL);
    setModel(ai?.provider === p ? ai.model : "");
  };
  const cfg: AiConfig = { provider, baseURL: baseURL.trim(), model: model.trim() };

  const test = async () => {
    setBusy(true); setStatus(null);
    try {
      const list = await listModels(cfg, key || null);
      setModels(list);
      if (!model && list[0]) setModel(list[0]);
      setStatus({ ok: true, msg: t("ai.connected", { count: list.length }) });
    } catch (e) { setStatus({ ok: false, msg: `${t("ai.connectFailed")}: ${(e as Error).message}` }); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      if (needsKey) await setKey(provider, key.trim() || null);
      await setAi(cfg);
      toast(t("ai.saved"));
      closeSheet();
    } catch (e) { setStatus({ ok: false, msg: (e as Error).message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="od-stack" style={{ ...gap("14px"), textAlign: "left" }}>
      <h3 style={{ textAlign: "center" }}>{t("ai.title")}</h3>
      <div className="seg" role="radiogroup" aria-label={t("ai.provider")}>
        {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
          <button key={p} role="radio" aria-checked={provider === p} className={`btn ${provider === p ? "btn-blue" : "btn-ghost"}`} onClick={() => pick(p)}>{PROVIDERS[p].label}</button>
        ))}
      </div>
      <label className="od-field"><b>{t("ai.baseURL")}</b>
        <input className="input" value={baseURL} spellCheck={false} onChange={(e) => setBaseURL(e.target.value)} placeholder={PROVIDERS[provider].baseURL} />
      </label>
      {needsKey && (
        <label className="od-field"><b>{t("ai.apiKey")}</b><span className="muted small">{t("ai.apiKeyDesc")}</span>
          <input className="input" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKeyState(e.target.value)} />
        </label>
      )}
      <label className="od-field"><b>{t("ai.model")}</b><span className="muted small">{t("ai.modelDesc")}</span>
        <input className="input" list="ai-models" value={model} spellCheck={false} onChange={(e) => setModel(e.target.value)} />
        <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
      </label>
      {status && <p className="small" role="status" style={{ color: status.ok ? "var(--green)" : "var(--red)", overflowWrap: "anywhere" }}>{status.msg}</p>}
      <div className="od-row" style={gap("10px")}>
        <button className="btn btn-ghost" disabled={busy || (needsKey && !key.trim())} onClick={test}>{t("ai.test")}</button>
        <button className="btn btn-primary od-fill" disabled={busy || !cfg.model || (needsKey && !key.trim())} onClick={save}>{t("ai.save")}</button>
      </div>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
    </div>
  );
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, course, enrollment, profile, updateProfile, openSheet, closeSheet, logout, ai, s, setS, toast } = useApp();
  const langName = useLangName();
  const themes: ThemePref[] = ["system", "light", "dark"];
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return (
    <>
      <h1 className="section-title" style={{ marginTop: 24 }}>{t("settings.title")}</h1>
      <div className="od-stack" style={{ ...gap("12px"), marginTop: 14 }}>
        <div className="card od-row" style={gap("12px")}>
          <span className="od-field od-fill"><b>{t("ai.title")}</b>
            {ai ? <span className="muted small" style={{ overflowWrap: "anywhere" }}>{PROVIDERS[ai.provider].label} · {ai.model}</span>
              : <span className="small" style={{ color: "var(--orange)", fontWeight: 800 }}>{t("ai.notSet")}</span>}</span>
          <button className={`btn ${ai ? "btn-ghost" : "btn-primary"}`} onClick={() => openSheet(<AiSheet />)}>{t(ai ? "settings.change" : "ai.setUp")}</button>
        </div>
        <ToggleRow k="hearts" initial={s.heartsOn} onChange={(heartsOn) => setS((s) => ({ ...s, heartsOn }))} />
        <ToggleRow k="sound" initial={s.soundOn} onChange={(soundOn) => setS((s) => ({ ...s, soundOn }))} />
        <ToggleRow k="speaking" initial={s.speakOn} onChange={(speakOn) => setS((s) => ({ ...s, speakOn }))} />
        <ToggleRow k="reminder" initial={s.reminderOn} onChange={async (reminderOn) => {
          setS((s) => ({ ...s, reminderOn }));
          if (reminderOn && !(await notifyAllowed())) toast(t("settings.reminderBlocked"));
        }} />
        {s.reminderOn && (
          <label className="card od-row" style={gap("12px")}>
            <span className="od-field od-fill"><b>{t("settings.reminderTime")}</b><span className="muted small">{t("settings.reminderTimeDesc")}</span></span>
            <input className="input" type="time" style={{ width: 130 }} value={s.reminderTime}
              onChange={(e) => e.target.value && setS((s) => ({ ...s, reminderTime: e.target.value, remindedDay: "" }))} />
          </label>
        )}
        <ToggleRow k="reduceMotion" initial={s.reduceMotion} onChange={(reduceMotion) => setS((s) => ({ ...s, reduceMotion }))} />
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
