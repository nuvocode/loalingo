import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "./icons";
import { useApp, type BootError, type Route } from "./store";
import { Rail } from "./Rail";
import { Lesson, sfxState } from "./Lesson";
import { reminderDue, today } from "./progress";
import { keepInBackground, notify } from "./notify";
import { takeOver, resetDataDir } from "./datadir";
import { findUpdate, UpdateSheet } from "./Update";
import { Chat, Story } from "./Talk";
import type { CharacterId } from "./lessons";
import { Learn } from "./screens/Learn";
import { Settings } from "./screens/Settings";
import { ProfileGate } from "./screens/Profiles";
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
  const { t } = useTranslation();
  const { ready, bootError, profile, route, sheet, openSheet, closeSheet, toastMsg, toastOn, lessonId, s, setS } = useApp();
  const Screen = SCREENS[route];

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

  // Daily reminder (Settings): checked every minute while the app runs, even in the background.
  useEffect(() => {
    if (!profile || !s.reminderOn) return;
    const tick = () => {
      if (!reminderDue(s)) return;
      setS((x) => ({ ...x, remindedDay: today() }));
      notify(t("settings.reminderTitle"), t(s.streak ? "settings.reminderStreak" : "settings.reminderBody", { count: s.streak }));
    };
    tick();
    const h = setInterval(tick, 60_000);
    return () => clearInterval(h);
  }, [profile?.id, s.reminderOn, s.reminderTime, s.lastActive, s.remindedDay, s.streak]);

  if (bootError) return <BootErrorScreen e={bootError} />;
  if (!ready) return null;
  return (
    <>
      {!profile ? <ProfileGate /> : <>
      <div className="app">
        <aside className="sidebar" aria-label={t("nav.main")}>
          <div className="logo">loalingo</div>
          <nav>
            {NAV.map((n) => <NavBtn key={n.id} {...n} />)}
            <div style={{ margin: "14px 12px 6px", fontSize: 11, fontWeight: 900, letterSpacing: "1.2px", color: "var(--text-faint)", textTransform: "uppercase" }}>
              {t("nav.more")}
            </div>
            {MORE.map((n) => <NavBtn key={n.id} {...n} />)}
          </nav>
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
        : /^(chat|call):/.test(lessonId) ? <Chat who={lessonId.slice(5) as CharacterId} voice={lessonId.startsWith("call:")} /> : <Lesson id={lessonId} />)}
      </>}

      <div className={`sheet-scrim ${sheet ? "open" : ""}`} onClick={(e) => e.target === e.currentTarget && closeSheet()}>
        <div className="sheet" role="dialog" aria-modal="true">{sheet}</div>
      </div>
      <div className={`toast ${toastOn ? "show" : ""}`} role="status">{toastMsg}</div>
    </>
  );
}
