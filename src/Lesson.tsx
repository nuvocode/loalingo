import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import { useApp } from "./store";
import { useBuy } from "./screens/Screens";
import * as db from "./db";
import { listenItems, matchesAnswer, normalize, type Item } from "./activities";
import { examLevel, explain, judge, loadLesson, prefetchNext, stepContext } from "./lessons";
import { recordSession, today } from "./progress";

/** Opens a lesson, or the out-of-hearts sheet (design behaviour). Steps need an AI provider (DECISIONS C6). */
export function useStartLesson() {
  const { t } = useTranslation();
  const { s, ai, startLesson, openSheet, closeSheet, go } = useApp();
  const buy = useBuy();
  return (id: string) => {
    if (!ai && !id.startsWith("practice-")) return openSheet(<>
      <h3>{t("ai.needed")}</h3><p>{t("ai.neededDesc")}</p>
      <button className="btn btn-primary btn-block" onClick={() => { closeSheet(); go("settings"); }}>{t("ai.setUp")}</button>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
    </>);
    if (!s.heartsOn || s.hearts > 0) return startLesson(id);
    openSheet(<>
      <h3>{t("sheet.noHearts")}</h3><p>{t("sheet.noHeartsDesc")}</p>
      <button className="btn btn-danger btn-block" onClick={() => buy("refill", 350)}>{t("sheet.refillFor", { count: 350 })}</button>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
    </>);
  };
}

// D1: system TTS for listening exercises.
function say(text: string, lang: string) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/** Items of the practice modes, built from the learner's own data (Faz 3). `mistakeId` links a replayed mistake. */
type PItem = Item & { mistakeId?: number };
async function practiceItems(id: string, enrollmentId: number, listenPrompt: string): Promise<PItem[]> {
  if (id === "practice-mistakes") return (await db.listMistakes<Item>(enrollmentId, 10)).map((m) => ({ ...m.item, mistakeId: m.id }));
  if (id === "practice-listen") return listenItems(await db.listWords(enrollmentId), listenPrompt);
  return [];
}

const questionOf = (it: Item) => it.kind === "learn" ? it.phrase : it.kind === "match" ? "match" : [it.prompt, "context" in it ? it.context : "", "listen" in it ? it.listen : ""].filter(Boolean).join(" — ");

type Fb = { ok: boolean; correct: string; given: string; note?: string } | null;
type Load = { state: "loading" } | { state: "error"; msg: string } | { state: "ready"; items: PItem[] };
const gap = (g: string) => ({ "--od-gap": g }) as React.CSSProperties;

export function Lesson({ id }: { id: string }) {
  const { t } = useTranslation();
  const { s, setS, completeStep, gainXp, completeLevel, openSheet, closeSheet, endLesson, sheet, course, enrollment, profile, ai, go } = useApp();
  const native = profile?.native_lang;
  // Keyed on stable values: `profile` changes on every stats update and must not restart the lesson.
  const ctx = useMemo(() => course && native && !id.startsWith("practice-") ? stepContext(course, id, native) : null, [course, native, id]);
  const lang = course?.iso ?? "en";
  const practice = id.startsWith("practice-");
  const exam = examLevel(id);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [gen, setGen] = useState(0); // bump = regenerate (C3)
  const [i, setI] = useState(0);
  const [fb, setFb] = useState<Fb>(null);
  const [checking, setChecking] = useState(false);
  const [score, setScore] = useState({ correct: 0, xp: 0 });
  const [result, setResult] = useState<{ xp: number; acc: number; gems: number; passed?: boolean; required?: number } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [bankSel, setBankSel] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [matched, setMatched] = useState<{ done: string[]; left: string | null; wrong: string[]; misses: number }>({ done: [], left: null, wrong: [], misses: 0 });

  function reset() { setSel(null); setBankSel([]); setText(""); setFb(null); setMatched({ done: [], left: null, wrong: [], misses: 0 }); }

  useEffect(() => {
    if (!enrollment || (!ctx && !practice)) return;
    let live = true;
    setLoad({ state: "loading" }); setI(0); reset(); setScore({ correct: 0, xp: 0 });
    (ctx ? loadLesson(enrollment.id, ctx, gen > 0) : practiceItems(id, enrollment.id, t("practice.listenPrompt")))
      .then((items) => live && setLoad({ state: "ready", items }))
      .catch((e) => live && setLoad({ state: "error", msg: (e as Error).message }));
    return () => { live = false; };
  }, [ctx, enrollment?.id, gen]);

  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const list = load.state === "ready" ? load.items : [];
  const it = list[i] as PItem | undefined;

  // Auto-play listening items once.
  useEffect(() => { if (it && (it.kind === "choice" || it.kind === "input") && it.listen) say(it.listen, lang); }, [it, lang]);

  const quit = () => { closeSheet(); endLesson(); };
  const askQuit = () => {
    if (result || load.state !== "ready") return quit();
    openSheet(<>
      <h3>{t("sheet.quitTitle")}</h3><p>{t("sheet.quitDesc")}</p>
      <button className="btn btn-danger btn-block" onClick={quit}>{t("sheet.quit")}</button>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.keepGoing")}</button>
    </>);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sheet) askQuit(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const finish = () => {
    const total = list.filter((x) => x.kind !== "learn").length || 1; // learn cards are not scored
    const acc = Math.round((score.correct / total) * 100), gems = score.correct * 2, xp = score.xp;
    setS((s) => recordSession(s, { xp, gems, kind: practice ? "practice" : "lesson" }, today()));
    const required = ctx?.levelDef.checkpoint?.required_score;
    const passed = exam ? acc >= required! : undefined;
    if (enrollment) {
      if (exam) (passed ? completeLevel(exam, xp) : gainXp(xp));
      else if (ctx) {
        completeStep(id, xp);
        prefetchNext(enrollment.id, ctx.course, ctx.level, id, ctx.native);
      } else gainXp(xp);
      // "My words": phrases taught or matched in this lesson (strength grows each time they come back).
      db.addWords(enrollment.id, list.flatMap((x): [string, string][] =>
        x.kind === "learn" ? [[x.phrase, x.translation]] : x.kind === "match" ? x.pairs : []));
    }
    setResult({ xp, acc, gems, passed, required });
  };

  const next = () => {
    if (i + 1 >= list.length) return finish();
    setI(i + 1); reset();
  };

  const grade = (ok: boolean, correct: string, given: string, note?: string) => {
    if (it && enrollment) {
      const { mistakeId, ...item } = it;
      if (id === "practice-listen" && it.kind === "choice") db.nudgeWord(enrollment.id, it.listen, ok ? 1 : -1);
      else if (ok && mistakeId) db.deleteMistake(mistakeId);
      else if (!ok && !mistakeId) db.addMistake(enrollment.id, item);
    }
    if (ok) setScore((sc) => ({ correct: sc.correct + 1, xp: sc.xp + 10 }));
    else if (s.heartsOn) {
      const hearts = Math.max(0, s.hearts - 1);
      setS((s) => ({ ...s, hearts }));
      if (hearts <= 0) openSheet(<HeartsOut onEnd={quit} />);
    }
    setFb({ ok, correct, given, note });
  };

  const check = async () => {
    if (!it) return;
    if (it.kind === "choice") return grade(sel === it.answer, it.options[it.answer], sel === null ? "" : it.options[sel]);
    if (it.kind === "bank") {
      const given = bankSel.map((j) => it.bank[j]).join(" ");
      return grade(normalize(given) === normalize(it.answer.join(" ")), it.answer.join(" "), given);
    }
    if (it.kind === "input") {
      if (matchesAnswer(text, it)) return grade(true, it.answer, text);
      if (!ctx) return grade(false, it.answer, text);
      setChecking(true); // C4: string match failed, let the AI judge meaning
      try { const r = await judge(ctx, questionOf(it), it.answer, text); grade(r.correct, it.answer, text, r.feedback); }
      catch { grade(false, it.answer, text); }
      finally { setChecking(false); }
    }
  };

  const matchCols = useMemo(() => it?.kind === "match"
    ? { l: it.pairs.map((p) => p[0]), r: it.pairs.map((p) => p[1]).sort(() => Math.random() - 0.5) } : null, [it]);
  const pickMatch = (side: "l" | "r", v: string) => {
    if (fb || it?.kind !== "match") return;
    if (side === "l") return setMatched((m) => ({ ...m, left: v, wrong: [] }));
    if (!matched.left) return;
    const pair = it.pairs.find((p) => p[0] === matched.left)!;
    if (pair[1] !== v) return setMatched((m) => ({ ...m, left: null, wrong: [pair[0], v], misses: m.misses + 1 }));
    const done = [...matched.done, pair[0], pair[1]];
    setMatched((m) => ({ ...m, done, left: null, wrong: [] }));
    if (done.length === it.pairs.length * 2) {
      const ok = matched.misses <= 1; // ponytail: one slip allowed, no heart loss inside match
      if (ok) setScore((sc) => ({ correct: sc.correct + 1, xp: sc.xp + 10 }));
      setFb({ ok, correct: it.pairs.map((p) => `${p[0]} = ${p[1]}`).join(", "), given: "" });
    }
  };

  const canCheck = !!it && !checking && (it.kind === "choice" ? sel !== null : it.kind === "bank" ? bankSel.length > 0 : it.kind === "input" ? text.trim().length > 0 : false);
  const progress = result ? 100 : list.length ? (i / list.length) * 100 : 0;
  const last = i + 1 >= list.length;
  const listenBtn = (txt: string) => <button className="prompt-word" onClick={() => say(txt, lang)}><Icon name="headphones" /> {t("lesson.listen")}</button>;

  let body: React.ReactNode;
  if (load.state === "loading") body = (
    <div className="result-wrap" role="status">
      <div className="result-badge gen-pulse" style={{ background: "var(--blue)", boxShadow: "0 6px 0 var(--blue-dark)", color: "var(--on-accent)" }}><Icon name="spark" /></div>
      <h2 style={{ fontSize: 22, fontWeight: 900 }}>{t("ai.preparing")}</h2>
      <p className="muted small">{ctx?.step.title} · {ai?.model}</p>
    </div>
  );
  else if (load.state === "error") body = (
    <div className="result-wrap" role="alert">
      <h2 style={{ fontSize: 22, fontWeight: 900 }}>{t("ai.failed")}</h2>
      <p className="muted small" style={{ maxWidth: 480, overflowWrap: "anywhere" }}>{load.msg}</p>
      <div className="od-row" style={gap("10px")}>
        <button className="btn btn-primary" onClick={() => setGen((g) => g + 1)}>{t("ai.retry")}</button>
        <button className="btn btn-ghost" onClick={() => { quit(); go("settings"); }}>{t("ai.openSettings")}</button>
      </div>
    </div>
  );
  else if (result) body = (
    <div className="result-wrap">
      <div className="result-badge" style={{ color: "var(--on-accent)", ...(result.passed === false && { background: "var(--red)", boxShadow: "0 6px 0 var(--red-dark)" }) }}>
        <Icon name={result.passed === false ? "refresh" : "trophy"} />
      </div>
      <h2 style={{ fontSize: 26, fontWeight: 900 }}>
        {result.passed === undefined ? t("lesson.done") : result.passed ? t("lesson.examPassed", { level: exam }) : t("lesson.examFailed")}
      </h2>
      {result.passed === false && <p className="muted">{t("lesson.examNeed", { score: result.required })}</p>}
      <div className="result-stats">
        <span className="result-stat gold"><span className="rs-k">{t("lesson.totalXp")}</span><span className="rs-v">+{result.xp}</span></span>
        <span className="result-stat green"><span className="rs-k">{t("lesson.accuracy")}</span><span className="rs-v">{t("lesson.accuracyValue", { value: result.acc })}</span></span>
        <span className="result-stat blue"><span className="rs-k">{t("lesson.gems")}</span><span className="rs-v">+{result.gems}</span></span>
      </div>
    </div>
  );
  else if (!it) body = <div className="result-wrap"><p className="muted">{t("ai.empty")}</p></div>;
  else if (it.kind === "learn") body = (
    <>
      <h2 className="ex-title">{t("lesson.newPhrase")}</h2>
      <div className="card" style={{ textAlign: "center", padding: 28 }}>
        <p lang={lang} style={{ fontSize: 30, fontWeight: 900 }}>{it.phrase}</p>
        <p className="muted" style={{ fontSize: 18, fontWeight: 700, margin: "6px 0 14px" }}>{it.translation}</p>
        {listenBtn(it.phrase)}
        {it.note && <p className="small" style={{ marginTop: 14 }}>{it.note}</p>}
      </div>
    </>
  );
  else if (it.kind === "choice") body = (
    <>
      <h2 className="ex-title">{it.prompt}</h2>
      {it.listen && listenBtn(it.listen)}
      {it.context && (it.big
        ? <div aria-hidden="true" style={{ fontSize: 72, textAlign: "center", margin: "8px 0 16px" }}>{it.context}</div>
        : <div className="card" lang={lang} style={{ whiteSpace: "pre-wrap", fontWeight: 700, fontSize: 18, marginBottom: 16 }}>{it.context}</div>)}
      <div className="opt-grid">
        {it.options.map((o, oi) => {
          const state = fb ? (oi === it.answer ? "correct" : oi === sel ? "wrong" : "") : oi === sel ? "sel" : "";
          return (
            <button className={`opt ${state}`} key={oi} disabled={!!fb} onClick={() => setSel(oi)}>
              <span className="opt-num">{oi + 1}</span><span>{o}</span>
            </button>
          );
        })}
      </div>
    </>
  );
  else if (it.kind === "bank") body = (
    <>
      <h2 className="ex-title">{it.prompt}</h2>
      <div className="bank-area">
        {bankSel.map((j) => <button className="tok" key={j} disabled={!!fb} onClick={() => setBankSel(bankSel.filter((x) => x !== j))}>{it.bank[j]}</button>)}
      </div>
      <div className="bank">
        {it.bank.map((w, j) => (
          <button className={`tok ${bankSel.includes(j) ? "used" : ""}`} key={j} disabled={!!fb} onClick={() => setBankSel([...bankSel, j])}>{w}</button>
        ))}
      </div>
    </>
  );
  else if (it.kind === "input") body = (
    <>
      <h2 className="ex-title">{it.prompt}</h2>
      {it.listen && listenBtn(it.listen)}
      {it.context && <div className="card" style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>{it.context}</div>}
      <textarea className="input" rows={3} value={text} disabled={!!fb || checking} autoFocus aria-label={t("lesson.yourAnswer")} placeholder={t("lesson.typeHere")}
        style={{ width: "100%", resize: "none", fontSize: 18 }}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canCheck) check(); } }} />
    </>
  );
  else body = (
    <>
      <h2 className="ex-title">{t("lesson.matchPairs")}</h2>
      <div className="od-grid" style={{ "--od-cols": 2, "--od-gap": "12px" } as React.CSSProperties}>
        {(["l", "r"] as const).map((side) => (
          <div className="opt-grid" key={side} style={{ gridTemplateColumns: "1fr" }}>
            {matchCols![side].map((v) => {
              const cls = matched.done.includes(v) ? "correct" : matched.wrong.includes(v) ? "wrong" : matched.left === v ? "sel" : "";
              return <button key={v} className={`opt ${cls}`} disabled={matched.done.includes(v) || !!fb} onClick={() => pickMatch(side, v)}><span>{v}</span></button>;
            })}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="lesson-overlay open" role="dialog" aria-modal="true" aria-label={t("lesson.dialog")}>
      <div className="lesson-top">
        <button className="icon-btn" onClick={askQuit} aria-label={t("lesson.close")}><Icon name="x" /></button>
        <div className="lesson-progress"><i style={{ width: `${progress}%` }} /></div>
        {ctx && !result && (
          <button className="icon-btn" onClick={() => setGen((g) => g + 1)} disabled={load.state === "loading"} aria-label={t("ai.regenerate")} title={t("ai.regenerate")}><Icon name="refresh" /></button>
        )}
        {s.heartsOn && <div className="hearts-box"><Icon name="heart" />{s.hearts}</div>}
      </div>

      <div className="lesson-body"><div className="lesson-inner">{body}</div></div>

      {load.state === "ready" && (
        <div className={`lesson-footer ${fb ? (fb.ok ? "ok" : "bad") : ""}`}>
          <div className="foot-inner">
            {result || !it ? (
              <><span /><button className="btn btn-primary" onClick={quit}>{t("lesson.end")}</button></>
            ) : it.kind === "learn" ? (
              <><span /><button className="btn btn-primary" onClick={next}>{t(last ? "lesson.finish" : "lesson.continue")}</button></>
            ) : fb ? (
              <>
                {fb.ok ? (
                  <span className="fb good"><span className="fb-ico" style={{ color: "var(--green)" }}><Icon name="check" /></span>
                    <span>{t("lesson.correct")}{fb.note && <small>{fb.note}</small>}</span></span>
                ) : (
                  <span className="fb bad"><span className="fb-ico" style={{ color: "var(--red)" }}><Icon name="x" /></span>
                    <span>{t("lesson.wrong")}{fb.note && <small>{fb.note}</small>}<small>{t("lesson.answer", { answer: fb.correct })}</small></span></span>
                )}
                <span className="od-row" style={gap("10px")}>
                  {!fb.ok && ctx && <button className="btn btn-ghost" onClick={() => openSheet(<ExplainSheet run={() => explain(ctx, questionOf(it), fb.correct, fb.given)} />)}>{t("lesson.explain")}</button>}
                  <button className={`btn ${fb.ok ? "btn-primary" : "btn-danger"}`} onClick={next}>{t(last ? "lesson.finish" : "lesson.continue")}</button>
                </span>
              </>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={next}>{t("lesson.skip")}</button>
                {it.kind !== "match" && <button className="btn btn-primary" disabled={!canCheck} onClick={check}>{t(checking ? "lesson.checking" : "lesson.check")}</button>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// C5: optional AI explanation after a wrong answer.
function ExplainSheet({ run }: { run: () => Promise<string> }) {
  const { t } = useTranslation();
  const { closeSheet } = useApp();
  const [txt, setTxt] = useState<string | null>(null);
  useEffect(() => { run().then(setTxt, (e) => setTxt(`${t("ai.failed")}: ${(e as Error).message}`)); }, []);
  return <>
    <h3>{t("lesson.explain")}</h3>
    <p role="status" style={{ margin: "12px 0 18px", whiteSpace: "pre-wrap" }}>{txt ?? t("ai.thinking")}</p>
    <button className="btn btn-primary btn-block" onClick={closeSheet}>{t("lesson.gotIt")}</button>
  </>;
}

function HeartsOut({ onEnd }: { onEnd: () => void }) {
  const { t } = useTranslation();
  const buy = useBuy();
  return <>
    <h3>{t("sheet.heartsOut")}</h3><p>{t("sheet.heartsOutDesc")}</p>
    <button className="btn btn-danger btn-block" onClick={() => buy("refill", 350)}>{t("sheet.refillFor", { count: 350 })}</button>
    <button className="btn btn-ghost btn-block" onClick={onEnd}>{t("sheet.endLesson")}</button>
  </>;
}
