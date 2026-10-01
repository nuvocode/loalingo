// Profile coaching card (SPR-27): how the learner's speaking changed over recent calls, and one thing to try. No percentages.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../store";
import * as db from "../db";
import { coach } from "../speech";
import { TutorSheet } from "./Screens";

const DIGITS = { latency: 1, words: 0, wpm: 0, pauses: 1, native: 0 } as const;

export function CoachCard() {
  const { t, i18n } = useTranslation();
  const { profile, s, openSheet } = useApp();
  const [c, setC] = useState<ReturnType<typeof coach> | undefined>(undefined);
  useEffect(() => { db.listSpeechSessions(profile!.id).then((r) => setC(coach(r)), () => setC(null)); }, [profile!.id]);
  if (c === undefined) return null;
  const num = (x: number, d: number) => x.toLocaleString(i18n.language, { maximumFractionDigits: d });
  return (
    <>
      <h2 className="section-title">{t("coach.title")}</h2>
      {!s.speechOn ? <p className="muted small">{t("coach.off")}</p>
        : !c ? <p className="muted small">{t("coach.empty")}</p>
        : <div className="card od-stack" style={{ "--od-gap": "12px" } as React.CSSProperties}>
            {c.trends.length
              ? c.trends.map((x) => <span key={x.k}>{t(`coach.trend.${x.k}`, { from: num(x.from, DIGITS[x.k]), to: num(x.to, DIGITS[x.k]) })}</span>)
              : <span>{t("coach.steady")}</span>}
            <span className="small"><b>{t("coach.tryThis")}</b> {t(`coach.tip.${c.tip}`)}</span>
            <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => openSheet(<TutorSheet />)}>{t("coach.start")}</button>
          </div>}
    </>
  );
}
