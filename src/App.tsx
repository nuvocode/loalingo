import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "./icons";
import { useApp, type BootError, type Route } from "./store";
import { Rail } from "./Rail";
import { Lesson, sfxState } from "./Lesson";
import { today } from "./progress";
import { nudgeDue, nudgeMessage } from "./nudge";
import { keepInBackground, notify } from "./notify";
import { takeOver, resetDataDir } from "./datadir";
import { findUpdate, UpdateSheet } from "./Update";
import { Chat, Story } from "./Talk";
import { parseTalkId } from "./characters";
import { Learn } from "./screens/Learn";
import { Settings } from "./screens/Settings";
import { Avatar, ProfileGate, useLangName } from "./screens/Profiles";
import { Practice, League, Shop, Profile, Stories, Roleplay, Friends, Notifications } from "./screens/Screens";

const NAV: { id: Route; icon: IconName }[] = [
  { id: "learn", icon: "home" }, { id: "practice", icon: "dumbbell" }, { id: "league", icon: "trophy" },
  { id: "shop", icon: "shop" }, { id: "profile", icon: "user" },
];
const MORE: { id: Route; icon: IconName }[] = [
  { id: "stories", icon: "story" }, { id: "roleplay", icon: "video" }, { id: "friends", icon: "users" },
  { id: "notifications", icon: "bell" }, { id: "settings", icon: "gear" },
];
const SCREENS: Record<Route, () => React.ReactNode> = {
  learn: Learn, practice: Practice, league: League, shop: Shop, profile: Profile,
  stories: Stories, roleplay: Roleplay, friends: Friends, notifications: Notifications, settings: Settings,
};

function NavBtn({ id, icon }: { id: Route; icon: IconName }) {
  const { route, go } = useApp();
  const { t } = useTranslation();
  const active = route === id;
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={() => go(id)} aria-current={active ? "page" : "false"}>
      <Icon name={icon} /><span>{t(`nav.${id}`)}</span>
    </button>
  );
}

function BootErrorScreen({ e }: { e: BootError }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const act = (f: () => Promise<void> | void) => async () => { setBusy(true); try { await f(); } catch (x) { console.error(x); setBusy(false); } };
  // Data folder / lock (spec B): retrying is a reload, the boot sequence checks everything again.
  const retry = <button className="btn btn-primary btn-block" disabled={busy} onClick={() => location.reload()}>{t("boot.retry")}</button>;
  if (e.kind === "unreachable" || e.kind === "locked") return (
    <div className="boot-error" role="alert">
      <div className="card od-stack" style={{ "--od-gap": "10px" } as React.CSSProperties}>
        <h3>{t(e.kind === "locked" ? "boot.lockedTitle" : "boot.unreachableTitle", { device: e.detail })}</h3>
        <p className="muted">{t(e.kind === "locked" ? "boot.lockedDesc" : "boot.unreachableDesc")}</p>
        {e.kind === "unreachable" && <pre className="boot-detail">{e.detail}</pre>}
        {retry}
        {e.kind === "locked"
          ? <button className="btn btn-ghost btn-block" disabled={busy} onClick={act(takeOver)}>{t("boot.takeOver")}</button>
          : <button className="btn btn-ghost btn-block" disabled={busy} onClick={act(resetDataDir)}>{t("boot.useDefault")}</button>}
      </div>
    </div>
  );
  const future = e.kind === "future";
  return (
    <div className="boot-error" role="alert">
      <div className="card">
        <h3>{t(future ? "boot.newerTitle" : "boot.failedTitle")}</h3>
        <p className="muted">{t(future ? "boot.newerDesc" : "boot.failedDesc")}</p>
        {!future && <pre className="boot-detail">{e.detail}</pre>}
      </div>
    </div>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const { ready, bootError, profile, route, sheet, openSheet, closeSheet, toastMsg, toastOn, lessonId, endLesson, s, setS, course, logout } = useApp();
  const langName = useLangName();
  const Screen = SCREENS[route];
  const talk = lessonId && /^(chat|call):/.test(lessonId) ? parseTalkId(lessonId) : undefined;
  const badTalk = talk === null;
  useEffect(() => { if (badTalk) endLesson(); }, [badTalk]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && sheet) closeSheet(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet, closeSheet]);

  useEffect(() => {
    sfxState.on = s.soundOn;
    document.documentElement.dataset.motion = s.reduceMotion ? "reduce" : "full";
  }, [s.soundOn, s.reduceMotion]);

  // Quiet update check once per launch, after sign-in so the sheet has somewhere to show.
  useEffect(() => { if (profile) findUpdate().then((u) => u && openSheet(<UpdateSheet update={u} />)); }, [!!profile]);

  // ponytail: a PIN-locked profile never auto-signs in, so its reminder only fires once someone signs in
  useEffect(() => { keepInBackground(!!profile && s.reminderOn); }, [profile?.id, s.reminderOn]);

  // Nudges (Settings → Reminders): up to 3 a day, checked every minute while the app runs, even in the background.
  useEffect(() => {
    if (!profile || !s.reminderOn || !course) return;
    const tick = () => {
      const slot = nudgeDue(s);
      if (slot === null) return;
      const day = today();
      setS((x) => ({ ...x, reminded: `${day}:${slot}` }));
      const { group, i } = nudgeMessage(slot, s.streak, day);
      const vars = { count: s.streak, lang: langName(course.iso) };
      notify(t(`nudges.${group}.${i}.t`, vars), t(`nudges.${group}.${i}.b`, vars));
    };
    tick();
    const h = setInterval(tick, 60_000);
    return () => clearInterval(h);
  }, [profile?.id, s.reminderOn, s.lastActive, s.reminded, s.streak, course?.iso, i18n.language]);

  if (bootError) return <BootErrorScreen e={bootError} />;
  if (!ready) return null;
  return (
    <>
      {!profile ? <ProfileGate /> : <>
      <div className="app">
        <aside className="sidebar" aria-label={t("nav.main")}>
          <div className="logo">sprigo</div>
          <nav>
            {NAV.map((n) => <NavBtn key={n.id} {...n} />)}
            <div style={{ margin: "14px 12px 6px", fontSize: 11, fontWeight: 900, letterSpacing: "1.2px", color: "var(--text-faint)", textTransform: "uppercase" }}>
              {t("nav.more")}
            </div>
            {MORE.map((n) => <NavBtn key={n.id} {...n} />)}
          </nav>
          <button className="nav-item nav-more profile-switch" onClick={logout} title={t("settings.logout")} aria-label={`${profile.name} · ${t("settings.logout")}`}>
            <Avatar p={profile} size={30} /><span className="od-fill">{profile.name}</span><Icon name="swap" />
          </button>
        </aside>
        <main className="main">
          <div className="main-inner">
            <div className="center" tabIndex={-1}><Screen /></div>
            <aside className="rail" aria-label={t("rail.label")}><Rail /></aside>
          </div>
        </main>
      </div>
      <nav className="bottom-nav" aria-label={t("nav.bottom")}>
        {NAV.map((n) => <NavBtn key={n.id} {...n} />)}
      </nav>

      {lessonId && (lessonId.startsWith("story:") ? <Story unitId={lessonId.slice(6)} />
        : /^(chat|call):/.test(lessonId) ? (talk && <Chat key={lessonId} who={talk.who} topic={talk.topic} voice={talk.voice} />) : <Lesson id={lessonId} />)}
      </>}

      <div className={`sheet-scrim ${sheet ? "open" : ""}`} onClick={(e) => e.target === e.currentTarget && closeSheet()}>
        <div className="sheet" role="dialog" aria-modal="true">{sheet}</div>
      </div>
      <div className={`toast ${toastOn ? "show" : ""}`} role="status">{toastMsg}</div>
    </>
  );
}
