import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import i18n from "./i18n";
import { useTheme, type ThemePref } from "./theme";
import { parseCourse, levelsOf, chestId, checkpointId, type Cefr, type Course } from "./course";
import * as db from "./db";
import { activateConfig, loadAiConfig, saveAiConfig, type AiConfig } from "./ai";
import type { Enrollment, Profile, Stats } from "./db";
import { rollDay, today } from "./progress";

export type Route = "learn" | "practice" | "league" | "shop" | "profile" | "stories" | "roleplay" | "friends" | "notifications" | "settings";
const ROUTES: Route[] = ["learn", "practice", "league", "shop", "profile", "stories", "roleplay", "friends", "notifications", "settings"];
const readRoute = (): Route => {
  const r = location.hash.slice(1) as Route;
  return ROUTES.includes(r) ? r : "learn";
};

// Bundled courses + user courses from `<app data>/courses` (DECISIONS B3). A user file with the same iso wins.
const BUNDLED = import.meta.glob<string>("../courses/*.{yml,yaml}", { query: "?raw", import: "default", eager: true });
async function loadCourses() {
  const files: [string, string][] = Object.entries(BUNDLED).map(([p, text]) => [p.split("/").pop()!, text]);
  if (db.isTauri) files.push(...await invoke<[string, string][]>("list_user_courses").catch((e) => [["courses/", `!${e}`]] as [string, string][]));
  const byIso = new Map<string, Course>(), errors: string[] = [];
  for (const [name, text] of files) {
    try {
      if (text.startsWith("!")) throw new Error(`${name}: ${text.slice(1)}`);
      const c = parseCourse(text, name);
      byIso.set(c.iso, c);
    } catch (e) { errors.push((e as Error).message); }
  }
  return { courses: [...byIso.values()], errors };
}

export const LAST_PROFILE = "last_profile";

type Ctx = {
  ready: boolean;
  ai: AiConfig | null; setAi: (c: AiConfig) => Promise<void>;
  courses: Course[]; courseErrors: string[];
  profile: Profile | null; enrollments: Enrollment[];
  enrollment: Enrollment | null; course: Course | null; done: Set<string>; legendary: Set<string>;
  login: (p: Profile) => Promise<void>; logout: () => Promise<void>;
  createProfile: (p: db.NewProfile, courseIso: string) => Promise<void>;
  updateProfile: (patch: Parameters<typeof db.updateProfile>[1]) => Promise<void>;
  switchCourse: (iso: string) => Promise<void>;
  completeStep: (stepId: string, xp: number) => Promise<void>;
  gainXp: (xp: number) => Promise<void>;
  /** Mastery lesson passed: the (done) step turns gold. */
  markLegendary: (stepId: string) => Promise<void>;
  /** Checkpoint / level test passed: every node of `level` done, enrollment moves to the next level. */
  completeLevel: (level: Cefr, xp: number) => Promise<void>;
  viewLevel: Cefr | null; setViewLevel: (l: Cefr | null) => void;
  s: Stats; setS: (f: (s: Stats) => Stats) => void; xp: number;
  route: Route; go: (r: Route) => void;
  toast: (msg: string) => void; toastMsg: string; toastOn: boolean;
  sheet: ReactNode; openSheet: (n: ReactNode) => void; closeSheet: () => void;
  lessonId: string | null; startLesson: (id: string) => void; endLesson: () => void;
  theme: ThemePref; setTheme: (t: ThemePref) => void;
};

const C = createContext<Ctx>(null!);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [ai, setAiState] = useState<AiConfig | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseErrors, setCourseErrors] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [legendary, setLegendary] = useState<Set<string>>(new Set());
  const [viewLevel, setViewLevel] = useState<Cefr | null>(null);
  const [route, setRoute] = useState(readRoute);
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const [sheet, setSheet] = useState<ReactNode>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [theme, applyTheme] = useTheme();
  const toastT = useRef<number>(undefined);

  // If the active course's file is gone or broken, fall back to another enrolled course that loaded.
  const usable = enrollments.filter((e) => courses.some((c) => c.iso === e.course_iso));
  const enrollment = usable.find((e) => e.id === profile?.active_enrollment_id) ?? usable[0] ?? null;
  const course = courses.find((c) => c.iso === enrollment?.course_iso) ?? null;
  useEffect(() => { if (enrollment) { db.doneSteps(enrollment.id).then(setDone); db.legendarySteps(enrollment.id).then(setLegendary); } }, [enrollment?.id]);

  // Loads everything that belongs to a profile (E6) and applies its UI prefs.
  const login = useCallback(async (p: Profile) => {
    const fresh = (await db.getProfile(p.id))!;
    const stats = rollDay(fresh.stats, today());
    if (stats !== fresh.stats) { fresh.stats = stats; await db.updateProfile(p.id, { stats }); }
    setEnrollments(await db.listEnrollments(p.id));
    setViewLevel(null);
    setProfile(fresh);
    applyTheme(fresh.theme);
    i18n.changeLanguage(fresh.ui_lang);
    await db.setSetting(LAST_PROFILE, String(p.id));
  }, [applyTheme]);

  useEffect(() => {
    (async () => {
      const cfg = await loadAiConfig();
      await activateConfig(cfg);
      setAiState(cfg);
      const { courses, errors } = await loadCourses();
      setCourses(courses); setCourseErrors(errors);
      errors.forEach((e) => console.error(e));
      // Auto sign-in to the last profile unless it is PIN-locked.
      const last = Number(await db.getSetting(LAST_PROFILE));
      const p = last ? await db.getProfile(last) : null;
      if (p && !p.pin_hash) await login(p);
      setReady(true);
    })();
  }, [login]);

  useEffect(() => {
    const on = () => { setRoute(readRoute()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg); setToastOn(true);
    clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToastOn(false), 2200);
  }, []);

  const firstLevel = (iso: string) => levelsOf(courses.find((c) => c.iso === iso)!)[0];

  const value: Ctx = {
    ready, ai,
    setAi: async (c) => { await saveAiConfig(c); await activateConfig(c); setAiState(c); },
    courses, courseErrors, profile, enrollments, enrollment, course, done, legendary,
    login,
    logout: async () => {
      await db.setSetting(LAST_PROFILE, null);
      setProfile(null); setEnrollments([]); setSheet(null); setLessonId(null);
      location.hash = "learn";
    },
    createProfile: async (p, iso) => {
      const id = await db.createProfile(p, iso, firstLevel(iso));
      await login((await db.getProfile(id))!);
      location.hash = ai ? "learn" : "settings";
    },
    updateProfile: async (patch) => {
      if (!profile) return;
      await db.updateProfile(profile.id, patch);
      setProfile((await db.getProfile(profile.id))!);
    },
    switchCourse: async (iso) => {
      if (!profile) return;
      const id = await db.enroll(profile.id, iso, firstLevel(iso));
      setEnrollments(await db.listEnrollments(profile.id));
      setViewLevel(null);
      setProfile((p) => p && { ...p, active_enrollment_id: id });
    },
    completeStep: async (stepId, xp) => {
      if (!enrollment) return;
      await db.markDone(enrollment.id, stepId);
      if (xp) await db.addXp(enrollment.id, xp);
      setDone((d) => new Set(d).add(stepId));
      setEnrollments((es) => es.map((e) => e.id === enrollment.id ? { ...e, xp: e.xp + xp } : e));
    },
    gainXp: async (xp) => {
      if (!enrollment || !xp) return;
      await db.addXp(enrollment.id, xp);
      setEnrollments((es) => es.map((e) => e.id === enrollment.id ? { ...e, xp: e.xp + xp } : e));
    },
    markLegendary: async (stepId) => {
      if (!enrollment) return;
      await db.markLegendary(enrollment.id, stepId);
      setLegendary((l) => new Set(l).add(stepId));
    },
    completeLevel: async (level, xp) => {
      if (!enrollment || !course) return;
      const levels = levelsOf(course), def = course.levels[level]!;
      const ids = [...def.units.flatMap((u) => [...u.steps.map((st) => st.id), chestId(u.id)]), checkpointId(level)];
      // Only move forward: passing an earlier level's test again must not pull the enrollment back.
      const next = levels[levels.indexOf(level) + 1] ?? null;
      const moveTo = next && levels.indexOf(next) > levels.indexOf(enrollment.level) ? next : null;
      await db.completeLevel(enrollment.id, ids, moveTo);
      if (xp) await db.addXp(enrollment.id, xp);
      setDone((d) => new Set([...d, ...ids]));
      setEnrollments((es) => es.map((e) => e.id === enrollment.id ? { ...e, xp: e.xp + xp, level: moveTo ?? e.level } : e));
      setViewLevel(null);
    },
    viewLevel, setViewLevel,
    s: profile?.stats ?? db.NEW_STATS,
    setS: (f) => setProfile((p) => {
      if (!p) return p;
      const stats = f(p.stats);
      db.updateProfile(p.id, { stats });
      return { ...p, stats };
    }),
    xp: enrollments.reduce((a, e) => a + e.xp, 0), // E6: total XP = sum over courses
    route, go: (r) => { location.hash = r; },
    toast, toastMsg, toastOn,
    sheet, openSheet: setSheet, closeSheet: () => setSheet(null),
    lessonId, startLesson: setLessonId, endLesson: () => setLessonId(null),
    theme,
    setTheme: (t) => { applyTheme(t); if (profile) value.updateProfile({ theme: t }); },
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
