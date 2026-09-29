import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "./icons";
import { useApp, type Route } from "./store";
import { Rail } from "./Rail";
import { Lesson, sfxState } from "./Lesson";
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

export default function App() {
  const { t } = useTranslation();
  const { ready, profile, route, sheet, closeSheet, toastMsg, toastOn, lessonId, s } = useApp();
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
        : lessonId.startsWith("chat:") ? <Chat who={lessonId.slice(5) as CharacterId} /> : <Lesson id={lessonId} />)}
      </>}

      <div className={`sheet-scrim ${sheet ? "open" : ""}`} onClick={(e) => e.target === e.currentTarget && closeSheet()}>
        <div className="sheet" role="dialog" aria-modal="true">{sheet}</div>
      </div>
      <div className={`toast ${toastOn ? "show" : ""}`} role="status">{toastMsg}</div>
    </>
  );
}
