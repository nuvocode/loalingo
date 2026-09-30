// Practice together panel (spec P): topics, warm-up and reading questions, the reading text, discussion questions.
// It only shows the state and reports clicks; the flow and grading live in src/practice.ts, the tutor in TutorCall.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import type { Item } from "./activities";
import { currentItem, type Answered, type PracticeState, type Topic } from "./practice";

type Props = {
  pr: PracticeState; topics: Topic[]; loading: boolean; error: string; lang: string;
  onTopic: (t: Topic) => void; onAnswer: (given: string) => void; onNext: () => void; onHint: () => void; onRetry: () => void; onClose: () => void;
};

export function PracticePanel(p: Props) {
  const { t } = useTranslation();
  const { pr } = p;
  const it = currentItem(pr);
  let body: React.ReactNode = null;
  if (p.error) body = (
    <div className="practice-center">
      <p>{t("tutor.practiceFailed")}</p>
      <button className="btn btn-primary" onClick={p.onRetry}>{t("tutor.retry")}</button>
    </div>
  );
  else if (p.loading) body = <div className="practice-center"><p className="muted">{t("tutor.preparing")}</p></div>;
  else if (pr.stage === "topics") body = (
    <div className="opt-grid">
      {p.topics.map((tp) => (
        <button key={tp.unit.id} className="opt" onClick={() => p.onTopic(tp)}><span className="opt-num">{tp.level}</span><span>{tp.unit.title}</span></button>
      ))}
    </div>
  );
  else if (pr.stage === "reading" && pr.set) body = <>
    <article className="card practice-text" lang={p.lang}><h3>{pr.set.reading.title}</h3><p>{pr.set.reading.text}</p></article>
    <div className="practice-actions"><button className="btn btn-primary" onClick={p.onNext}>{t("tutor.next")}</button></div>
  </>;
  else if (pr.stage === "discussion" && pr.set) body = <>
    <ol className="practice-questions" lang={p.lang}>
      {pr.set.discussion.map((q, k) => <li key={k} className={k === pr.i ? "on" : k < pr.i ? "past" : ""} aria-current={k === pr.i ? "step" : undefined}>{q}</li>)}
    </ol>
    <div className="practice-actions"><button className="btn btn-primary" onClick={p.onNext}>{t("tutor.next")}</button></div>
  </>;
  else if (it) body = <Exercise key={`${pr.stage}${pr.i}`} it={it} last={pr.last} lang={p.lang} onAnswer={p.onAnswer} onHint={p.onHint} />;
  return (
    <section className="call-practice" aria-label={t("tutor.practice")}>
      <header className="practice-head">
        {pr.stage !== "done" && <b>{t(`tutor.stage.${pr.stage}`)}</b>}
        <button className="call-btn" onClick={p.onClose} aria-label={t("tutor.practiceClose")} title={t("tutor.practiceClose")}><Icon name="x" /></button>
      </header>
      <div className="practice-body">{body}</div>
    </section>
  );
}

/** One exercise, answered once: a choice answers on click, word tiles on "Check". */
function Exercise({ it, last, lang, onAnswer, onHint }: { it: Item; last: Answered | null; lang: string; onAnswer: (g: string) => void; onHint: () => void }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<number[]>([]);
  const hint = !last && <button className="btn" onClick={onHint}>{t("tutor.hint")}</button>;
  if (it.kind === "choice") return <>
    <h2 className="ex-title">{it.prompt}</h2>
    {it.context && <div className="card" lang={lang} style={{ whiteSpace: "pre-wrap", fontWeight: 700, fontSize: 18 }}>{it.context}</div>}
    <div className="opt-grid">
      {it.options.map((o, oi) => {
        const state = last ? (oi === it.answer ? "correct" : o === last.given ? "wrong" : "") : "";
        return <button key={oi} className={`opt ${state}`} disabled={!!last} lang={lang} onClick={() => onAnswer(o)}><span className="opt-num">{oi + 1}</span><span>{o}</span></button>;
      })}
    </div>
    <div className="practice-actions">{hint}</div>
  </>;
  if (it.kind === "bank") return <>
    <h2 className="ex-title">{it.prompt}</h2>
    <div className="bank-area" lang={lang}>
      {sel.map((j) => <button className="tok" key={j} disabled={!!last} onClick={() => setSel(sel.filter((x) => x !== j))}>{it.bank[j]}</button>)}
    </div>
    <div className="bank" lang={lang}>
      {it.bank.map((w, j) => <button key={j} className={`tok ${sel.includes(j) ? "used" : ""}`} disabled={!!last || sel.includes(j)} onClick={() => setSel([...sel, j])}>{w}</button>)}
    </div>
    {last && <p className={`practice-fb ${last.correct ? "ok" : "bad"}`} lang={lang}>{last.expected}</p>}
    <div className="practice-actions">
      {hint}
      <button className="btn btn-primary" disabled={!!last || !sel.length} onClick={() => onAnswer(sel.map((j) => it.bank[j]).join(" "))}>{t("tutor.check")}</button>
    </div>
  </>;
  return null;
}
