// Profile coaching (SPR-27): how the learner's speaking changed over recent calls, and one thing to try. No percentages.
// A summary card on the profile; the details open in a sheet.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../icons";
import { useApp } from "../store";
import * as db from "../db";
import { coach } from "../speech";
import { TutorSheet } from "./Screens";

const DIGITS = { latency: 1, words: 0, wpm: 0, pauses: 1, native: 0 } as const;
const gap = (g: string) => ({ "--od-gap": g }) as React.CSSProperties;

/** A profile tile: title, one line, opens its details. */
export function SummaryCard({ icon, color, title, line, onOpen }: { icon: IconName; color: string; title: string; line: string; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button className="card od-stack summary-card" style={gap("10px")} onClick={onOpen}>
      <span className="od-row" style={gap("10px")}><span style={{ color, display: "flex" }}><Icon name={icon} /></span><b>{title}</b></span>
      <span className="muted small od-fill">{line}</span>
      <span className="small" style={{ color: "var(--blue)", fontWeight: 800 }}>{t("profile.details")} ›</span>
    </button>
  );
}

type Coaching = ReturnType<typeof coach>;

export function CoachCard() {
  const { t, i18n } = useTranslation();
  const { profile, s, sheet, openSheet } = useApp();
  const [c, setC] = useState<Coaching | undefined>(undefined);
  useEffect(() => { if (!sheet) db.listSpeechSessions(profile!.id, 10, "tutor").then((r) => setC(coach(r)), () => setC(null)); }, [profile!.id, !sheet]); // fresh after a sheet closes
  if (c === undefined) return null;
  const x = c?.trends[0];
  const line = !s.speechOn ? t("settings.off") : !c ? t("coach.empty")
    : x ? t(`coach.trend.${x.k}`, { from: x.from.toLocaleString(i18n.language, { maximumFractionDigits: DIGITS[x.k] }), to: x.to.toLocaleString(i18n.language, { maximumFractionDigits: DIGITS[x.k] }) })
    : t("coach.steady");
  return <SummaryCard icon="mic" color="var(--green)" title={t("coach.title")} line={line} onOpen={() => openSheet(<CoachSheet c={c} />)} />;
}

function CoachSheet({ c }: { c: Coaching }) {
  const { t, i18n } = useTranslation();
  const { s, openSheet, closeSheet } = useApp();
  const num = (x: number, d: number) => x.toLocaleString(i18n.language, { maximumFractionDigits: d });
  return (
    <div className="od-stack sheet-wide" style={gap("12px")}>
      <h3>{t("coach.title")}</h3>
      {!s.speechOn ? <p className="muted small">{t("coach.off")}</p>
        : !c ? <p className="muted small">{t("coach.empty")}</p>
        : <>
            {c.trends.length
              ? c.trends.map((x) => <span key={x.k}>{t(`coach.trend.${x.k}`, { from: num(x.from, DIGITS[x.k]), to: num(x.to, DIGITS[x.k]) })}</span>)
              : <span>{t("coach.steady")}</span>}
            <span className="small"><b>{t("coach.tryThis")}</b> {t(`coach.tip.${c.tip}`)}</span>
            <button className="btn btn-primary" onClick={() => openSheet(<TutorSheet />)}>{t("coach.start")}</button>
          </>}
      <button className="btn btn-ghost" onClick={closeSheet}>{t("sheet.close")}</button>
    </div>
  );
}
