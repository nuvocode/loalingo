// Tutor video call (spec T): the tutor on the left, the learner's camera or profile on the right, a thin control bar below.
// Each event (speech, a typed message, silence, mic/cam toggles) gets one model reply; the rules live in src/tutor.ts.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import { useApp } from "./store";
import { sfx } from "./Lesson";
import { speak, stopSpeaking } from "./tts";
import { listen, sttReady, type Listener } from "./stt";
import { Face, type FaceState } from "./face/Face";
import { Avatar } from "./screens/Profiles";
import { CHARACTERS, type CharacterId } from "./characters";
import { tutorTurn } from "./lessons";
import { NOTES_MAX, currentUnit, isNoise, mergeInput, silenceDelay, type TutorEvent, type TutorMsg, type TutorReply } from "./tutor";
import { recordSession, today, xpMult } from "./progress";
import { Done, Failed, Shell, useQuit, usePrewarm, type Result } from "./Talk";

const BONUS_MS = 5 * 60_000; // a call this long earns +20 XP

/** Mutable call state read by async callbacks (timers, the mic), so it lives in a ref, not in React state. */
type Call = {
  hist: TutorMsg[]; notes: string; last: TutorReply | null; queue: TutorEvent[]; fixes: string[];
  nudges: number; // silence events since the learner last said something
  running: boolean; over: boolean; opened: boolean; micOn: boolean; failed: TutorEvent | null;
};

export function TutorCall({ who }: { who: CharacterId }) {
  const { t } = useTranslation();
  const { course, enrollment, profile, done, s, setS, gainXp, toast } = useApp();
  const ch = CHARACTERS[who];
  const lang = course?.iso ?? "en";
  const levelDef = course && enrollment ? course.levels[enrollment.level] : undefined;
  const unit = levelDef ? currentUnit(levelDef, done) : undefined;
  usePrewarm(lang);

  const c = useRef<Call>({ hist: [], notes: "", last: null, queue: [], fixes: [], nudges: 0, running: false, over: false, opened: false, micOn: false, failed: null }).current;
  const mic = useRef<Listener | null>(null);
  const cam = useRef<MediaStream | null>(null);
  const ring = useRef<HTMLElement>(null);
  const silence = useRef<ReturnType<typeof setTimeout>>(undefined);
  const started = useRef(Date.now());

  const [msgs, setMsgs] = useState<TutorMsg[]>([]);
  const [last, setLast] = useState<TutorReply | null>(null);
  const [thinking, setThinking] = useState(false);
  const [talking, setTalking] = useState(false);
  const [err, setErr] = useState("");
  const [showTr, setShowTr] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micBlock, setMicBlock] = useState<string | null>(null); // i18n key: why the mic can't be used
  const [camOn, setCamOn] = useState(false);
  const [camOk, setCamOk] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [text, setText] = useState("");
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<(Result & { fixes: string[] }) | null>(null);
  const { quit, askQuit } = useQuit(!result);

  const push = (m: TutorMsg) => { c.hist = [...c.hist, m]; setMsgs(c.hist); };
  const clearSilence = () => clearTimeout(silence.current);
  const armSilence = () => {
    clearSilence();
    const sec = c.micOn && !c.over && !c.failed ? silenceDelay(c.last, c.nudges) : null;
    if (sec) silence.current = setTimeout(() => { c.nudges++; fire({ kind: "silence", seconds: sec }); }, sec * 1000);
  };

  const voice = async (line: string) => {
    if (!line.trim() || c.over) return;
    mic.current?.pause(); setTalking(true); // the mic would hear the tutor
    try { await speak(line, lang, { gender: ch.gender, kokoro: ch.kokoroVoice }); } catch { /* the caption still shows it */ }
    finally { setTalking(false); mic.current?.resume(); }
  };

  /** One event → one reply, spoken. False when the model call failed. */
  const step = async (e: TutorEvent) => {
    if (!course || !enrollment || !profile || !unit) return false;
    setThinking(true); setErr("");
    try {
      const r = await tutorTurn({ course, level: enrollment.level, native: profile.native_lang }, who, unit, c.hist, c.notes, e);
      if (c.over) return true;
      c.notes = r.notes.slice(0, NOTES_MAX); c.last = r; c.failed = null;
      if (r.correction.trim()) c.fixes.push(r.correction.trim());
      if (r.say.trim()) push({ from: "tutor", text: r.say.trim(), via: "voice" });
      setLast(r); setShowTr(false); setThinking(false);
      await voice(r.say);
      if (r.action === "end") finish();
      return true;
    } catch (x) {
      c.failed = e; setErr((x as Error).message); setThinking(false);
      return false;
    }
  };

  /** Runs events one at a time; learner input that arrives meanwhile is merged into the next event. */
  const run = async (first: TutorEvent) => {
    c.running = true; clearSilence();
    let e: TutorEvent | null = first;
    while (e && !c.over && (await step(e))) e = mergeInput(c.queue.splice(0));
    c.running = false;
    armSilence();
  };
  const fire = (e: TutorEvent) => {
    if (c.over) return;
    if (!c.running) return void run(e);
    if (e.kind === "user_said" || e.kind === "user_typed") c.queue.push(e); // silence and toggles while busy are dropped
  };
  const input = (kind: "user_said" | "user_typed", said: string) => {
    if (isNoise(said)) return;
    c.nudges = 0;
    push({ from: "me", text: said.trim(), via: kind === "user_said" ? "voice" : "text" });
    fire({ kind, text: said.trim() });
  };
  const retry = () => { const e = c.failed; c.failed = null; setErr(""); if (e) fire(e); };

  const micStart = async (announce: boolean) => {
    try {
      const m = await listen(lang, {
        utterance: (x) => input("user_said", x),
        speech: clearSilence, // the learner started talking: no nudge mid-sentence
        level: (r) => ring.current?.style.setProperty("--level", String(Math.min(1, r * 10))),
        error: (x) => toast(x.message),
      });
      if (c.over) return void m.stop();
      mic.current = m; c.micOn = true; setMicOn(true);
      if (announce) fire({ kind: "mic", on: true });
      else if (!c.running) armSilence();
    } catch { setMicBlock("tutor.micDenied"); setDrawer(true); }
  };
  const micStop = () => {
    c.micOn = false; setMicOn(false); clearSilence();
    ring.current?.style.setProperty("--level", "0");
    const m = mic.current; mic.current = null;
    return m?.stop();
  };
  const toggleMic = () => { if (micOn) { void micStop(); fire({ kind: "mic", on: false }); } else void micStart(true); };

  const camStop = () => { cam.current?.getTracks().forEach((x) => x.stop()); cam.current = null; setCamOn(false); };
  const toggleCam = async () => {
    if (cam.current) { camStop(); return fire({ kind: "cam", on: false }); }
    try { cam.current = await navigator.mediaDevices.getUserMedia({ video: true }); setCamOn(true); fire({ kind: "cam", on: true }); }
    catch { setCamOk(false); }
  };

  const finish = () => {
    if (c.over) return;
    c.over = true; void micStop(); camStop(); stopSpeaking();
    const mine = c.hist.filter((m) => m.from === "me").length;
    const clean = Math.max(0, mine - c.fixes.length);
    const xp = (mine * 5 + clean * 5 + (Date.now() - started.current >= BONUS_MS ? 20 : 0)) * xpMult(s);
    if (xp) { setS((s) => recordSession(s, { xp, gems: 0, kind: "practice" }, today())); gainXp(xp); }
    sfx("done");
    setResult({ xp, gems: 0, fixes: [...c.fixes] });
  };
  const end = () => (c.hist.some((m) => m.from === "me") ? finish() : quit());

  useEffect(() => {
    c.over = false; // StrictMode mounts twice: the first cleanup must not end the call
    if (!c.opened) {
      c.opened = true;
      sttReady().then((ok) => {
        if (ok && s.speakOn) return micStart(false);
        setMicBlock(ok ? "stt.off" : "stt.unavailable"); setDrawer(true);
      });
      fire({ kind: "start" });
    }
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(tick); c.over = true; clearSilence(); void mic.current?.stop(); mic.current = null; camStop(); stopSpeaking(); };
  }, []);

  const faceState: FaceState = thinking ? "thinking" : talking ? "talking" : "idle";
  const micLabel = t(micOn ? "tutor.micOff" : "tutor.micOn"), camLabel = t(camOn ? "tutor.camOff" : "tutor.camOn");
  let body: React.ReactNode, footer: React.ReactNode;
  if (result) {
    body = <>
      <Done title={t("tutor.done")} r={result} />
      {result.fixes.length > 0 && <div className="call-fixes">
        <h3>{t("tutor.corrections")}</h3>
        {result.fixes.map((f, i) => <p key={i} className="call-fix small"><Icon name="spark" /> {f}</p>)}
      </div>}
    </>;
    footer = <><span /><button className="btn btn-primary" onClick={quit}>{t("lesson.end")}</button></>;
  } else {
    body = err ? <Failed msg={err} retry={retry} quit={quit} /> : (
      <div className={`call-grid${drawer ? " with-drawer" : ""}`}>
        <section className="call-pane" aria-label={ch.name}>
          <Face spec={ch.face} color={ch.color} size={200} label={ch.name} state={faceState} />
          <b>{ch.name}</b>
          {last?.say && <button className="call-caption" lang={lang} onClick={() => setShowTr((v) => !v)}>
            <span>{last.say}</span>{showTr && <small>{last.translation}</small>}
          </button>}
          {last?.correction.trim() && <p className="call-fix small"><Icon name="spark" /> {last.correction}</p>}
        </section>
        <section className="call-pane me" ref={ring} aria-label={profile?.name}>
          {camOn
            ? <video className="call-video" autoPlay muted playsInline ref={(el) => { if (el && el.srcObject !== cam.current) el.srcObject = cam.current; }} />
            : profile && <><Avatar p={profile} size={96} /><b>{profile.name}</b></>}
        </section>
        {drawer && <section className="call-drawer" aria-label={t("tutor.message")}>
          <div className="chat">
            {msgs.map((m, i) => <div key={i} className={`bubble${m.from === "me" ? " me" : ""}`} lang={lang}><span>{m.text}</span></div>)}
          </div>
          <input className="input" lang={lang} value={text} autoFocus aria-label={t("roleplay.message")} placeholder={t("tutor.placeholder")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { input("user_typed", text); setText(""); } }} />
        </section>}
      </div>
    );
    footer = (
      <div className="call-bar">
        <button className={`call-btn${drawer ? " on" : ""}`} onClick={() => setDrawer((d) => !d)} aria-pressed={drawer} aria-label={t("tutor.message")} title={t("tutor.message")}><Icon name="chat" /></button>
        <button className={`call-btn${micOn ? " on" : " off"}`} disabled={!!micBlock} onClick={toggleMic} aria-pressed={micOn} aria-label={micLabel} title={micBlock ? t(micBlock) : micLabel}><Icon name="mic" /></button>
        <button className={`call-btn${camOn ? " on" : " off"}`} disabled={!camOk} onClick={toggleCam} aria-pressed={camOn} aria-label={camLabel} title={camOk ? camLabel : t("tutor.camDenied")}><Icon name="video" /></button>
        <button className="call-btn end" onClick={end} aria-label={t("tutor.end")} title={t("tutor.end")}><Icon name="phone" /></button>
      </div>
    );
  }
  return <Shell label={ch.name} progress={result ? 100 : Math.min(100, ((now - started.current) / BONUS_MS) * 100)} onClose={askQuit} body={body} footer={footer} />;
}
