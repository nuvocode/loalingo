import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../icons";
import { useApp } from "../store";
import { useStartLesson } from "../Lesson";
import { buildPath, checkpointId, levelsOf, type Cefr, type PathNode, type PathUnit } from "../course";

const CHEST_GEMS = 20;

const PATH_OFF = [0, -44, 44, -70, 0, 70, 44, -44]; // winding offsets

// Dashed winding connector between lesson nodes (same curve as the design).
// Measures its parent (.path); own ref is attached before this layout effect runs, the parent's is not.
function PathLines() {
  const svg = useRef<SVGSVGElement>(null);
  const [geo, setGeo] = useState<{ w: number; h: number; d: string } | null>(null);
  useLayoutEffect(() => {
    const el = svg.current!.parentElement!;
    const measure = () => {
      const btns = [...el.querySelectorAll(".node-btn")];
      if (btns.length < 2) return setGeo(null);
      const pr = el.getBoundingClientRect();
      const pts = btns.map((b) => { const r = b.getBoundingClientRect(); return [r.left - pr.left + r.width / 2, r.top - pr.top + r.height / 2]; });
      let d = `M ${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], my = (y0 + y1) / 2;
        d += ` C ${x0} ${my}, ${x1} ${my}, ${x1} ${y1}`;
      }
      setGeo({ w: pr.width, h: pr.height, d });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <svg ref={svg} className="path-lines" width={geo?.w} height={geo?.h} viewBox={geo ? `0 0 ${geo.w} ${geo.h}` : undefined}>
      {geo && <path d={geo.d} fill="none" strokeWidth={6} strokeLinecap="round" strokeDasharray="1 14" />}
    </svg>
  );
}

const ICON: Record<PathNode["kind"], Record<PathNode["state"], IconName>> = {
  step: { done: "check", current: "star", locked: "lock" },
  chest: { done: "check", current: "chest", locked: "chest" },
  checkpoint: { done: "trophy", current: "trophy", locked: "trophy" },
};

function UnitSection({ u, level }: { u: PathUnit; level: Cefr }) {
  const { t } = useTranslation();
  const { toast, setS, completeStep, openSheet, closeSheet } = useApp();
  const start = useStartLesson();
  const openChest = async (id: string) => {
    await completeStep(id, 0);
    setS((s) => ({ ...s, gems: s.gems + CHEST_GEMS }));
    openSheet(<>
      <h3>{t("sheet.chestOpened")}</h3><p>{t("sheet.chestGems", { count: CHEST_GEMS })}</p>
      <button className="btn btn-primary btn-block" onClick={closeSheet}>{t("sheet.great")}</button>
    </>);
  };
  return (
    <section aria-label={u.title}>
      <div className={`unit-head ${u.theme}`}>
        <div className="uh-row">
          <div><span className="uh-kicker">{t("learn.kicker", { level, unit: u.index })}</span><h2>{u.title}</h2></div>
          <button className="guidebook" onClick={() => toast(t("learn.guidebookToast"))}><Icon name="book" /><span>{t("learn.guidebook")}</span></button>
        </div>
      </div>
      <div className="path">
        <PathLines />
        {u.nodes.map((n, ni) => {
          const off = PATH_OFF[((u.index - 1) * 3 + ni) % PATH_OFF.length];
          const cls = n.kind === "step" ? n.state : `${n.kind === "chest" ? "chest" : "legendary"} ${n.state}`;
          const name = n.kind === "chest" ? t("learn.chest") : n.title;
          const onClick =
            n.state === "locked" ? undefined
            : n.kind === "step" ? () => start(n.id)
            : n.kind === "chest" ? (n.state === "current" ? () => openChest(n.id) : undefined)
            : () => start(n.id); // checkpoint: retake allowed once done
          return (
            <div className={`node ${cls}`} style={{ transform: `translateX(${off}px)` }} key={n.id}>
              <button className="node-btn" onClick={onClick} aria-label={name} aria-disabled={!onClick || undefined}>
                <Icon name={ICON[n.kind][n.state]} />
              </button>
              {n.state === "current" && n.kind === "step" && <span className="start-tag">{t("learn.start")}</span>}
              <span className="node-label">{name}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LevelSheet() {
  const { t } = useTranslation();
  const { course, enrollment, setViewLevel, closeSheet, toast } = useApp();
  const levels = levelsOf(course!);
  const cur = levels.indexOf(enrollment!.level);
  return <>
    <h3>{t("learn.levels")}</h3>
    <div className="od-stack" style={{ "--od-gap": "10px", marginTop: 12 } as React.CSSProperties}>
      {levels.map((l, i) => (
        <button key={l} className="card row-item" onClick={() => {
          if (i > cur) return toast(t("learn.finishFirst", { level: enrollment!.level }));
          setViewLevel(l); closeSheet();
        }}>
          <span className="od-field od-fill"><b>{l} · {course!.levels[l]!.title}</b>
            <span className="muted small">{t(i < cur ? "learn.levelDone" : i === cur ? "learn.levelCurrent" : "learn.levelLocked")}</span></span>
          <Icon name={i < cur ? "check" : i === cur ? "star" : "lock"} />
        </button>
      ))}
    </div>
  </>;
}

function LevelCard({ level, remaining, total }: { level: Cefr; remaining: number; total: number }) {
  const { t } = useTranslation();
  const { course, done } = useApp();
  const start = useStartLesson();
  const levels = levelsOf(course!);
  const next = levels[levels.indexOf(level) + 1];
  const hasExam = !!course!.levels[level]!.checkpoint;
  if (!next && (done.has(checkpointId(level)) || (!hasExam && remaining === 0))) return (
    <div className="card" style={{ margin: "8px 0 24px", textAlign: "center" }}>
      <h3 style={{ fontWeight: 900, fontSize: 18 }}>{t("learn.courseDone", { level })}</h3>
      <p className="muted small">{t("learn.courseDoneDesc")}</p>
    </div>
  );
  const title = remaining === 0 ? t("learn.checkpointNext", { level: next ?? level })
    : next ? t("learn.lessonsLeft", { count: remaining, level: next }) : t("learn.lessonsLeftFinish", { count: remaining, level });
  return (
    <div className="card" style={{ margin: "8px 0 24px", textAlign: "center" }}>
      <h3 style={{ fontWeight: 900, fontSize: 18 }}>{title}</h3>
      <div className="progress-track" style={{ margin: "12px 0 14px" }}><div className="progress-fill green" style={{ width: `${((total - remaining) / total) * 100}%` }} /></div>
      {hasExam && remaining > 0 && <button className="btn btn-ghost btn-block" onClick={() => start(`${level}:test`)}>{t("learn.skipLevel", { level })}</button>}
    </div>
  );
}

export function Learn() {
  const { t } = useTranslation();
  const { course, enrollment, done, viewLevel, openSheet, courseErrors, ai, go } = useApp();
  const setup = !ai && (
    <div className="soon-banner" role="status" style={{ borderColor: "var(--blue)" }}>
      <span className="od-field od-fill"><b>{t("ai.needed")}</b><span className="small">{t("ai.neededDesc")}</span></span>
      <button className="btn btn-blue" onClick={() => go("settings")}>{t("ai.setUp")}</button>
    </div>
  );
  const errors = courseErrors.length > 0 && (
    <div className="soon-banner" role="alert" style={{ borderColor: "var(--red)", alignItems: "flex-start" }}>
      <span className="od-field" style={{ minWidth: 0 }}><b>{t("learn.courseErrors")}</b>
        {courseErrors.map((e) => <pre key={e} className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit" }}>{e}</pre>)}</span>
    </div>
  );
  if (!course || !enrollment) return <>{errors}<p className="muted" style={{ marginTop: 24 }}>{t("learn.noCourse")}</p></>;
  const level = viewLevel ?? enrollment.level;
  const { units, remaining } = buildPath(course.levels[level]!, level, done);
  const total = course.levels[level]!.units.reduce((a, u) => a + u.steps.length, 0);
  return (
    <>
      {setup}{errors}
      <button className="btn btn-ghost" style={{ marginTop: 20 }} onClick={() => openSheet(<LevelSheet />)} aria-haspopup="dialog">
        {level} · {course.levels[level]!.title} ▾
      </button>
      {units.map((u) => <UnitSection u={u} level={level} key={u.id} />)}
      {level === enrollment.level && <LevelCard level={level} remaining={remaining} total={total} />}
    </>
  );
}
