import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../store";
import { languages } from "../i18n";
import type { ThemePref } from "../theme";
import { PROVIDERS, RECOMMENDED_OLLAMA, detectLocal, getKey, listModels, pullOllama, setKey, type AiConfig, type ProviderId } from "../ai";
import { isTauri } from "../db";
import { CourseFlag, CourseSheet, ProfileForm, useLangName } from "./Profiles";
import { notifyAllowed } from "../notify";
import { findUpdate, UpdateSheet } from "../Update";
import { DataSection } from "./DataSettings";
import { SttRow, TtsRow } from "./VoiceSettings";

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

const OLLAMA_DOWNLOAD = "https://ollama.com/download";
const openLink = async (url: string) => isTauri ? (await import("@tauri-apps/plugin-opener")).openUrl(url) : window.open(url, "_blank");

/** First run: finds Ollama / LM Studio on this Mac, or helps install Ollama and pull a model. */
function LocalSetup({ onPick }: { onPick: (p: ProviderId, models: string[]) => void }) {
  const { t } = useTranslation();
  const [found, setFound] = useState<Awaited<ReturnType<typeof detectLocal>> | null>(null);
  const [pull, setPull] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const scan = async () => {
    setFound(null); setErr("");
    const f = await detectLocal();
    setFound(f);
    const p = f.ollama?.length ? "ollama" : f.lmstudio?.length ? "lmstudio" : null;
    if (p) onPick(p, f[p]!);
  };
  useEffect(() => { scan(); }, []);
  const download = async () => {
    setPull(0); setErr("");
    try { await pullOllama(PROVIDERS.ollama.baseURL, RECOMMENDED_OLLAMA.model, setPull); await scan(); }
    catch (e) { setErr((e as Error).message); }
    finally { setPull(null); }
  };

  if (!found) return <p className="muted small" role="status">{t("ai.scanning")}</p>;
  const name = found.ollama?.length ? "Ollama" : found.lmstudio?.length ? "LM Studio" : null;
  if (name) return <p className="small" role="status" style={{ color: "var(--green)" }}>{t("ai.foundLocal", { name })}</p>;
  return (
    <div className="card od-stack" style={gap("10px")} role="status">
      {found.ollama ? <>
        <b>{t("ai.noModels")}</b>
        <span className="muted small">{t("ai.pullDesc", RECOMMENDED_OLLAMA)}</span>
        {pull === null
          ? <button className="btn btn-blue" onClick={download}>{t("ai.pull", RECOMMENDED_OLLAMA)}</button>
          : <div className="od-stack" style={gap("6px")}>
              <div className="progress-track"><div className="progress-fill green" style={{ width: `${Math.round(pull * 100)}%` }} /></div>
              <span className="muted small">{t("ai.pulling", { pct: Math.round(pull * 100) })}</span>
            </div>}
      </> : <>
        <b>{t("ai.noLocal")}</b>
        <span className="muted small">{t("ai.noLocalDesc")}</span>
        <button className="btn btn-blue" onClick={() => openLink(OLLAMA_DOWNLOAD)}>{t("ai.getOllama")}</button>
        <button className="btn btn-ghost" onClick={scan}>{t("ai.rescan")}</button>
      </>}
      {err && <p className="small" style={{ color: "var(--red)", overflowWrap: "anywhere" }}>{err}</p>}
    </div>
  );
}

/** DECISIONS C1/C6: device-wide provider, key in the OS keychain. */
export function AiSheet() {
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
      {!ai && <LocalSetup onPick={(p, list) => {
        setProvider(p); setBaseURL(PROVIDERS[p].baseURL); setModels(list);
        setModel(list.includes(RECOMMENDED_OLLAMA.model) ? RECOMMENDED_OLLAMA.model : list[0]);
      }} />}
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

function VersionRow() {
  const { t } = useTranslation();
  const { openSheet, toast } = useApp();
  const [version, setVersion] = useState("dev");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (isTauri) import("@tauri-apps/api/app").then((a) => a.getVersion()).then(setVersion); }, []);
  const check = async () => {
    setBusy(true);
    const u = await findUpdate();
    setBusy(false);
    u ? openSheet(<UpdateSheet update={u} />) : toast(t("update.none"));
  };
  return (
    <div className="card od-row" style={gap("12px")}>
      <span className="od-field od-fill"><b>{t("update.version", { version })}</b><span className="muted small">{t("update.desc")}</span></span>
      <button className="btn btn-ghost" disabled={busy} onClick={check}>{t("update.check")}</button>
    </div>
  );
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, course, enrollment, profile, updateProfile, openSheet, closeSheet, logout, ai, s, setS, toast } = useApp();
  const langName = useLangName();
  const themes: ThemePref[] = ["system", "light", "dark"];
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const [advanced, setAdvanced] = useState(!ai); // AI not set up yet → open, so its warning stays visible
  return (
    <>
      <h1 className="section-title" style={{ marginTop: 24 }}>{t("settings.title")}</h1>

      <h2 className="section-title">{t("settings.course")}</h2>
      <div className="card od-row">
        <span style={{ fontSize: 28 }}>{course && <CourseFlag c={course} />}</span>
        <span className="od-field od-fill"><b>{course ? langName(course.iso) : "—"}</b>
          <span className="muted small">{t("settings.courseDesc", { level: enrollment?.level, native: langName(profile!.native_lang) })}</span></span>
        <button className="btn btn-ghost" onClick={() => openSheet(<CourseSheet />)}>{t("settings.change")}</button>
      </div>

      <h2 className="section-title">{t("settings.general")}</h2>
      <div className="od-stack" style={gap("12px")}>
        <ToggleRow k="hearts" initial={s.heartsOn} onChange={(heartsOn) => setS((s) => ({ ...s, heartsOn }))} />
        <ToggleRow k="sound" initial={s.soundOn} onChange={(soundOn) => setS((s) => ({ ...s, soundOn }))} />
        <ToggleRow k="speaking" initial={s.speakOn} onChange={(speakOn) => setS((s) => ({ ...s, speakOn }))} />
        <ToggleRow k="reminder" initial={s.reminderOn} onChange={async (reminderOn) => {
          setS((s) => ({ ...s, reminderOn }));
          if (reminderOn && !(await notifyAllowed())) toast(t("settings.reminderBlocked"));
        }} />
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

      <button className="btn btn-ghost btn-block" style={{ marginTop: 24 }} aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)}>
        {t("settings.advanced")} <span aria-hidden="true">{advanced ? "▴" : "▾"}</span>
      </button>
      {advanced && (
        <>
          <h2 className="section-title">{t("settings.aiVoice")}</h2>
          <div className="od-stack" style={gap("12px")}>
            <div className="card od-row" style={gap("12px")}>
              <span className="od-field od-fill"><b>{t("ai.title")}</b>
                {ai ? <span className="muted small" style={{ overflowWrap: "anywhere" }}>{PROVIDERS[ai.provider].label} · {ai.model}</span>
                  : <span className="small" style={{ color: "var(--orange)", fontWeight: 800 }}>{t("ai.notSet")}</span>}</span>
              <button className={`btn ${ai ? "btn-ghost" : "btn-primary"}`} onClick={() => openSheet(<AiSheet />)}>{t(ai ? "settings.change" : "ai.setUp")}</button>
            </div>
            <TtsRow />
            <SttRow />
          </div>

          <DataSection />
        </>
      )}

      <h2 className="section-title">{t("update.section")}</h2>
      <VersionRow />

      <h2 className="section-title">{t("settings.account")}</h2>
      <div className="od-stack" style={gap("12px")}>
        <button className="btn btn-ghost btn-block" onClick={() => openSheet(<><h3 style={{ marginBottom: 14 }}>{t("settings.editProfile")}</h3><ProfileForm initial={profile!} onDone={closeSheet} /></>)}>{t("settings.editProfile")}</button>
        <button className="btn btn-ghost btn-block" onClick={logout}>{t("settings.logout")}</button>
      </div>
    </>
  );
}
