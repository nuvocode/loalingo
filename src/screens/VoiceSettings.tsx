// Settings > AI and voice: speech provider rows and their sheets (spec D).
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../store";
import { setSetting } from "../db";
import { loadKokoro, loadPiper, speak, ttsProvider, type TtsProvider } from "../tts";
import { Icon } from "../icons";
import { deepgramTranscribe, getDeepgramKey, listen, resetSttReady, setDeepgramKey, sttProvider, sttReady, type Listener, type SttProvider } from "../stt";
import { isNoise } from "../tutor";
import { wav16 } from "../wav";

const gap = (g: string) => ({ "--od-gap": g }) as React.CSSProperties;
const sheet = { ...gap("14px"), textAlign: "left" } as React.CSSProperties;

const TTS = [
  { p: "system", bars: 1, color: "var(--orange)" },
  { p: "piper", bars: 2, color: "var(--gold)" },
  { p: "kokoro", bars: 3, color: "var(--green)" },
] as const;
const ttsName = (p: TtsProvider) => `settings.tts${p[0].toUpperCase()}${p.slice(1)}`;
const HELLO: Record<string, string> = {
  en: "Hello! Nice to meet you. How are you today?", tr: "Merhaba! Tanıştığıma memnun oldum. Bugün nasılsın?",
  de: "Hallo! Schön, dich kennenzulernen. Wie geht es dir heute?", fr: "Bonjour ! Ravi de te rencontrer. Comment vas-tu aujourd'hui ?",
  es: "¡Hola! Encantado de conocerte. ¿Cómo estás hoy?",
};

/** Voice quality as signal bars: more bars, more natural. */
const Signal = ({ bars, color }: { bars: number; color: string }) => (
  <svg className="tts-signal" viewBox="0 0 20 20" aria-hidden="true" style={{ color }}>
    {[0, 1, 2].map((k) => <rect key={k} x={2 + k * 6} y={12 - k * 5} width="4" height={6 + k * 5} rx="1.5" fill="currentColor" opacity={k < bars ? 1 : 0.25} />)}
  </svg>
);

/** An info icon whose note shows on hover, focus or tap. */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="voice-info">
      <button className="icon-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="info" /></button>
      <span className={`voice-tip${open ? " open" : ""}`} role="tooltip">{children}</span>
    </span>
  );
}

export function TtsRow() {
  const { t } = useTranslation();
  const { openSheet } = useApp();
  const [v, setV] = useState<TtsProvider>("system");
  useEffect(() => { ttsProvider().then(setV); }, []);
  return (
    <div className="card od-row" style={gap("12px")}>
      <span className="od-field od-fill"><b>{t("settings.tts")}</b><span className="muted small">{t(ttsName(v))}</span></span>
      <button className="btn btn-ghost" onClick={() => openSheet(<TtsSheet initial={v} onChange={setV} />)}>{t("settings.change")}</button>
    </div>
  );
}

function TtsSheet({ initial, onChange }: { initial: TtsProvider; onChange: (v: TtsProvider) => void }) {
  const { t } = useTranslation();
  const { course, closeSheet } = useApp();
  const lang = course?.iso ?? "en";
  const [v, setV] = useState(initial);
  const [pct, setPct] = useState<number | null>(null); // a local voice downloading
  const [err, setErr] = useState("");
  // Picking saves; a local voice only once its model has loaded, otherwise the choice stays where it was.
  const pick = async (next: TtsProvider) => {
    if (pct !== null || next === v) return;
    setErr("");
    if (next !== "system") {
      setPct(0);
      try { await (next === "kokoro" ? loadKokoro(setPct) : loadPiper(lang, setPct)); }
      catch (e) { setErr(t("voice.loadFailed", { name: t(ttsName(next)), error: (e as Error).message })); setPct(null); return; }
      setPct(null);
    }
    await setSetting("tts", next);
    setV(next); onChange(next);
  };
  return (
    <div className="od-stack" style={sheet}>
      <h3 style={{ textAlign: "center" }}>{t("settings.tts")}</h3>
      <div className="od-stack" style={gap("8px")} role="radiogroup" aria-label={t("settings.tts")}>
        {TTS.map(({ p, bars, color }) => (
          <div key={p} className={`voice-option${v === p ? " on" : ""}`}>
            <button role="radio" aria-checked={v === p} disabled={pct !== null} onClick={() => pick(p)}>
              <Signal bars={bars} color={color} />
              <span className="od-field od-fill"><b>{t(ttsName(p))}</b><span className="muted small">{t(`voice.${p}Good`)}</span></span>
            </button>
            {p === "kokoro" && <InfoTip label={t("voice.about", { name: "Kokoro" })}>{t("voice.kokoroDesc")} {t("voice.englishOnly")}</InfoTip>}
          </div>
        ))}
      </div>
      {pct !== null && (
        <div className="od-stack" style={gap("6px")} role="status">
          <div className="progress-track"><div className="progress-fill green" style={{ width: `${Math.round(pct * 100)}%` }} /></div>
          <span className="muted small">{t("voice.downloading", { pct: Math.round(pct * 100) })}</span>
        </div>
      )}
      {err && <p className="small" role="status" style={{ color: "var(--red)", overflowWrap: "anywhere" }}>{err}</p>}
      <div className="od-stack sheet-actions" style={gap("8px")}>
        <button className="btn btn-blue btn-block" disabled={pct !== null} onClick={() => speak(HELLO[lang] ?? HELLO.en, lang, { gender: "f" })}>{t("voice.listen")}</button>
        <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
      </div>
    </div>
  );
}

export function SttRow() {
  const { t } = useTranslation();
  const { openSheet } = useApp();
  const [v, setV] = useState<SttProvider>("whisper");
  useEffect(() => { sttProvider().then(setV); }, []);
  return (
    <div className="card od-row" style={gap("12px")}>
      <span className="od-field od-fill"><b>{t("settings.stt")}</b><span className="muted small">{t(v === "deepgram" ? "settings.sttDeepgram" : "settings.sttWhisper")}</span></span>
      <button className="btn btn-ghost" onClick={() => openSheet(<SttSheet initial={v} onChange={setV} />)}>{t("settings.change")}</button>
    </div>
  );
}

const STT = [
  { p: "whisper", icon: "lock", color: "var(--green)" },
  { p: "deepgram", icon: "bolt", color: "var(--blue)" },
] as const;
const sttName = (p: SttProvider) => (p === "deepgram" ? "settings.sttDeepgram" : "settings.sttWhisper");

// Picking saves. Deepgram needs its key first: without one, picking it opens the key sheet; with one, the gear edits it.
function SttSheet({ initial, onChange }: { initial: SttProvider; onChange: (v: SttProvider) => void }) {
  const { t } = useTranslation();
  const { toast, openSheet, closeSheet } = useApp();
  const [v, setV] = useState(initial);
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => { getDeepgramKey().then((k) => setHasKey(!!k)).catch(() => {}); }, []);
  const back = () => openSheet(<SttSheet initial={v} onChange={onChange} />);
  const configure = () => openSheet(<DeepgramSheet onSaved={() => { onChange("deepgram"); openSheet(<SttSheet initial="deepgram" onChange={onChange} />); }} onCancel={back} />);
  const pick = async (next: SttProvider) => {
    if (next === v) return;
    if (next === "deepgram" && !hasKey) return configure();
    await setSetting("stt", next);
    resetSttReady();
    setV(next); onChange(next);
    toast(t("voice.saved"));
  };
  return (
    <div className="od-stack" style={sheet}>
      <h3 style={{ textAlign: "center" }}>{t("settings.stt")}</h3>
      <div className="od-stack" style={gap("8px")} role="radiogroup" aria-label={t("settings.stt")}>
        {STT.map(({ p, icon, color }) => (
          <div key={p} className={`voice-option${v === p ? " on" : ""}`}>
            <button role="radio" aria-checked={v === p} onClick={() => pick(p)}>
              <span className="voice-icon" style={{ color }}><Icon name={icon} /></span>
              <span className="od-field od-fill"><b>{t(sttName(p))}</b><span className="muted small">{t(`voice.${p}Good`)}</span></span>
            </button>
            {p === "deepgram" && hasKey && <button className="icon-btn" aria-label={t("voice.configure")} onClick={configure}><Icon name="gear" /></button>}
            <InfoTip label={t("voice.about", { name: p === "deepgram" ? "Deepgram" : "Whisper" })}>{t(p === "deepgram" ? "voice.deepgramDesc" : "voice.whisperDesc")}</InfoTip>
          </div>
        ))}
      </div>
      <div className="od-stack sheet-actions" style={gap("8px")}>
        <button className="btn btn-blue btn-block" onClick={() => openSheet(<SttTrySheet provider={v} onBack={back} />)}><Icon name="mic" /> {t("voice.try")}</button>
        <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
      </div>
    </div>
  );
}

/** Tries the saved recognizer: listens until the sheet closes and lists each utterance it heard. */
function SttTrySheet({ provider, onBack }: { provider: SttProvider; onBack: () => void }) {
  const { t } = useTranslation();
  const { course } = useApp();
  const lang = course?.iso ?? "en";
  const [heard, setHeard] = useState<string[]>([]);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [err, setErr] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mic: Listener | undefined, gone = false;
    (async () => {
      if (!(await sttReady())) throw new Error(t(provider === "deepgram" ? "voice.noKey" : "voice.whisperMissing"));
      const l = await listen(lang, {
        level: setLevel,
        speech: () => setSpeaking(true),
        utterance: (x) => { setSpeaking(false); if (!isNoise(x)) setHeard((h) => [...h, x]); },
        error: (e) => { setSpeaking(false); setErr(e.message); },
      });
      if (gone) l.stop(); else mic = l;
    })().catch((e) => setErr(e instanceof DOMException ? t("voice.micBlocked", { error: e.message }) : (e as Error).message)); // DOMException: getUserMedia
    return () => { gone = true; mic?.stop(); };
  }, [lang, provider]);
  useEffect(() => { list.current?.scrollTo(0, list.current.scrollHeight); }, [heard]);
  return (
    <div className="od-stack" style={sheet}>
      <h3 style={{ textAlign: "center" }}>{t("voice.tryTitle", { name: t(sttName(provider)) })}</h3>
      <div className="od-row" style={gap("10px")} role="status">
        <span className="voice-icon" style={{ color: err ? "var(--text-faint)" : "var(--red)" }}><Icon name="mic" /></span>
        <div className="progress-track od-fill"><div className="progress-fill green" style={{ width: `${Math.min(100, Math.round(level * 800))}%`, transition: "none" }} /></div>
      </div>
      <span className="muted small">{t(speaking ? "voice.hearing" : "voice.tryHint")}</span>
      <div ref={list} className="stt-heard">
        {heard.length ? heard.map((x, i) => <p key={i}>{x}</p>) : <p className="muted small">{t("voice.nothingYet")}</p>}
      </div>
      {err && <p className="small" role="status" style={{ color: "var(--red)", overflowWrap: "anywhere" }}>{err}</p>}
      <button className="btn btn-ghost btn-block" onClick={onBack}>{t("voice.back")}</button>
    </div>
  );
}

/** The Deepgram key: test it, then save it and switch speech recognition to Deepgram. */
function DeepgramSheet({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const { toast } = useApp();
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getDeepgramKey().then((k) => setKey(k ?? "")).catch(() => {}); }, []);

  const test = async () => {
    setBusy(true); setStatus(null);
    try {
      await deepgramTranscribe(wav16(new Float32Array(8000)), "en", key.trim()); // 0.5 s of silence
      setStatus({ ok: true, msg: t("voice.connected") });
    } catch (e) { setStatus({ ok: false, msg: `${t("ai.connectFailed")}: ${(e as Error).message}` }); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      await setDeepgramKey(key.trim());
      await setSetting("stt", "deepgram");
      resetSttReady();
      toast(t("voice.saved"));
      onSaved();
    } catch (e) { setStatus({ ok: false, msg: (e as Error).message }); setBusy(false); }
  };
  return (
    <div className="od-stack" style={sheet}>
      <h3 style={{ textAlign: "center" }}>{t("settings.sttDeepgram")}</h3>
      <p className="small">{t("voice.deepgramDesc")}</p>
      <label className="od-field"><b>{t("voice.deepgramKey")}</b><span className="muted small">{t("ai.apiKeyDesc")}</span>
        <input className="input" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      {status && <p className="small" role="status" style={{ color: status.ok ? "var(--green)" : "var(--red)", overflowWrap: "anywhere" }}>{status.msg}</p>}
      <div className="od-stack sheet-actions" style={gap("8px")}>
        <div className="od-row" style={gap("8px")}>
          <button className="btn btn-ghost" disabled={busy || !key.trim()} onClick={test}>{t("ai.test")}</button>
          <button className="btn btn-primary od-fill" disabled={busy || !key.trim()} onClick={save}>{t("ai.save")}</button>
        </div>
        <button className="btn btn-ghost btn-block" onClick={onCancel}>{t("sheet.cancel")}</button>
      </div>
    </div>
  );
}
