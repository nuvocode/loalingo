// Local multi-profile (DECISIONS E4–E5). Not in the design: built from its cards, avatars and sheet.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../icons";
import { useApp } from "../store";
import * as db from "../db";
import type { Profile } from "../db";
import type { Course } from "../course";

const COLORS = ["#12b886", "#4c6ef5", "#b07cf0", "#f4862a", "#e91e63", "#00b8a9", "#f5b014", "#5c6bc0"];
// ponytail: fixed list of native languages the AI can translate into; extend when someone asks.
const NATIVE = ["en", "tr", "de", "fr", "es", "it", "pt", "ru", "ar", "ja", "ko", "zh"];
const gap = (g: string) => ({ "--od-gap": g }) as React.CSSProperties;

export function useLangName() {
  const { i18n } = useTranslation();
  const dn = new Intl.DisplayNames([i18n.language], { type: "language" });
  return (iso: string) => { const n = dn.of(iso) ?? iso; return n[0].toLocaleUpperCase(i18n.language) + n.slice(1); };
}

const Avatar = ({ p, size = 48 }: { p: Pick<Profile, "name" | "color">; size?: number }) => (
  <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: p.color }} aria-hidden="true">{(p.name || "?")[0].toUpperCase()}</span>
);

export function CourseFlag({ c }: { c: Course }) {
  return <span aria-hidden="true">{c.flag ?? c.iso.toUpperCase()}</span>;
}

/** Create (no `initial`) or edit the signed-in profile. */
export function ProfileForm({ initial, onDone }: { initial?: Profile; onDone?: () => void }) {
  const { t, i18n } = useTranslation();
  const { courses, theme, createProfile, updateProfile, toast } = useApp();
  const langName = useLangName();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [native, setNative] = useState(initial?.native_lang ?? (NATIVE.includes(i18n.language) ? i18n.language : "en"));
  const [courseIso, setCourseIso] = useState(courses.find((c) => c.iso !== native)?.iso ?? courses[0]?.iso ?? "");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length > 0 && /^(\d{4})?$/.test(pin) && (initial || courseIso);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (initial) {
        await updateProfile({ name: name.trim(), color, native_lang: native, ...(pin ? { pin } : {}) });
        toast(t("profiles.saved"));
      } else {
        await createProfile({ name: name.trim(), color, native_lang: native, ui_lang: i18n.language, theme, pin: pin || null }, courseIso);
      }
      onDone?.();
    } finally { setBusy(false); }
  };

  return (
    <form className="od-stack" style={gap("14px")} onSubmit={submit}>
      <div className="od-row" style={gap("14px")}>
        <Avatar p={{ name, color }} size={56} />
        <label className="od-field od-fill"><b>{t("profiles.name")}</b>
          <input className="input" value={name} maxLength={24} autoFocus required onChange={(e) => setName(e.target.value)} placeholder={t("profiles.namePlaceholder")} />
        </label>
      </div>
      <div className="od-field"><b>{t("profiles.color")}</b>
        <div className="od-cluster" role="radiogroup" aria-label={t("profiles.color")} style={gap("8px")}>
          {COLORS.map((c) => (
            <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={c} className="swatch" style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
      <label className="od-field"><b>{t("profiles.native")}</b><span className="muted small">{t("profiles.nativeDesc")}</span>
        <select className="select" value={native} onChange={(e) => setNative(e.target.value)}>
          {NATIVE.map((l) => <option key={l} value={l}>{langName(l)}</option>)}
        </select>
      </label>
      {!initial && (
        <label className="od-field"><b>{t("profiles.course")}</b>
          <select className="select" value={courseIso} onChange={(e) => setCourseIso(e.target.value)}>
            {courses.map((c) => <option key={c.iso} value={c.iso}>{c.flag} {langName(c.iso)}</option>)}
          </select>
          {!courses.length && <span className="small" style={{ color: "var(--red)" }}>{t("profiles.noCourses")}</span>}
        </label>
      )}
      <label className="od-field"><b>{t(initial?.pin_hash ? "profiles.pinChange" : "profiles.pin")}</b><span className="muted small">{t("profiles.pinDesc")}</span>
        <input className="input" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" style={{ maxWidth: 140, letterSpacing: 6 }} />
      </label>
      {initial?.pin_hash && (
        <button type="button" className="btn btn-ghost" onClick={async () => { await updateProfile({ pin: null }); toast(t("profiles.pinRemoved")); onDone?.(); }}>
          {t("profiles.pinRemove")}
        </button>
      )}
      <button className="btn btn-primary btn-block" disabled={!valid || busy}>{t(initial ? "profiles.save" : "profiles.create")}</button>
      {onDone && <button type="button" className="btn btn-ghost btn-block" onClick={onDone}>{t("sheet.cancel")}</button>}
    </form>
  );
}

function PinSheet({ p }: { p: Profile }) {
  const { t } = useTranslation();
  const { login, closeSheet } = useApp();
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const change = async (v: string) => {
    v = v.replace(/\D/g, "").slice(0, 4);
    setPin(v); setWrong(false);
    if (v.length < 4) return;
    if (await db.checkPin(p, v)) { closeSheet(); await login(p); }
    else { setWrong(true); setPin(""); }
  };
  return <>
    <div className="od-row" style={gap("12px")}><Avatar p={p} /><h3>{t("profiles.enterPin", { name: p.name })}</h3></div>
    <input className="input" type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={4} value={pin} aria-label={t("profiles.pin")}
      onChange={(e) => change(e.target.value)} placeholder="••••" style={{ margin: "16px 0 8px", width: "100%", textAlign: "center", fontSize: 24, letterSpacing: 12 }} />
    <p className="small" role="alert" style={{ color: "var(--red)", minHeight: 20 }}>{wrong ? t("profiles.pinWrong") : ""}</p>
    <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
  </>;
}

/** Shown when nobody is signed in: pick a profile or create one. */
export function ProfileGate() {
  const { t } = useTranslation();
  const { login, openSheet } = useApp();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => { db.listProfiles().then(setProfiles); }, []);
  if (!profiles) return null;
  const create = creating || profiles.length === 0;
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px" }}>
      <div className="logo" style={{ textAlign: "center", marginBottom: 12 }}>loalingo</div>
      <h1 className="section-title" style={{ textAlign: "center", marginTop: 0 }}>{t(create ? (profiles.length ? "profiles.newTitle" : "profiles.welcome") : "profiles.who")}</h1>
      {create ? (
        <div className="card"><ProfileForm onDone={profiles.length ? () => setCreating(false) : undefined} /></div>
      ) : (
        <div className="od-stack" style={gap("12px")}>
          {profiles.map((p) => (
            <button key={p.id} className="card row-item" onClick={() => p.pin_hash ? openSheet(<PinSheet p={p} />) : login(p)}>
              <Avatar p={p} />
              <span className="od-field od-fill"><b>{p.name}</b></span>
              {p.pin_hash && <span className="muted" aria-label={t("profiles.locked")} style={{ width: 22, height: 22, display: "inline-flex" }}><Icon name="lock" size={22} /></span>}
            </button>
          ))}
          <button className="btn btn-ghost btn-block" onClick={() => setCreating(true)}>+ {t("profiles.add")}</button>
        </div>
      )}
    </main>
  );
}

/** Enrolled courses + "add a language" (DECISIONS E5). Opened from the rail flag chip and Settings. */
export function CourseSheet() {
  const { t } = useTranslation();
  const { courses, enrollments, enrollment, switchCourse, closeSheet, toast } = useApp();
  const langName = useLangName();
  const pick = async (c: Course) => {
    await switchCourse(c.iso);
    closeSheet();
    toast(t("profiles.switched", { course: langName(c.iso) }));
  };
  const enrolled = enrollments.map((e) => ({ e, c: courses.find((c) => c.iso === e.course_iso) })).filter((x) => x.c);
  const others = courses.filter((c) => !enrollments.some((e) => e.course_iso === c.iso));
  return <>
    <h3>{t("profiles.myCourses")}</h3>
    <div className="od-stack" style={{ ...gap("10px"), margin: "12px 0 18px" }}>
      {enrolled.map(({ e, c }) => (
        <button key={e.id} className="card row-item" onClick={() => pick(c!)} aria-current={e.id === enrollment?.id}>
          <span style={{ fontSize: 28 }}><CourseFlag c={c!} /></span>
          <span className="od-field od-fill"><b>{langName(c!.iso)}</b><span className="muted small">{e.level} · {e.xp} XP</span></span>
          {e.id === enrollment?.id && <span style={{ color: "var(--green)", width: 24, height: 24, display: "inline-flex" }}><Icon name="check" size={24} /></span>}
        </button>
      ))}
    </div>
    <h3>{t("profiles.addCourse")}</h3>
    <div className="od-stack" style={{ ...gap("10px"), margin: "12px 0 18px" }}>
      {others.length ? others.map((c) => (
        <button key={c.iso} className="card row-item" onClick={() => pick(c)}>
          <span style={{ fontSize: 28 }}><CourseFlag c={c} /></span>
          <span className="od-field od-fill"><b>{langName(c.iso)}</b><span className="muted small">{c.native_name}</span></span>
          <span className="btn btn-ghost" style={{ pointerEvents: "none" }}>{t("profiles.start")}</span>
        </button>
      )) : <p className="muted small">{t("profiles.noMoreCourses")}</p>}
    </div>
    <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
  </>;
}
