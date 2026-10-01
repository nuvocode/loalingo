import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import { useApp } from "./store";
import { DAILY_XP_GOAL } from "./progress";
import { treeState, treeSvg } from "./tree";
import { useLeague } from "./screens/Screens";
import { CourseFlag, CourseSheet } from "./screens/Profiles";

const QUEST_KEY = { q1: "rail.qXp", q2: "rail.qLessons", q3: "rail.qPractice" } as const;

export function Rail() {
  const { t } = useTranslation();
  const { s, setS, go, openSheet, closeSheet, course, done } = useApp();
  const tree = treeState(done, s.streak, s.lastActive);
  const league = useLeague();
  const pct = Math.min((s.todayXp / DAILY_XP_GOAL) * 100, 100);

  const openChest = () => {
    setS((s) => ({ ...s, chests: s.chests - 1, gems: s.gems + 50 }));
    openSheet(<>
      <h3>{t("sheet.chestOpened")}</h3><p>{t("sheet.chestGems", { count: 50 })}</p>
      <button className="btn btn-primary btn-block" onClick={closeSheet}>{t("sheet.great")}</button>
    </>);
  };

  return (
    <>
      <div className="rail-card"><div className="stat-strip" style={{ justifyContent: "space-between" }}>
        {course && <button className="stat-chip course-chip" onClick={() => openSheet(<CourseSheet />)} aria-label={t("profiles.switchCourse")}><CourseFlag c={course} /></button>}
        <button className="stat-chip" style={{ color: tree.dry ? "var(--gold-dark)" : "var(--green)" }} onClick={() => go("garden")}
          aria-label={`${t("garden.open")} · ${t("profile.streakDays", { count: s.streak })}`}>
          <span style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: treeSvg(tree, true) }} />{s.streak}
        </button>
        <span className="stat-chip" style={{ color: "var(--gold-dark)" }}><Icon name="gem" />{s.gems}</span>
        {s.heartsOn && <span className="stat-chip" style={{ color: "var(--blue)" }}><Icon name="drop" />{s.hearts}</span>}
      </div></div>

      <div className="rail-card">
        <div className="od-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <h3>{t("rail.dailyQuests")}</h3>
          <span className="small" style={{ fontWeight: 800, color: "var(--gold-dark)" }}>{Math.round(pct)}%</span>
        </div>
        <div className="progress-track" style={{ marginBottom: 10 }}><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        {s.quests.map((q) => (
          <div className="quest" key={q.id}>
            <span className="q-icon"><Icon name={q.icon} /></span>
            <span className="q-body">
              <span className="q-name">{t(QUEST_KEY[q.id], { count: q.goal })}</span>
              <span className="q-bar"><i className="q-fill" style={{ width: `${Math.min((q.cur / q.goal) * 100, 100)}%` }} /></span>
            </span>
            <span className="q-count od-nowrap">{Math.min(q.cur, q.goal)}/{q.goal}</span>
          </div>
        ))}
      </div>

      <div className="rail-card">
        <div className="od-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h3>{t("league.title", { name: league.name })}</h3>
          <button className="small" style={{ fontWeight: 800, color: "var(--blue)" }} onClick={() => go("league")}>{t("league.all")}</button>
        </div>
        {league.rows.slice(0, 5).map((p, i) => (
          <div className={`league-row ${p.me ? "me" : ""}`} key={p.n}>
            <span className={`league-rank ${i < 3 ? "top" : ""}`}>{i + 1}</span>
            <span className="avatar" style={{ width: 30, height: 30, fontSize: 13, background: p.c }}>{p.n[0]}</span>
            <span className="league-name" style={{ fontSize: 14 }}>{p.n}</span>
            <span className="league-xp">{p.xp} XP</span>
          </div>
        ))}
      </div>

      {s.chests > 0 && (
        <div className="rail-card" style={{ textAlign: "center" }}>
          <h3 style={{ marginBottom: 10 }}>{t("rail.chestTitle")}</h3>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button className="chest-box" onClick={openChest} style={{ width: 96, height: 96, borderRadius: 18 }} aria-label={t("rail.chestTap")}>
              <Icon name="basket" />
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>{t("rail.chestTap")}</p>
        </div>
      )}
    </>
  );
}
