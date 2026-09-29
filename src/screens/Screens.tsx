import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../icons";
import { useApp } from "../store";
import { useStartLesson } from "../Lesson";
import { useSpeakBlock } from "../Mic";
import { msLeft, rivalXp, PROMOTE, DEMOTE } from "../league";
import * as db from "../db";
import { LISTEN_MIN_WORDS, MADNESS_MIN_WORDS } from "../activities";
import { DOUBLE_XP_MS, today } from "../progress";
import { CHARACTERS, LEGEND_PRICE, type CharacterId } from "../lessons";

const iconBox = (bg: string, fg: string, size = 48, radius: number | string = 12): React.CSSProperties => ({
  width: size, height: size, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: radius, background: bg, color: fg,
});

/** This week's standings: simulated rivals + the learner (weekly XP). */
export function useLeague() {
  const { t } = useTranslation();
  const { s, profile } = useApp();
  const l = s.league, now = Date.now();
  const rows = (l?.rivals ?? []).map((r) => ({ n: r.n, c: r.c, xp: rivalXp(r, l!.week, now), me: false }))
    .concat({ n: t("league.you"), c: profile?.color ?? "#ffc800", xp: s.weekXp, me: true })
    .sort((a, b) => b.xp - a.xp || +b.me - +a.me); // ties go to the learner, as in rankOf
  return { rows, name: t(`league.tier${l?.tier ?? 0}`), left: l ? msLeft(l, now) : 0, last: l?.last };
}

export function useBuy() {
  const { t } = useTranslation();
  const { s, setS, toast, closeSheet } = useApp();
  return (item: "refill" | "freeze" | "doubleXp" | "legendary", price: number) => {
    if (s.gems < price) return toast(t("shop.notEnough"));
    setS((s) => ({
      ...s, gems: s.gems - price,
      hearts: item === "refill" ? s.maxHearts : s.hearts,
      streakFreeze: item === "freeze" ? s.streakFreeze + 1 : s.streakFreeze,
      doubleXpUntil: item === "doubleXp" ? Math.max(Date.now(), s.doubleXpUntil) + DOUBLE_XP_MS : s.doubleXpUntil,
      legendTickets: item === "legendary" ? s.legendTickets + 1 : s.legendTickets,
    }));
    closeSheet();
    toast(t("shop.bought", { name: t(`shop.${item}`) }));
  };
}

export function Practice() {
  const { t } = useTranslation();
  const { toast, enrollment, lessonId } = useApp();
  const start = useStartLesson();
  const [data, setData] = useState<{ mistakes: number; words: db.Word[]; timed: number }>({ mistakes: 0, words: [], timed: 0 });
  // Reloads when a practice session closes (lessonId → null).
  useEffect(() => {
    if (!enrollment || lessonId) return;
    Promise.all([db.listMistakes(enrollment.id), db.listWords(enrollment.id), db.cachedLessonItems(enrollment.id)])
      .then(([m, words, cached]) => setData({ mistakes: m.length, words, timed: cached.length }));
  }, [enrollment?.id, lessonId]);
  const { mistakes, words, timed } = data;
  const speakBlock = useSpeakBlock();
  const card = (onClick: () => void, icon: IconName, bg: string, fg: string, title: string, desc: string) => (
    <button className="card row-item" onClick={onClick}>
      <span style={iconBox(bg, fg)}><Icon name={icon} /></span>
      <span className="od-field od-fill"><b>{title}</b><span className="muted small">{desc}</span></span>
      <span className="btn btn-ghost" style={{ pointerEvents: "none" }}>{t("practice.start")}</span>
    </button>
  );
  return (
    <>
      <h1 className="section-title" style={{ marginTop: 24 }}>{t("practice.title")}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>{t("practice.subtitle")}</p>
      <div className="od-grid" style={{ "--od-cols": 1, "--od-gap": "14px" } as React.CSSProperties}>
        {card(() => mistakes ? start("practice-mistakes") : toast(t("practice.noMistakes")), "refresh", "var(--red-tint)", "var(--red)", t("practice.mistakes"),
          mistakes ? t("practice.mistakesCount", { count: mistakes }) : t("practice.noMistakes"))}
        {/* Speaking: bundled Whisper (DECISIONS D2). */}
        {card(() => speakBlock ? toast(t(speakBlock)) : words.length ? start("practice-speak") : toast(t("practice.needWords", { count: 1 })),
          "mic", "var(--sky)", "var(--blue)", t("practice.speak"), speakBlock ? t(speakBlock) : words.length ? t("practice.speakDesc") : t("practice.needWords", { count: 1 }))}
        {card(() => words.length >= LISTEN_MIN_WORDS ? start("practice-listen") : toast(t("practice.needWords", { count: LISTEN_MIN_WORDS })),
          "headphones", "var(--purple-tint)", "var(--purple-dark)", t("practice.listen"), words.length >= LISTEN_MIN_WORDS ? t("practice.listenDesc", { count: Math.min(6, words.length) }) : t("practice.needWords", { count: LISTEN_MIN_WORDS }))}
        {card(() => words.length >= MADNESS_MIN_WORDS ? start("practice-madness") : toast(t("practice.needWords", { count: MADNESS_MIN_WORDS })),
          "bolt", "var(--gold-tint)", "var(--gold-dark)", t("league.matchName"), words.length >= MADNESS_MIN_WORDS ? t("practice.madnessDesc") : t("practice.needWords", { count: MADNESS_MIN_WORDS }))}
        {card(() => timed ? start("practice-timed") : toast(t("practice.needLesson")),
          "clock", "var(--red-tint)", "var(--orange)", t("practice.timed"), timed ? t("practice.timedDesc") : t("practice.needLesson"))}
      </div>
      <h2 className="section-title">{t("practice.myWords")} <span className="muted small" style={{ fontWeight: 700 }}>({words.length})</span></h2>
      {!words.length && <p className="muted small">{t("practice.noWords")}</p>}
      <div className="od-cluster" style={{ "--od-gap": "10px" } as React.CSSProperties}>
        {words.map((w) => {
          const col = w.strength >= 4 ? "var(--green)" : w.strength >= 2 ? "var(--gold)" : "var(--red)";
          return (
            <button className="word-chip" key={w.word} onClick={() => toast(`'${w.word}' = ${w.translation}`)} aria-label={t("practice.wordAria", { word: w.word, meaning: w.translation, strength: w.strength })}>
              <span>{w.word}</span>
              <span className="strength" aria-hidden="true"><i style={{ width: `${(w.strength / 5) * 100}%`, background: col }} /></span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function League() {
  const { t } = useTranslation();
  const { toast, s, enrollment } = useApp();
  const start = useStartLesson();
  const playMadness = async () => enrollment && (await db.listWords(enrollment.id)).length >= MADNESS_MIN_WORDS
    ? start("practice-madness") : toast(t("practice.needWords", { count: MADNESS_MIN_WORDS }));
  const { rows, name, left, last } = useLeague();
  const days = Math.floor(left / 86_400_000), hours = Math.floor((left % 86_400_000) / 3_600_000);
  return (
    <>
      {last && last !== "stay" && <div className={`guide-status ${last === "down" ? "bad" : ""}`} role="status" style={{ marginTop: 14 }}>
        <span className="guide-status-ico"><Icon name={last === "up" ? "trophy" : "x"} /></span>
        <span><b>{t(last === "up" ? "league.promoted" : "league.demoted", { name })}</b></span>
      </div>}
      <div className="card" style={{ marginTop: 14, textAlign: "center", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "center", color: "var(--gold)" }}>
          <span style={{ width: 56, height: 56, display: "inline-flex" }}><Icon name="trophy" /></span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginTop: 8 }}>{t("league.title", { name })}</h1>
        <p className="muted small">{t("league.rules", { up: PROMOTE, down: DEMOTE })}</p>
        <p style={{ marginTop: 8, fontWeight: 800, color: "var(--orange)" }}><Icon name="clock" /> {t("league.timeLeft", { days, hours })}</p>
      </div>
      <div className="card" style={{ marginTop: 14, padding: 8 }}>
        {rows.map((p, i) => (
          <div className={`league-row ${p.me ? "me" : ""} ${i === PROMOTE - 1 ? "cut-up" : i === rows.length - DEMOTE - 1 ? "cut-down" : ""}`} key={p.n}>
            <span className={`league-rank ${i < 3 ? "top" : ""}`}>{i + 1}</span>
            <span className="avatar" style={{ background: p.c }} aria-hidden="true">{p.n[0]}</span>
            <span className="league-name">{p.n}{p.me ? t("league.youSuffix") : ""}</span>
            <span className="league-xp od-nowrap">{p.xp} XP</span>
          </div>
        ))}
      </div>
      <h2 className="section-title">{t("league.matchSection")}</h2>
      <div className="card od-row" style={{ "--od-gap": "14px" } as React.CSSProperties}>
        <span style={iconBox("var(--gold-tint)", "var(--gold-dark)")}><Icon name="bolt" /></span>
        <span className="od-field od-fill"><b>{t("league.matchName")}</b><span className="muted small">{t("league.matchBest", { count: s.madnessBest })}</span></span>
        <button className="btn btn-primary" onClick={playMadness}>{t("league.play")}</button>
      </div>
    </>
  );
}

export function Shop() {
  const { t } = useTranslation();
  const { s } = useApp();
  const buy = useBuy();
  const item = (id: "freeze" | "refill" | "doubleXp" | "legendary", ic: IconName, bg: string, fg: string, price: number, owned?: number) => (
    <div className="shop-item">
      <span className="s-icon" style={{ background: bg, color: fg }}><Icon name={ic} /></span>
      <span className="s-body"><h4>{t(`shop.${id}`)}</h4><p className="muted small">{t(`shop.${id}Desc`)}</p></span>
      {owned ? <span className="price-tag owned">{t("shop.owned", { count: owned })}</span> : (
        <button className="btn btn-danger" onClick={() => buy(id, price)}>
          <span style={{ width: 18, height: 18, display: "inline-flex" }}><Icon name="gem" /></span>{price}
        </button>
      )}
    </div>
  );
  const boostMin = Math.ceil((s.doubleXpUntil - Date.now()) / 60_000);
  return (
    <>
      <h1 className="section-title" style={{ marginTop: 24 }}>{t("shop.title")}</h1>
      <div className="card od-row" style={{ marginBottom: 18, "--od-gap": "10px" } as React.CSSProperties}>
        <span style={{ width: 26, height: 26, display: "inline-flex" }}><Icon name="gem" /></span>
        <b style={{ fontSize: 18 }}>{s.gems}</b><span className="muted">{t("shop.gemsHave")}</span>
        {boostMin > 0 && <span className="price-tag owned" style={{ marginLeft: "auto" }}>{t("shop.doubleXpActive", { count: boostMin })}</span>}
      </div>
      {item("freeze", "shield", "var(--green-tint)", "var(--green-dark)", 200, s.streakFreeze)}
      {item("refill", "heart", "var(--red-tint)", "var(--red-dark)", 350)}
      {item("doubleXp", "clock", "var(--sky)", "var(--blue-dark)", 120)}
      {item("legendary", "spark", "var(--purple-tint)", "var(--purple-dark)", LEGEND_PRICE)}
      {s.legendTickets > 0 && <p className="muted small">{t("learn.legendTicket", { count: s.legendTickets })}</p>}
    </>
  );
}

export function Profile() {
  const { t, i18n } = useTranslation();
  const { s, xp, profile, done } = useApp();
  const league = useLeague();
  const since = new Date(profile!.created_at.replace(" ", "T") + "Z").toLocaleDateString(i18n.language, { month: "long", year: "numeric" });
  const stat = (v: React.ReactNode, k: string, c: string) => (
    <div className="card od-stat" style={{ "--od-gap": "2px", textAlign: "center", padding: 14 } as React.CSSProperties}>
      <span style={{ fontSize: 22, fontWeight: 900, color: c }} className="od-nowrap">{v}</span>
      <span className="muted small" style={{ fontWeight: 700 }}>{k}</span>
    </div>
  );
  const ach: [IconName, string, number, number, string][] = [
    ["flame", "achFire", s.bestStreak, 7, "var(--orange)"], ["bolt", "achFast", s.bestDayXp, 50, "var(--gold-dark)"], ["book", "achBook", [...done].filter((d) => d.startsWith("story:")).length, 1, "var(--blue)"],
  ];
  return (
    <>
      <div className="od-row" style={{ "--od-gap": "16px", marginTop: 24 } as React.CSSProperties}>
        <span className="avatar" style={{ width: 72, height: 72, fontSize: 28, background: profile!.color }}>{profile!.name[0]}</span>
        <span className="od-field od-fill"><b style={{ fontSize: 22 }}>{profile!.name}</b><span className="muted small">{t("profile.since", { date: since })}</span></span>
      </div>
      <div className="od-grid" style={{ "--od-cols": 2, "--od-gap": "12px", marginTop: 18 } as React.CSSProperties}>
        {stat(t("profile.streakDays", { count: s.streak }), t("profile.streak"), "var(--orange)")}
        {stat(xp, t("profile.totalXp"), "var(--gold-dark)")}
        {stat(league.name, t("profile.currentLeague"), "var(--blue)")}
        {stat(t("profile.top3"), t("profile.bestLeague"), "var(--green-dark)")}
      </div>
      <h2 className="section-title">{t("profile.achievements")}</h2>
      <div className="od-stack" style={{ "--od-gap": "12px" } as React.CSSProperties}>
        {ach.map(([ic, key, cur, goal, col]) => {
          const done = Math.min(cur, goal);
          return (
            <div className="card od-row" style={{ "--od-gap": "14px" } as React.CSSProperties} key={key}>
              <span style={iconBox("var(--surface)", col, 44, "50%")}><Icon name={ic} /></span>
              <span className="od-field od-fill"><b>{t(`profile.${key}`)}</b><span className="muted small">{t(`profile.${key}Desc`)}</span>
                <span className="progress-track" style={{ display: "block", height: 10, marginTop: 6 }}><i className="progress-fill" style={{ display: "block", width: `${(done / goal) * 100}%` }} /></span>
              </span>
              <span className="od-nowrap muted small" style={{ fontWeight: 800 }}>{done}/{goal}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Stories() {
  const { t } = useTranslation();
  const { toast, course, enrollment, done } = useApp();
  const start = useStartLesson();
  const units = (enrollment && course?.levels[enrollment.level]?.units) || [];
  return (
    <>
      <h1 className="section-title">{t("stories.title")}</h1>
      <p className="muted" style={{ marginBottom: 18 }}>{t("stories.subtitle")}</p>
      <div className="od-stack" style={{ "--od-gap": "12px" } as React.CSSProperties}>
        {units.map((u, ui) => {
          // A unit's story opens once the unit is started (the first one is always open).
          const open = ui === 0 || u.steps.some((st) => done.has(st.id));
          const read = done.has(`story:${u.id}`);
          return (
            <button className="card row-item" key={u.id} onClick={() => open ? start(`story:${u.id}`) : toast(t("stories.lockedToast", { unit: ui }))}>
              <span style={iconBox(open ? "var(--sky)" : "var(--surface)", open ? "var(--blue)" : "var(--text-faint)")}><Icon name={read ? "check" : open ? "story" : "lock"} /></span>
              <span className="od-field od-fill"><b>{u.title}</b><span className="muted small">{t("learn.kicker", { level: enrollment!.level, unit: ui + 1 })}{u.description ? ` · ${u.description}` : ""}</span></span>
              {open && <span className="btn btn-ghost" style={{ pointerEvents: "none" }}>{t(read ? "stories.again" : "stories.read")}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function Roleplay() {
  const { t } = useTranslation();
  const { toast } = useApp();
  const start = useStartLesson();
  const speakBlock = useSpeakBlock();
  return (
    <>
      <h1 className="section-title">{t("roleplay.title")}</h1>
      <p className="muted" style={{ marginBottom: 18 }}>{t("roleplay.subtitle")}</p>
      <div className="od-grid" style={{ "--od-cols": 1, "--od-gap": "14px" } as React.CSSProperties}>
        {(Object.keys(CHARACTERS) as CharacterId[]).map((k) => {
          const { name, color } = CHARACTERS[k];
          return (
            <div className="card od-row" style={{ "--od-gap": "14px" } as React.CSSProperties} key={k}>
              <span className="avatar" style={{ width: 56, height: 56, fontSize: 22, background: color }}>{name[0]}</span>
              <span className="od-field od-fill"><b>{name}</b><span className="muted small">{t(`roleplay.${k}Role`)} — {t(`roleplay.${k}Goal`)}</span></span>
              <span className="od-row" style={{ "--od-gap": "8px" } as React.CSSProperties}>
                <button className="btn btn-ghost" onClick={() => start(`chat:${k}`)}>{t("roleplay.chat")}</button>
                <button className="btn btn-blue" onClick={() => speakBlock ? toast(t(speakBlock)) : start(`call:${k}`)}><Icon name="video" /> {t("roleplay.call")}</button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Friends = the other profiles on this device (local-first, no accounts). */
function useOtherProfiles() {
  const { profile } = useApp();
  const [others, setOthers] = useState<db.Profile[]>([]);
  useEffect(() => { db.listProfiles().then((ps) => setOthers(ps.filter((p) => p.id !== profile?.id))); }, [profile?.id]);
  // Their stats may be from an earlier week: count weekly XP only if it is this week's league.
  return others.map((p) => ({ ...p, weekXp: p.stats.league?.week === profile?.stats.league?.week ? p.stats.weekXp : 0 }))
    .sort((a, b) => b.weekXp - a.weekXp);
}

export function Friends() {
  const { t } = useTranslation();
  const { logout } = useApp();
  const friends = useOtherProfiles();
  return (
    <>
      <h1 className="section-title" style={{ marginTop: 24 }}>{t("friends.title")}</h1>
      <p className="muted" style={{ marginBottom: 14 }}>{t("friends.subtitle")}</p>
      {!friends.length && <p className="muted small">{t("friends.empty")}</p>}
      <div className="od-stack" style={{ "--od-gap": "12px" } as React.CSSProperties}>
        {friends.map((f) => (
          <div className="card od-row" style={{ "--od-gap": "14px" } as React.CSSProperties} key={f.id}>
            <span className="avatar" style={{ background: f.color }}>{f.name[0]}</span>
            <span className="od-field od-fill"><b>{f.name}</b><span className="muted small">{t("friends.weekXp", { count: f.weekXp })}</span></span>
            <span className="od-row" style={{ "--od-gap": "4px", color: "var(--orange)", fontWeight: 900 } as React.CSSProperties} aria-label={t("friends.streak", { count: f.stats.streak })}><Icon name="flame" />{f.stats.streak}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={logout}>{t("friends.add")}</button>
    </>
  );
}

/** Built from the learner's own state; nothing is pushed from outside. */
export function Notifications() {
  const { t } = useTranslation();
  const { s } = useApp();
  const { rows, name, last } = useLeague();
  const ahead = useOtherProfiles().find((f) => f.weekXp > s.weekXp);
  const rank = rows.findIndex((r) => r.me) + 1;
  const items: { icon: IconName; title: string; desc: string }[] = [
    s.lastActive === today()
      ? { icon: "flame", title: t("notifications.streakSafe"), desc: t("notifications.streakSafeDesc", { count: s.streak }) }
      : { icon: "flame", title: t(s.streak ? "notifications.streakRisk" : "notifications.streakStart"), desc: t(s.streak ? "notifications.streakRiskDesc" : "notifications.streakStartDesc", { count: s.streak }) },
    { icon: "trophy", title: t("notifications.league", { rank, name }), desc: t(rank <= PROMOTE ? "notifications.leagueUp" : "notifications.leagueChase", { count: PROMOTE }) },
  ];
  if (last && last !== "stay") items.push({ icon: "trophy", title: t(last === "up" ? "league.promoted" : "league.demoted", { name }), desc: "" });
  if (ahead) items.push({ icon: "users", title: t("notifications.passed", { name: ahead.name }), desc: t("notifications.passedDesc", { name: ahead.name }) });
  if (s.chests) items.push({ icon: "chest", title: t("notifications.chest"), desc: t("notifications.chestDesc") });
  return (
    <>
      <h1 className="section-title" style={{ marginTop: 24 }}>{t("notifications.title")}</h1>
      <div className="od-stack" style={{ "--od-gap": "10px", marginTop: 14 } as React.CSSProperties}>
        {items.map((n) => (
          <div className="card od-row-top" style={{ "--od-gap": "12px" } as React.CSSProperties} key={n.title}>
            <span style={iconBox("var(--surface)", "inherit", 40, 10)}><Icon name={n.icon} /></span>
            <span className="od-field od-fill"><b>{n.title}</b>{n.desc && <span className="muted small">{n.desc}</span>}</span>
          </div>
        ))}
      </div>
    </>
  );
}
