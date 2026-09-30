// Stories and roleplay chat (Faz 4). Same overlay chrome as lessons; the design only has the list screens.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import { useApp } from "./store";
import { sfx } from "./Lesson";
import { loadKokoro, speak, stopSpeaking, usesKokoro } from "./tts";
import { MicButton } from "./Mic";
import { CHARACTERS, CHAT_MAX_TURNS as CHAT_TURNS, CHAT_MIN_TURNS, FREE_GOAL, type CharacterId } from "./characters";
import { chatTurn, loadStory, type ChatMsg, type Story as StoryData } from "./lessons";
import { recordSession, today, xpMult } from "./progress";

const gap = (g: string) => ({ "--od-gap": g }) as React.CSSProperties;

type Result = { xp: number; gems: number };

function Shell({ label, progress, onClose, onRegen, body, footer }: {
  label: string; progress: number; onClose: () => void; onRegen?: () => void; body: React.ReactNode; footer?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { sheet } = useApp();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sheet) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  return (
    <div className="lesson-overlay open" role="dialog" aria-modal="true" aria-label={label}>
      <div className="lesson-top">
        <button className="icon-btn" onClick={onClose} aria-label={t("lesson.close")}><Icon name="x" /></button>
        <div className="lesson-progress"><i style={{ width: `${progress}%` }} /></div>
        {onRegen && <button className="icon-btn" onClick={onRegen} aria-label={t("ai.regenerate")} title={t("ai.regenerate")}><Icon name="refresh" /></button>}
      </div>
      <div className="lesson-body"><div className="lesson-inner">{body}</div></div>
      {footer && <div className="lesson-footer"><div className="foot-inner">{footer}</div></div>}
    </div>
  );
}

function Loading({ title }: { title: string }) {
  const { t } = useTranslation();
  const { ai } = useApp();
  return (
    <div className="result-wrap" role="status">
      <div className="result-badge gen-pulse" style={{ background: "var(--blue)", boxShadow: "0 6px 0 var(--blue-dark)", color: "var(--on-accent)" }}><Icon name="spark" /></div>
      <h2 style={{ fontSize: 22, fontWeight: 900 }}>{t("ai.preparing")}</h2>
      <p className="muted small">{title} · {ai?.model}</p>
    </div>
  );
}

function Failed({ msg, retry, quit }: { msg: string; retry: () => void; quit: () => void }) {
  const { t } = useTranslation();
  const { go } = useApp();
  return (
    <div className="result-wrap" role="alert">
      <h2 style={{ fontSize: 22, fontWeight: 900 }}>{t("ai.failed")}</h2>
      <p className="muted small" style={{ maxWidth: 480, overflowWrap: "anywhere" }}>{msg}</p>
      <div className="od-row" style={gap("10px")}>
        <button className="btn btn-primary" onClick={retry}>{t("ai.retry")}</button>
        <button className="btn btn-ghost" onClick={() => { quit(); go("settings"); }}>{t("ai.openSettings")}</button>
      </div>
    </div>
  );
}

function Done({ title, r }: { title: string; r: Result }) {
  const { t } = useTranslation();
  return (
    <div className="result-wrap">
      <div className="result-badge" style={{ color: "var(--on-accent)" }}><Icon name="trophy" /></div>
      <h2 style={{ fontSize: 26, fontWeight: 900 }}>{title}</h2>
      <div className="result-stats">
        <span className="result-stat gold"><span className="rs-k">{t("lesson.totalXp")}</span><span className="rs-v">+{r.xp}</span></span>
        <span className="result-stat blue"><span className="rs-k">{t("lesson.gems")}</span><span className="rs-v">+{r.gems}</span></span>
      </div>
    </div>
  );
}

/** Loads Kokoro while the first line is being written, so its voice is not waiting on the model too. */
function usePrewarm(lang: string) {
  useEffect(() => { usesKokoro(lang).then((k) => { if (k) return loadKokoro(); }).catch(() => {}); }, [lang]);
}

/** Asks before leaving a story or chat that is under way. */
function useQuit(active: boolean) {
  const { t } = useTranslation();
  const { openSheet, closeSheet, endLesson } = useApp();
  const quit = () => { closeSheet(); endLesson(); stopSpeaking(); };
  const askQuit = () => active ? openSheet(<>
    <h3>{t("sheet.quitTitle")}</h3><p>{t("sheet.quitDesc")}</p>
    <button className="btn btn-danger btn-block" onClick={quit}>{t("sheet.quit")}</button>
    <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.keepGoing")}</button>
  </>) : quit();
  return { quit, askQuit };
}

// ---- Story: lines appear one by one, comprehension questions in between ----

export function Story({ unitId }: { unitId: string }) {
  const { t } = useTranslation();
  const { course, enrollment, profile, s, setS, completeStep } = useApp();
  const level = enrollment?.level;
  const unit = level && course?.levels[level]?.units.find((u) => u.id === unitId);
  const lang = course?.iso ?? "en";
  const [gen, setGen] = useState(0);
  const [story, setStory] = useState<StoryData | null>(null);
  const [err, setErr] = useState("");
  const [p, setP] = useState(0); // position in `seq`
  const [sel, setSel] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [shown, setShown] = useState<Set<number>>(new Set()); // lines with translation revealed
  const [result, setResult] = useState<Result | null>(null);
  const { quit, askQuit } = useQuit(!!story && !result);
  const endRef = useRef<HTMLDivElement>(null);
  usePrewarm(lang);

  useEffect(() => {
    if (!course || !enrollment || !profile || !unit || !level) return;
    let live = true;
    setStory(null); setErr(""); setP(0); setSel(null); setChecked(false); setCorrect(0);
    loadStory(enrollment.id, { course, level, native: profile.native_lang }, unit, gen > 0)
      .then((s) => live && setStory(s), (e) => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [unitId, gen]);

  // Lines first, each followed by the questions asked after it.
  const seq = story ? story.lines.flatMap((_, li) => [{ line: li } as { line: number; q?: number },
    ...story.questions.flatMap((q, qi) => q.after_line === li ? [{ line: li, q: qi }] : [])]) : [];
  const cur = seq[p];
  const q = cur?.q !== undefined ? story!.questions[cur.q] : null;
  const lastLine = cur?.line ?? 0;

  useEffect(() => {
    if (story && cur && cur.q === undefined) speak(story.lines[cur.line].text, lang);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [p, story]);

  const next = () => {
    if (p + 1 < seq.length) { setP(p + 1); setSel(null); setChecked(false); return; }
    const xp = (10 + correct * 10) * xpMult(s), gems = correct * 2;
    setS((s) => recordSession(s, { xp, gems, kind: "practice" }, today()));
    completeStep(`story:${unitId}`, xp);
    sfx("done");
    setResult({ xp, gems });
  };
  const check = () => { setChecked(true); sfx(sel === q!.answer ? "ok" : "bad"); if (sel === q!.answer) setCorrect((c) => c + 1); };

  const title = story?.title ?? unit?.title ?? "";
  let body: React.ReactNode, footer: React.ReactNode;
  if (err) body = <Failed msg={err} retry={() => setGen((g) => g + 1)} quit={quit} />;
  else if (!story) body = <Loading title={unit?.title ?? ""} />;
  else if (result) {
    body = <Done title={t("stories.done")} r={result} />;
    footer = <><span /><button className="btn btn-primary" onClick={quit}>{t("lesson.end")}</button></>;
  } else {
    body = <>
      <h2 className="ex-title" lang={lang}>{story.title}</h2>
      <div className="chat">
        {story.lines.slice(0, lastLine + 1).map((l, li) => (
          <button key={li} className="bubble story-line" lang={lang} onClick={() => { speak(l.text, lang); setShown((s) => new Set(s).add(li)); }}>
            <b className="small" style={{ color: "var(--blue)" }}>{l.speaker}</b>
            <span>{l.text}</span>
            {shown.has(li) && <small>{l.translation}</small>}
          </button>
        ))}
      </div>
      {q && <div style={{ marginTop: 20 }}>
        <h3 style={{ fontWeight: 900, marginBottom: 12 }}>{q.prompt}</h3>
        <div className="opt-grid">
          {q.options.map((o, oi) => (
            <button key={oi} disabled={checked} onClick={() => setSel(oi)}
              className={`opt ${checked ? (oi === q.answer ? "correct" : oi === sel ? "wrong" : "") : oi === sel ? "sel" : ""}`}>
              <span className="opt-num">{oi + 1}</span><span lang={lang}>{o}</span>
            </button>
          ))}
        </div>
      </div>}
      <div ref={endRef} />
    </>;
    footer = q && !checked
      ? <><span className="muted small">{t("stories.tapHint")}</span><button className="btn btn-primary" disabled={sel === null} onClick={check}>{t("lesson.check")}</button></>
      : <>
        {q ? <span className={`fb ${sel === q.answer ? "good" : "bad"}`}>{t(sel === q.answer ? "lesson.correct" : "lesson.wrong")}</span> : <span className="muted small">{t("stories.tapHint")}</span>}
        <button className="btn btn-primary" onClick={next}>{t(p + 1 < seq.length ? "lesson.continue" : "lesson.finish")}</button>
      </>;
  }
  return <Shell label={title} progress={result ? 100 : seq.length ? (p / seq.length) * 100 : 0} onClose={askQuit}
    onRegen={story && !result ? () => setGen((g) => g + 1) : undefined} body={body} footer={footer} />;
}

// ---- Roleplay: free text chat with a character; the model corrects each message. `voice` = video-call mode: speak instead of type ----

export function Chat({ who, topic, voice = false }: { who: CharacterId; topic: { id?: string; goal: string }; voice?: boolean }) {
  const { t } = useTranslation();
  const { course, enrollment, profile, s, setS, gainXp } = useApp();
  const ch = CHARACTERS[who];
  const lang = course?.iso ?? "en";
  const [voicing, setVoicing] = useState<number | null>(null); // AI message being spoken (or its voice being made)
  const say = (text: string, i: number) => {
    setVoicing(i);
    speak(text, lang, { gender: ch.gender, kokoro: ch.kokoroVoice }).finally(() => setVoicing((v) => v === i ? null : v));
  };
  usePrewarm(lang);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [goal, setGoal] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set()); // AI messages with translation revealed
  const [result, setResult] = useState<Result | null>(null);
  const mine = msgs.filter((m) => m.from === "me").length;
  const { quit, askQuit } = useQuit(mine > 0 && !result);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  const turn = async (history: ChatMsg[]) => {
    if (!course || !enrollment || !profile) return;
    setBusy(true); setErr("");
    try {
      const r = await chatTurn({ course, level: enrollment.level, native: profile.native_lang }, who, topic, history);
      const fixed = history.map((m, i) => i === history.length - 1 && m.from === "me" ? { ...m, correction: r.correction.trim() || undefined } : m);
      setMsgs([...fixed, { from: "ai", text: r.reply, translation: r.translation }]);
      say(r.reply, fixed.length);
      // The prompt holds the goal back too; this guards models that wrap up early anyway.
      if (r.goal_reached && history.filter((m) => m.from === "me").length >= CHAT_MIN_TURNS) setGoal(true);
    } catch (e) { setErr((e as Error).message); setMsgs(history); }
    finally { setBusy(false); }
  };
  const opened = useRef(false); // StrictMode runs effects twice; open the scene once
  useEffect(() => { if (!opened.current) { opened.current = true; turn([]); } }, []);

  const send = (said?: string) => {
    const v = (said ?? text).trim();
    if (!v || busy) return;
    setText("");
    turn([...msgs, { from: "me", text: v }]);
  };
  const finish = () => {
    const clean = msgs.filter((m) => m.from === "me" && !m.correction).length;
    const xp = (mine * 5 + clean * 5 + (goal ? 20 : 0)) * xpMult(s), gems = goal ? 10 : 0;
    setS((s) => recordSession(s, { xp, gems, kind: "practice" }, today()));
    gainXp(xp);
    sfx("done");
    setResult({ xp, gems });
  };
  const over = goal || mine >= CHAT_TURNS;

  let body: React.ReactNode, footer: React.ReactNode;
  if (result) {
    body = <Done title={t(goal ? "roleplay.goalDone" : "roleplay.done")} r={result} />;
    footer = <><span /><button className="btn btn-primary" onClick={quit}>{t("lesson.end")}</button></>;
  } else {
    body = <>
      <div className="od-row" style={{ ...gap("12px"), marginBottom: 16 }}>
        <span className="avatar" style={{ width: 48, height: 48, fontSize: 20, background: ch.color }}>{ch.name[0]}</span>
        <span className="od-field od-fill"><b>{ch.name}</b><span className="muted small">{topic.id ? t(`roleplay.topics.${who}.${topic.id}`) : topic.goal.slice(FREE_GOAL.length)}</span></span>
      </div>
      <div className="chat">
        {msgs.map((m, i) => m.from === "ai" ? (
          <button key={i} className="bubble" lang={lang} aria-busy={voicing === i} onClick={() => { say(m.text, i); setOpen((s) => new Set(s).add(i)); }}>
            <span>{m.text}</span>{open.has(i) && <small>{m.translation}</small>}
            {voicing === i && <small className="voicing gen-pulse" role="status"><Icon name="headphones" /> {t("ai.speaking")}</small>}
          </button>
        ) : (
          <div key={i} className="bubble me" lang={lang}>
            <span>{m.text}</span>{m.correction && <small className="fix"><Icon name="spark" /> {m.correction}</small>}
          </div>
        ))}
        {busy && <div className="bubble typing" role="status" aria-label={t("ai.thinking")}>…</div>}
      </div>
      {err && <Failed msg={err} retry={() => turn(msgs)} quit={quit} />}
      {over && !busy && <p className="muted small" style={{ textAlign: "center", marginTop: 16 }}>{t(goal ? "roleplay.goalReached" : "roleplay.limit")}</p>}
      {voice && !over && <MicButton lang={lang} disabled={busy} onText={(said) => send(said)} />}
      <div ref={endRef} />
    </>;
    footer = over || voice
      ? voice && !over
        ? <><span className="muted small">{t("roleplay.callHint")}</span>{mine > 0 ? <button className="btn btn-ghost" disabled={busy} onClick={finish}>{t("lesson.finish")}</button> : <span />}</>
        : <><span className="muted small">{t("roleplay.tapHint")}</span><button className="btn btn-primary" disabled={busy} onClick={finish}>{t("lesson.finish")}</button></>
      : <>
        <input className="input" style={{ flex: 1, fontSize: 17 }} lang={lang} value={text} autoFocus aria-label={t("roleplay.message")} placeholder={t("roleplay.placeholder")}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <span className="od-row" style={gap("10px")}>
          {mine > 0 && <button className="btn btn-ghost" disabled={busy} onClick={finish}>{t("lesson.finish")}</button>}
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => send()}>{t("roleplay.send")}</button>
        </span>
      </>;
  }
  return <Shell label={ch.name} progress={result ? 100 : Math.min(100, (mine / CHAT_TURNS) * 100)} onClose={askQuit} body={body} footer={footer} />;
}
