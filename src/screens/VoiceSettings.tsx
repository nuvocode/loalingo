// Settings > AI and voice: speech provider rows and their sheets (spec D).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../store";
import { getSetting, setSetting } from "../db";
import { loadKokoro, speak } from "../tts";
import { deepgramTranscribe, getDeepgramKey, resetSttReady, setDeepgramKey, sttProvider, type SttProvider } from "../stt";
import { wav16 } from "../wav";

const gap = (g: string) => ({ "--od-gap": g }) as React.CSSProperties;
const sheet = { ...gap("14px"), textAlign: "left" } as React.CSSProperties;

type TtsProvider = "system" | "kokoro";
const ttsProvider = async (): Promise<TtsProvider> => ((await getSetting("tts")) === "kokoro" ? "kokoro" : "system");

export function TtsRow() {
  const { t } = useTranslation();
  const { openSheet } = useApp();
  const [v, setV] = useState<TtsProvider>("system");
  useEffect(() => { ttsProvider().then(setV); }, []);
  return (
    <div className="card od-row" style={gap("12px")}>
      <span className="od-field od-fill"><b>{t("settings.tts")}</b><span className="muted small">{t(v === "kokoro" ? "settings.ttsKokoro" : "settings.ttsSystem")}</span></span>
      <button className="btn btn-ghost" onClick={() => openSheet(<TtsSheet initial={v} onChange={setV} />)}>{t("settings.change")}</button>
    </div>
  );
}

function TtsSheet({ initial, onChange }: { initial: TtsProvider; onChange: (v: TtsProvider) => void }) {
  const { t } = useTranslation();
  const { closeSheet } = useApp();
  const [v, setV] = useState(initial);
  const [pct, setPct] = useState<number | null>(null); // Kokoro download running
  const [err, setErr] = useState("");
  // Picking saves; Kokoro only once its model has loaded, otherwise the choice stays where it was.
  const pick = async (next: TtsProvider) => {
    if (pct !== null || next === v) return;
    setErr("");
    if (next === "kokoro") {
      setPct(0);
      try { await loadKokoro(setPct); }
      catch (e) { setErr(t("voice.loadFailed", { error: (e as Error).message })); setPct(null); return; }
      setPct(null);
    }
    await setSetting("tts", next);
    setV(next); onChange(next);
  };
  return (
    <div className="od-stack" style={sheet}>
      <h3 style={{ textAlign: "center" }}>{t("settings.tts")}</h3>
      <div className="seg" role="radiogroup" aria-label={t("settings.tts")}>
        {(["system", "kokoro"] as const).map((p) => (
          <button key={p} role="radio" aria-checked={v === p} className={`btn ${v === p ? "btn-blue" : "btn-ghost"}`} disabled={pct !== null} onClick={() => pick(p)}>
            {t(p === "kokoro" ? "settings.ttsKokoro" : "settings.ttsSystem")}
          </button>
        ))}
      </div>
      <p className="small">{t("voice.kokoroDesc")}</p>
      <p className="muted small">{t("voice.englishOnly")}</p>
      {pct !== null && (
        <div className="od-stack" style={gap("6px")} role="status">
          <div className="progress-track"><div className="progress-fill green" style={{ width: `${Math.round(pct * 100)}%` }} /></div>
          <span className="muted small">{t("voice.downloading", { pct: Math.round(pct * 100) })}</span>
        </div>
      )}
      {err && <p className="small" role="status" style={{ color: "var(--red)", overflowWrap: "anywhere" }}>{err}</p>}
      <button className="btn btn-blue btn-block" disabled={pct !== null} onClick={() => speak("Hello! Nice to meet you. How are you today?", "en-US", { gender: "f" })}>{t("voice.listen")}</button>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
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

function SttSheet({ initial, onChange }: { initial: SttProvider; onChange: (v: SttProvider) => void }) {
  const { t } = useTranslation();
  const { toast, closeSheet } = useApp();
  const [v, setV] = useState(initial);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const deepgram = v === "deepgram";
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
      if (deepgram) await setDeepgramKey(key.trim());
      await setSetting("stt", v);
      resetSttReady();
      onChange(v);
      toast(t("voice.saved"));
      closeSheet();
    } catch (e) { setStatus({ ok: false, msg: (e as Error).message }); setBusy(false); }
  };
  return (
    <div className="od-stack" style={sheet}>
      <h3 style={{ textAlign: "center" }}>{t("settings.stt")}</h3>
      <div className="seg" role="radiogroup" aria-label={t("settings.stt")}>
        {(["whisper", "deepgram"] as const).map((p) => (
          <button key={p} role="radio" aria-checked={v === p} className={`btn ${v === p ? "btn-blue" : "btn-ghost"}`} onClick={() => { setV(p); setStatus(null); }}>
            {t(p === "deepgram" ? "settings.sttDeepgram" : "settings.sttWhisper")}
          </button>
        ))}
      </div>
      <p className="small">{t(deepgram ? "voice.deepgramDesc" : "voice.whisperDesc")}</p>
      {deepgram && (
        <label className="od-field"><b>{t("voice.deepgramKey")}</b><span className="muted small">{t("ai.apiKeyDesc")}</span>
          <input className="input" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
      )}
      {status && <p className="small" role="status" style={{ color: status.ok ? "var(--green)" : "var(--red)", overflowWrap: "anywhere" }}>{status.msg}</p>}
      <div className="od-row" style={gap("10px")}>
        {deepgram && <button className="btn btn-ghost" disabled={busy || !key.trim()} onClick={test}>{t("ai.test")}</button>}
        <button className="btn btn-primary od-fill" disabled={busy || (deepgram && !key.trim())} onClick={save}>{t("ai.save")}</button>
      </div>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
    </div>
  );
}
