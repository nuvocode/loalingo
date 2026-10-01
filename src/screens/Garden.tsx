// Full-screen garden (SPR-10): the streak tree large, on the learner's biome, with streak, fruit and greenhouse.
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../icons";
import { useApp } from "../store";
import { levelsOf, checkpointId } from "../course";
import { biomeScene, biomeVars } from "../biomes";
import { STAGE_LESSONS, treeState, treeSvg } from "../tree";

export function Garden() {
  const { t } = useTranslation();
  const { s, done, course, enrollment, go } = useApp();
  const close = () => (history.length > 1 ? history.back() : go("learn"));
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const tree = treeState(done, s.streak, s.lastActive);
  const nextAt = STAGE_LESSONS[tree.stage + 1];
  const level = enrollment?.level ?? "A1";
  const streakMsg = tree.dry ? "garden.streakDry" : s.streak ? "garden.streakOk" : "garden.streakNew";

  return (
    <div className="garden" style={biomeVars(level)} role="dialog" aria-modal="true" aria-labelledby="garden-title">
      <div className="garden-hero">
        <div className="garden-scene" dangerouslySetInnerHTML={{ __html: biomeScene(level, 240) }} />
        <div className="garden-tree" role="img" aria-label={t(`garden.stage${tree.stage}`)} style={{ "--th": `${[22, 36, 50, 66, 80][tree.stage]}%` } as React.CSSProperties}
          dangerouslySetInnerHTML={{ __html: treeSvg(tree, true) }} />
        <div className="garden-top">
          <h2 id="garden-title">{t("garden.title")}</h2>
          <button ref={closeRef} className="icon-btn" onClick={close} aria-label={t("garden.close")}><Icon name="x" /></button>
        </div>
      </div>
      <div className="garden-cards">
        <div className="card">
          <h3>{t(`garden.stage${tree.stage}`)}</h3>
          <p className="muted small">{nextAt === undefined ? t("garden.grown")
            : t("garden.next", { count: nextAt - tree.lessons, stage: t(`garden.stage${tree.stage + 1}`) })}</p>
        </div>
        <div className="card">
          <h3 style={{ color: tree.dry ? "var(--gold-dark)" : "var(--green)" }}>{t("profile.streakDays", { count: s.streak })}</h3>
          <p className="muted small">{t(streakMsg)}</p>
        </div>
        <div className="card">
          <h3>{t("garden.fruit")}</h3>
          <div className="garden-fruit">
            {course && levelsOf(course).map((l) => (
              <span key={l} className={done.has(checkpointId(l)) ? "on" : ""} title={l}>{l}</span>
            ))}
          </div>
          <p className="muted small">{t("garden.fruitDesc")}</p>
        </div>
        <div className="card od-row" style={{ "--od-gap": "12px" } as React.CSSProperties}>
          <Icon name="greenhouse" />
          <span className="od-field od-fill">
            <b>{t("shop.freeze")} · {s.streakFreeze}</b>
            <span className="muted small">{t("shop.freezeDesc")}</span>
          </span>
          {!s.streakFreeze && <button className="btn btn-ghost" onClick={() => go("shop")}>{t("garden.toShop")}</button>}
        </div>
      </div>
    </div>
  );
}
