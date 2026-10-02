import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import { startRecording, sttReady, type Recording } from "./stt";
import { useApp } from "./store";

/** Why speaking is unavailable (i18n key), or null when it can be used: needs the bundled model and the Settings switch. */
export function useSpeakBlock() {
  const { s } = useApp();
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => { sttReady().then(setReady); }, []);
  return ready === false ? "stt.unavailable" : !s.speakOn ? "stt.off" : null;
}

/** Tap to talk, tap again to stop (design: round blue button + status line). Calls `onText` with the transcript. */
export function MicButton({ lang, onText, disabled, trigger = 0 }: { lang: string; onText: (text: string) => void; disabled?: boolean; trigger?: number }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const [err, setErr] = useState("");
  const rec = useRef<Recording | undefined>(undefined);

  const stop = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = undefined;
    setState("busy");
    try { onText(await r.stop()); }
    catch (e) { setErr(`${t("stt.failed")}: ${(e as Error).message ?? e}`); }
    finally { setState("idle"); }
  };
  const toggle = async () => {
    if (state === "rec") return stop();
    if (state !== "idle") return;
    setErr("");
    try { rec.current = await startRecording(lang, stop); setState("rec"); }
    catch { setErr(t("stt.noMic")); }
  };
  useEffect(() => () => { rec.current?.stop(false); }, []);
  // Keyboard: each bump of `trigger` presses the button.
  // Starts at the mount value so a leftover count from an earlier speak item does not press it on mount.
  const seen = useRef(trigger);
  useEffect(() => { if (trigger !== seen.current) { seen.current = trigger; if (!disabled) toggle(); } }, [trigger]);

  return (
    <div className="mic-wrap">
      <button className={`mic-btn ${state}`} onClick={toggle} disabled={disabled || state === "busy"} aria-pressed={state === "rec"}
        aria-label={t(state === "rec" ? "stt.stop" : "stt.record")}><Icon name="mic" /></button>
      <p className="muted small" role="status" style={{ textAlign: "center", color: err ? "var(--red)" : undefined }}>{err || t(`stt.${state}`)}</p>
    </div>
  );
}
