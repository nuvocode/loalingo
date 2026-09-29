import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import { useApp } from "./store";
import { useBuy } from "./screens/Screens";
import { EXERCISES, type Exercise } from "./mock";

/** Opens a lesson, or the out-of-hearts sheet (design behaviour). */
export function useStartLesson() {
  const { t } = useTranslation();
  const { s, startLesson, openSheet, closeSheet } = useApp();
  const buy = useBuy();
  return (id: string) => {
    if (s.hearts > 0) return startLesson(id);
    openSheet(<>
      <h3>{t("sheet.noHearts")}</h3><p>{t("sheet.noHeartsDesc")}</p>
      <button className="btn btn-danger btn-block" onClick={() => buy("refill", 350)}>{t("sheet.refillFor", { count: 350 })}</button>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
    </>);
  };
}

// D1: system TTS for listening exercises.
function say(text: string) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

type Fb = { ok: boolean; correct: string } | null;

export function Lesson({ id }: { id: string }) {
  const { t } = useTranslation();
  const { s, setS, completeStep, openSheet, closeSheet, endLesson, sheet } = useApp();
  // ponytail: sample exercises until the AI generates each step's activities (Faz 2).
  const [list] = useState<Exercise[]>(() => EXERCISES[id] ?? EXERCISES["1-3"]);
  const [i, setI] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [bankSel, setBankSel] = useState<number[]>([]);
  const [fb, setFb] = useState<Fb>(null);
  const [score, setScore] = useState({ correct: 0, xp: 0 });
  const [result, setResult] = useState<{ xp: number; acc: number; gems: number } | null>(null);
  const ex = list[i];

  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const quit = () => { closeSheet(); endLesson(); };
  const askQuit = () => {
    if (result) return quit();
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

  const reset = () => { setSel(null); setBankSel([]); setFb(null); };

  const finish = (sc = score) => {
    const acc = Math.round((sc.correct / list.length) * 100), gems = sc.correct * 2;
    setS((s) => ({
      ...s, todayXp: s.todayXp + sc.xp, gems: s.gems + gems,
      quests: s.quests.map((q) => q.id === "q1" ? { ...q, cur: Math.min(q.cur + sc.xp, 999) } : q.id === "q2" ? { ...q, cur: q.cur + 1 } : q),
    }));
    if (!id.startsWith("practice-")) completeStep(id, sc.xp);
    setResult({ xp: sc.xp, acc, gems });
  };

  const next = (sc = score) => {
    if (i + 1 >= list.length) return finish(sc);
    setI(i + 1); reset();
  };

  const check = () => {
    let ok = false, correct = "";
    if (ex.type === "choice") { ok = sel === ex.a; correct = ex.opts[ex.a]; }
    else { ok = bankSel.map((j) => ex.bank[j]).join(" ") === ex.answer.join(" "); correct = ex.answer.join(" "); }
    if (ok) setScore((sc) => ({ correct: sc.correct + 1, xp: sc.xp + 10 }));
    else {
      const hearts = Math.max(0, s.hearts - 1);
      setS((s) => ({ ...s, hearts }));
      if (hearts <= 0) openSheet(<HeartsOut onEnd={quit} />);
    }
    setFb({ ok, correct });
  };

  const canCheck = ex && (ex.type === "choice" ? sel !== null : bankSel.length > 0);
  const progress = result ? 100 : (i / list.length) * 100;

  return (
    <div className="lesson-overlay open" role="dialog" aria-modal="true" aria-label={t("lesson.dialog")}>
      <div className="lesson-top">
        <button className="icon-btn" onClick={askQuit} aria-label={t("lesson.close")}><Icon name="x" /></button>
        <div className="lesson-progress"><i style={{ width: `${progress}%` }} /></div>
        <div className="hearts-box"><Icon name="heart" />{s.hearts}</div>
      </div>

      <div className="lesson-body"><div className="lesson-inner">
        {result ? (
          <div className="result-wrap">
            <div className="result-badge" style={{ color: "var(--on-accent)" }}><Icon name="trophy" /></div>
            <h2 style={{ fontSize: 26, fontWeight: 900 }}>{t("lesson.done")}</h2>
            <div className="result-stats">
              <span className="result-stat gold"><span className="rs-k">{t("lesson.totalXp")}</span><span className="rs-v">+{result.xp}</span></span>
              <span className="result-stat green"><span className="rs-k">{t("lesson.accuracy")}</span><span className="rs-v">{t("lesson.accuracyValue", { value: result.acc })}</span></span>
              <span className="result-stat blue"><span className="rs-k">{t("lesson.gems")}</span><span className="rs-v">+{result.gems}</span></span>
            </div>
          </div>
        ) : ex.type === "choice" ? (
          <>
            <h2 className="ex-title">{ex.q}</h2>
            {ex.listen && <button className="prompt-word" onClick={() => say(ex.listen!)}><Icon name="headphones" /> {t("lesson.listen")}</button>}
            <div className="opt-grid">
              {ex.opts.map((o, oi) => {
                const state = fb ? (oi === ex.a ? "correct" : oi === sel ? "wrong" : "") : oi === sel ? "sel" : "";
                return (
                  <button className={`opt ${state}`} key={oi} disabled={!!fb} onClick={() => setSel(oi)}>
                    <span className="opt-num">{oi + 1}</span><span>{o}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h2 className="ex-title">{ex.q}</h2>
            <div className="bank-area">
              {bankSel.map((j) => <button className="tok" key={j} disabled={!!fb} onClick={() => setBankSel(bankSel.filter((x) => x !== j))}>{ex.bank[j]}</button>)}
            </div>
            <div className="bank">
              {ex.bank.map((w, j) => (
                <button className={`tok ${bankSel.includes(j) ? "used" : ""}`} key={j} disabled={!!fb} onClick={() => setBankSel([...bankSel, j])}>{w}</button>
              ))}
            </div>
          </>
        )}
      </div></div>

      <div className={`lesson-footer ${fb ? (fb.ok ? "ok" : "bad") : ""}`}>
        <div className="foot-inner">
          {result ? (
            <><span /><button className="btn btn-primary" onClick={quit}>{t("lesson.end")}</button></>
          ) : fb ? (
            <>
              {fb.ok ? (
                <span className="fb good"><span className="fb-ico" style={{ color: "var(--green)" }}><Icon name="check" /></span>{t("lesson.correct")}</span>
              ) : (
                <span className="fb bad"><span className="fb-ico" style={{ color: "var(--red)" }}><Icon name="x" /></span>
                  <span>{t("lesson.wrong")}<small>{t("lesson.answer", { answer: fb.correct })}</small></span></span>
              )}
              <button className={`btn ${fb.ok ? "btn-primary" : "btn-danger"}`} onClick={() => next()}>
                {t(i + 1 >= list.length ? "lesson.finish" : "lesson.continue")}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => next()}>{t("lesson.skip")}</button>
              <button className="btn btn-primary" disabled={!canCheck} onClick={check}>{t("lesson.check")}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
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
