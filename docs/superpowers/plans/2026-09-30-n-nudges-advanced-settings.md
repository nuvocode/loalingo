# N — Gün içi hatırlatmalar ve Gelişmiş ayarlar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hatırlatma saati kalksın; uygulama günde 3 kez, o gün çalışılmadıysa, arayüz diline göre esprili mesajlarla derse çağırsın. Yapay zeka ve ses ile Veri bölümleri "Gelişmiş" altında kapalı dursun.

**Architecture:** Zamanlama ve mesaj seçimi saf `src/nudge.ts`'de (league.ts'in `rng`'sini kullanır). `App.tsx` dakikalık tikte `nudgeDue` sorar, `nudgeMessage` ile locale'den `nudges.<group>.<i>.t/b` okur ve `notify` çağırır. `Stats`'ta `reminderTime`/`remindedDay` yerine `reminded: "YYYY-MM-DD:slot"`. Eski profiller `{ ...NEW_STATS, ...stored }` ile yüklendiği için yeni alan kendiliğinden gelir.

**Tech Stack:** TypeScript, React 19, i18next, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-30-n-nudges-advanced-settings-design.md`

## Global Constraints

- Aralıklar 10:00, 15:00, 19:30; her biri güne göre sabit ±30 dk kayar.
- O gün `lastActive === bugün` ise hiç bildirim yok; kaçan aralıklardan yalnız en sonuncusu gönderilir; bir aralık bir kez.
- Mesaj grupları: `general` 6, `streak` 4, `evening` 2; `{{lang}}` = çalışılan dilin arayüz dilindeki adı, `{{count}}` = seri.
- Bahçe dili: kullanıcıya görünen metinde seri = kök (tr'de "seri", en'de "streak" vb. yasak; `locales.test.ts` denetler).
- Gelişmiş bölümü: ilk durum `useState(!ai)`, kaydedilmez; Güncellemeler ve Hesap hep görünür.
- Commit trailer tam olarak: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Komutlar: `pnpm test`, `pnpm -s tsc --noEmit -p .`

---

### Task 1: Locale metinleri

**Files:**
- Modify: `src/locales/{tr,en,de,es,fr}.json` (betikle)

**Interfaces:**
- Produces: `nudges.general[0..5]`, `nudges.streak[0..3]`, `nudges.evening[0..1]` (her biri `{ t, b }`), `settings.advanced`, yeni `settings.reminder`/`reminderDesc` metinleri. Kaldırılır: `settings.reminderTime`, `reminderTimeDesc`, `reminderTitle`, `reminderBody`, `reminderStreak_*`.

- [ ] **Step 1: Betiği çalıştır.** Aşağıdaki betiği repo dışına (ör. `$TMPDIR/n-locales.py`) kaydet ve repo kökünden `python3 $TMPDIR/n-locales.py` ile çalıştır. Dosyalar `json.dumps(indent=2, ensure_ascii=False)` biçiminde olduğu için yalnız ilgili satırlar değişir. Betiği commit etme.

```python
import json
M = lambda *pairs: [{"t": t, "b": b} for t, b in pairs]
DATA = {
 "tr": dict(
  reminder="Hatırlatmalar",
  reminderDesc="Sprigo gün içinde birkaç kez seni derse çağırır; o gün çalıştıysan susar. Açıkken arka planda kalır.",
  advanced="Gelişmiş",
  general=M(("Bugün hangi kelime seni bekliyor? 🌱", "{{lang}} kendi kendine öğrenilmiyor. Beş dakika yeter."),
            ("Çay demlenene kadar bir ders?", "Kısa bir ders, büyük bir fark. Hadi başla."),
            ("Sprigo seni özledi", "{{lang}} kelimelerin biraz yalnız kaldı. Uğrar mısın?"),
            ("Beş dakikan var mı?", "Bir ders bitir, günün geri kalanı senin."),
            ("Küçük adım, büyük dil", "Bugün {{lang}} için tek bir ders bile sayılır."),
            ("Beyin jimnastiği zamanı 🧠", "Birkaç soru, birkaç kelime. Kolay gelsin!")),
  streak=M(("Köklerin su istiyor 💧", "{{count}} gündür kök salıyorsun. Bugün de bir ders yeter."),
           ("Zinciri koparma!", "{{count}} günlük emeğin boşa gitmesin. Kısa bir ders yeter."),
           ("Filizin büyüyor", "{{count}} gündür buradasın. Bugün de gel, bahçen sevinsin."),
           ("Bir ders, bir gün daha", "Kök sayacın {{count}} gösteriyor. Bir tane daha ekle?")),
  evening=M(("Gece yarısına az kaldı ⏰", "{{count}} günlük köklerin kurumasın. Hemen bir ders?"),
            ("Günün son çağrısı", "Yatmadan önce kısa bir ders, {{count}} günlük köklerin için."))),
 "en": dict(
  reminder="Reminders",
  reminderDesc="Sprigo nudges you a few times a day and goes quiet once you've practiced. While on, it stays in the background.",
  advanced="Advanced",
  general=M(("What word is waiting for you today? 🌱", "{{lang}} won't learn itself. Five minutes is plenty."),
            ("A lesson while the kettle boils?", "Short lesson, big difference. Let's go."),
            ("Sprigo misses you", "Your {{lang}} words are feeling a little lonely. Drop by?"),
            ("Got five minutes?", "Finish one lesson and the rest of the day is yours."),
            ("Small steps, big language", "Even one {{lang}} lesson today counts."),
            ("Brain workout time 🧠", "A few questions, a few words. You've got this!")),
  streak=M(("Your roots are thirsty 💧", "Root count: {{count}}. One lesson keeps them growing."),
           ("Don't break the chain!", "Your root count is {{count}}. Don't let it slip — one short lesson will do."),
           ("Your sprout is growing", "Root count: {{count}} and climbing. Come back today and make your garden happy."),
           ("One lesson, one more day", "Your root counter says {{count}}. Add one more?")),
  evening=M(("Midnight is close ⏰", "Root count {{count}} — don't let them dry out. Quick lesson?"),
            ("Last call for today", "One short lesson before bed keeps your root count at {{count}} and growing."))),
 "de": dict(
  reminder="Erinnerungen",
  reminderDesc="Sprigo erinnert dich ein paarmal am Tag und ist still, sobald du geübt hast. Wenn aktiv, läuft es im Hintergrund.",
  advanced="Erweitert",
  general=M(("Welches Wort wartet heute auf dich? 🌱", "{{lang}} lernt sich nicht von allein. Fünf Minuten reichen."),
            ("Eine Lektion, bis der Tee zieht?", "Kurze Lektion, großer Unterschied. Los geht's."),
            ("Sprigo vermisst dich", "Deine {{lang}}-Vokabeln fühlen sich etwas einsam. Schaust du vorbei?"),
            ("Hast du fünf Minuten?", "Eine Lektion, und der Rest des Tages gehört dir."),
            ("Kleine Schritte, große Sprache", "Heute zählt schon eine einzige Lektion {{lang}}."),
            ("Zeit fürs Gehirnjogging 🧠", "Ein paar Fragen, ein paar Wörter. Du schaffst das!")),
  streak=M(("Deine Wurzeln haben Durst 💧", "Wurzelzähler: {{count}}. Eine Lektion lässt sie weiterwachsen."),
           ("Nicht abreißen lassen!", "Dein Wurzelzähler steht bei {{count}}. Eine kurze Lektion genügt."),
           ("Dein Spross wächst", "Wurzelzähler: {{count}} und steigend. Komm heute wieder, dein Garten freut sich."),
           ("Eine Lektion, ein Tag mehr", "Dein Wurzelzähler zeigt {{count}}. Noch einen dazu?")),
  evening=M(("Bald ist Mitternacht ⏰", "Wurzelzähler {{count}} – lass sie nicht austrocknen. Schnell eine Lektion?"),
            ("Letzter Aufruf für heute", "Eine kurze Lektion vor dem Schlafen, und dein Wurzelzähler bleibt bei {{count}} und wächst."))),
 "es": dict(
  reminder="Recordatorios",
  reminderDesc="Sprigo te avisa varias veces al día y se calla cuando ya has practicado. Mientras esté activado, sigue en segundo plano.",
  advanced="Avanzado",
  general=M(("¿Qué palabra te espera hoy? 🌱", "{{lang}} no se aprende solo. Con cinco minutos basta."),
            ("¿Una lección mientras se hace el té?", "Lección corta, gran diferencia. ¡Vamos!"),
            ("Sprigo te echa de menos", "{{lang}} te extraña: tus palabras se sienten algo solas. ¿Te pasas?"),
            ("¿Tienes cinco minutos?", "Termina una lección y el resto del día es tuyo."),
            ("Pasos pequeños, gran idioma", "{{lang}} de hoy: una sola lección ya cuenta."),
            ("Hora de gimnasia mental 🧠", "Unas preguntas, unas palabras. ¡Tú puedes!")),
  streak=M(("Tus raíces tienen sed 💧", "Contador de raíces: {{count}}. Una lección las mantiene creciendo."),
           ("¡No rompas la cadena!", "Tu contador de raíces está en {{count}}. Basta con una lección corta."),
           ("Tu brote está creciendo", "Contador de raíces: {{count}} y subiendo. Vuelve hoy y alegra tu jardín."),
           ("Una lección, un día más", "Tu contador de raíces marca {{count}}. ¿Sumas uno más?")),
  evening=M(("Falta poco para medianoche ⏰", "Contador de raíces: {{count}}. Que no se sequen. ¿Una lección rápida?"),
            ("Última llamada de hoy", "Una lección corta antes de dormir y tu contador de raíces sigue en {{count}} y creciendo."))),
 "fr": dict(
  reminder="Rappels",
  reminderDesc="Sprigo te fait signe plusieurs fois par jour et se tait dès que tu as pratiqué. Quand il est activé, il reste en arrière-plan.",
  advanced="Avancé",
  general=M(("Quel mot t'attend aujourd'hui ? 🌱", "{{lang}} ne s'apprend pas tout seul. Cinq minutes suffisent."),
            ("Une leçon le temps que le thé infuse ?", "Leçon courte, grande différence. C'est parti !"),
            ("Sprigo s'ennuie de toi", "{{lang}} t'attend : tes mots se sentent un peu seuls. Tu passes ?"),
            ("Tu as cinq minutes ?", "Termine une leçon, et le reste de la journée est à toi."),
            ("Petits pas, grande langue", "{{lang}} du jour : une seule leçon compte déjà."),
            ("C'est l'heure de la gym cérébrale 🧠", "Quelques questions, quelques mots. Tu vas assurer !")),
  streak=M(("Tes racines ont soif 💧", "Compteur de racines : {{count}}. Une leçon les fait pousser."),
           ("Ne casse pas la chaîne !", "Ton compteur de racines est à {{count}}. Une petite leçon suffit."),
           ("Ta pousse grandit", "Compteur de racines : {{count}} et ça monte. Reviens aujourd'hui, ton jardin sera ravi."),
           ("Une leçon, un jour de plus", "Ton compteur de racines affiche {{count}}. On en ajoute un ?")),
  evening=M(("Minuit approche ⏰", "Compteur de racines : {{count}}. Ne les laisse pas sécher. Une leçon rapide ?"),
            ("Dernier appel pour aujourd'hui", "Une petite leçon avant de dormir, et ton compteur de racines reste à {{count}} et grandit."))),
}
DROP = ("reminderTime", "reminderTimeDesc", "reminderTitle", "reminderBody")
for lang, d in DATA.items():
    p = f"src/locales/{lang}.json"
    o = json.load(open(p, encoding="utf-8"))
    st = o["settings"]
    for k in [k for k in st if k in DROP or k.startswith("reminderStreak_")]:
        del st[k]
    st["reminder"], st["reminderDesc"] = d["reminder"], d["reminderDesc"]
    items = list(st.items())  # settings.advanced goes right after settings.aiVoice
    i = [k for k, _ in items].index("aiVoice") + 1
    o["settings"] = dict(items[:i] + [("advanced", d["advanced"])] + items[i:])
    o["nudges"] = {g: d[g] for g in ("general", "streak", "evening")}
    open(p, "w", encoding="utf-8").write(json.dumps(o, ensure_ascii=False, indent=2) + "\n")
```

- [ ] **Step 2: Doğrula.** `git diff --stat src/locales` yalnız 5 locale dosyasını göstermeli. Run: `node --test src/locales.test.ts` → hepsi pass (anahtar eşliği, yer tutucular, bahçe dili).

- [ ] **Step 3: Commit**

```bash
git add src/locales
git commit -m "Add playful nudge messages and advanced settings label

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Günde 3 hatırlatma

**Files:**
- Create: `src/nudge.ts`, `src/nudge.test.ts`
- Modify: `src/league.ts` (`rng`'yi export et)
- Modify: `src/progress.ts` (Stats alanları, `reminderDue` silinir)
- Modify: `src/progress.test.ts` ("daily reminder fires once…" testi silinir)
- Modify: `src/App.tsx` (dakikalık tik)
- Modify: `src/screens/Settings.tsx` (saat satırı silinir)

**Interfaces:**
- Consumes: Task 1'in `nudges.*` anahtarları.
- Produces: `SLOTS`, `NUDGES`, `slotTimes(day)`, `nudgeDue(s, now?) => number | null`, `nudgeMessage(slot, streak, day) => { group, i }`; `Stats.reminded: string`.

- [ ] **Step 1: Test.** `src/nudge.test.ts` oluştur:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NUDGES, SLOTS, nudgeDue, nudgeMessage, slotTimes } from "./nudge.ts";
import { NEW_STATS } from "./progress.ts";

const DAY = "2026-03-05";
const at = (h: number, m = 0) => new Date(2026, 2, 5, h, m);
const on = { ...NEW_STATS, reminderOn: true };

test("three slots a day, near 10:00 / 15:00 / 19:30, stable for the day", () => {
  for (const day of ["2026-03-05", "2026-03-29", "2026-10-25", "2026-12-31"]) {
    const ts = slotTimes(day);
    assert.deepEqual(ts, slotTimes(day));
    const [y, m, d] = day.split("-").map(Number);
    ts.forEach((t, i) => {
      const base = new Date(y, m - 1, d, 0, SLOTS[i]).getTime();
      assert.ok(Math.abs(t - base) <= 30 * 60_000, `${day} slot ${i}`);
      if (i) assert.ok(t > ts[i - 1]);
    });
  }
});

test("nudgeDue: the latest due slot, once, only on days without practice", () => {
  const [s0, s1, s2] = slotTimes(DAY);
  assert.equal(nudgeDue(on, new Date(s0 - 60_000)), null, "before the first slot");
  assert.equal(nudgeDue(on, new Date(s0)), 0);
  assert.equal(nudgeDue({ ...on, reminded: `${DAY}:0` }, new Date(s0 + 60_000)), null, "already sent");
  assert.equal(nudgeDue({ ...on, reminded: `${DAY}:0` }, new Date(s1)), 1);
  assert.equal(nudgeDue(on, new Date(s2)), 2, "missed slots don't pile up");
  assert.equal(nudgeDue({ ...on, reminded: `${DAY}:2` }, at(23, 59)), null);
  assert.equal(nudgeDue({ ...on, reminded: "2026-03-04:2" }, new Date(s0)), 0, "yesterday's send doesn't count");
  assert.equal(nudgeDue({ ...on, lastActive: DAY }, at(20)), null, "practiced today");
  assert.equal(nudgeDue(NEW_STATS, at(20)), null, "reminders off");
});

test("nudgeMessage: roots only with a streak, evening last call, no repeats in a day", () => {
  for (let d = 1; d <= 28; d++) {
    const day = `2026-02-${String(d).padStart(2, "0")}`;
    for (const streak of [0, 5]) {
      const picks = [0, 1, 2].map((slot) => nudgeMessage(slot, streak, day));
      picks.forEach(({ group, i }) => assert.ok(i >= 0 && i < NUDGES[group]));
      if (!streak) assert.ok(picks.every((p) => p.group === "general"));
      else assert.equal(picks[2].group, "evening");
      assert.equal(new Set(picks.map((p) => `${p.group}${p.i}`)).size, 3, day);
    }
  }
});

test("every locale has exactly NUDGES messages per group, each with a title and body", () => {
  for (const l of ["en", "tr", "de", "es", "fr"]) {
    const n = JSON.parse(readFileSync(new URL(`./locales/${l}.json`, import.meta.url), "utf8")).nudges;
    for (const [g, count] of Object.entries(NUDGES)) {
      assert.equal(n[g].length, count, `${l} ${g}`);
      for (const m of n[g]) assert.ok(m.t.trim() && m.b.trim(), `${l} ${g}`);
    }
  }
});
```

- [ ] **Step 2:** `node --test src/nudge.test.ts` → FAIL (`./nudge.ts` yok).

- [ ] **Step 3: `src/league.ts`:** `function rng(seed: string) {` satırını `export function rng(seed: string) {` yap.

- [ ] **Step 4: `src/nudge.ts` oluştur:**

```ts
// Nudges (Settings → Reminders): up to 3 notifications a day inviting the learner to study, quiet once they have. Pure, tested by src/nudge.test.ts.
import { rng } from "./league.ts";
import { today, type Stats } from "./progress.ts";

export const SLOTS = [600, 900, 1170]; // 10:00, 15:00, 19:30, in minutes after midnight
export const NUDGES = { general: 6, streak: 4, evening: 2 } as const; // message counts per group in locales `nudges.*`
export type NudgeGroup = keyof typeof NUDGES;

/** Today's nudge times (ms), each shifted up to ±30 min; the same all day. */
export function slotTimes(day: string) {
  const r = rng(`nudge:${day}`), [y, m, d] = day.split("-").map(Number);
  return SLOTS.map((min) => new Date(y, m - 1, d, 0, min + Math.round(r() * 60 - 30)).getTime());
}

/** The slot to send now, or null: reminders off, practiced today, nothing due yet, or already sent. Missed slots don't pile up: only the latest is sent. */
export function nudgeDue(s: Stats, now = new Date()): number | null {
  const day = today(now);
  if (!s.reminderOn || s.lastActive === day) return null;
  const due = slotTimes(day).filter((at) => at <= now.getTime()).length - 1;
  if (due < 0) return null;
  const [sentDay, sent] = s.reminded.split(":");
  return sentDay === day && Number(sent) >= due ? null : due;
}

/** Which message a slot shows: evening "last call" when there are roots to keep, else roots or general; a day's slots never repeat one. */
export function nudgeMessage(slot: number, streak: number, day: string): { group: NudgeGroup; i: number } {
  const base = Math.floor(rng(`msg:${day}`)() * 60);
  const group: NudgeGroup = streak > 0 && slot === 2 ? "evening" : streak > 0 && rng(`msg:${day}:${slot}`)() < 0.5 ? "streak" : "general";
  return { group, i: (base + slot) % NUDGES[group] };
}
```

- [ ] **Step 5: `src/progress.ts`:**
  - `Stats` içinde `reminderOn: boolean; reminderTime: string; remindedDay: string; // daily reminder, "HH:MM" local` satırını şununla değiştir: `reminderOn: boolean; reminded: string; // nudges: last sent "YYYY-MM-DD:slot"`
  - `NEW_STATS` içinde `reminderOn: false, reminderTime: "19:00", remindedDay: "",` → `reminderOn: false, reminded: "",`
  - `/** Daily reminder: … */ export const reminderDue = …` bloğunu (3 satır) sil.

- [ ] **Step 6: `src/progress.test.ts`:** `test("daily reminder fires once, after its time, only on days without practice", …)` testini tamamen sil (yerini `nudge.test.ts` aldı).

- [ ] **Step 7: `src/App.tsx`:**
  - Import: `import { reminderDue, today } from "./progress";` → `import { today } from "./progress";` ve altına `import { nudgeDue, nudgeMessage } from "./nudge";`. `import { ProfileGate } from "./screens/Profiles";` → `import { ProfileGate, useLangName } from "./screens/Profiles";`
  - `App()` içindeki `useApp()` destructure'ına `course` ekle; hemen altına `const langName = useLangName();`
  - "Daily reminder (Settings)" effect'ini tamamen şununla değiştir:

```tsx
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
  }, [profile?.id, s.reminderOn, s.lastActive, s.reminded, s.streak, course?.iso]);
```

- [ ] **Step 8: `src/screens/Settings.tsx`:** `{s.reminderOn && ( <label …> … reminderTime … </label> )}` bloğunu tamamen sil. `ToggleRow k="reminder"` ve `reminderBlocked` uyarısı kalır.

- [ ] **Step 9: Doğrula.** `grep -rn "reminderTime\|remindedDay\|reminderDue\|reminderTitle\|reminderBody\|reminderStreak" src` → sonuç yok. `pnpm test` → hepsi pass; `pnpm -s tsc --noEmit -p .` → temiz.

- [ ] **Step 10: Commit**

```bash
git add src/nudge.ts src/nudge.test.ts src/league.ts src/progress.ts src/progress.test.ts src/App.tsx src/screens/Settings.tsx
git commit -m "Nudge three times a day instead of at a fixed reminder time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gelişmiş bölümü

**Files:**
- Modify: `src/screens/Settings.tsx` (`Settings()`)

**Interfaces:**
- Consumes: Task 1'in `settings.advanced` anahtarı.

- [ ] **Step 1:** `Settings()` içinde `const cap = …` satırının altına:

```tsx
  const [advanced, setAdvanced] = useState(!ai); // AI not set up yet → open, so its warning stays visible
```

- [ ] **Step 2:** `<h2 className="section-title">{t("settings.aiVoice")}</h2>`'dan `<DataSection />`'a kadar olan kısmı (ikisi dahil) şu yapıya al; içerik aynen korunur:

```tsx
      <button className="btn btn-ghost btn-block" style={{ marginTop: 24 }} aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)}>
        {t("settings.advanced")} <span aria-hidden="true">{advanced ? "▴" : "▾"}</span>
      </button>
      {advanced && (
        <>
          {/* mevcut aiVoice başlığı + od-stack + <DataSection /> buraya, değiştirmeden */}
        </>
      )}
```

- [ ] **Step 3: Doğrula.** `pnpm test`, `pnpm -s tsc --noEmit -p .` → temiz.

- [ ] **Step 4: Tarayıcı önizlemesi** (`preview_start` name `web`, Ayarlar ekranı):
  - Genel bölümünde saat alanı yok, "Hatırlatmalar" düğmesi ve yeni açıklaması var.
  - Yapay zeka kuruluysa Gelişmiş kapalı; tıklayınca "Yapay zekâ ve ses" ile Veri bölümü açılıyor, tekrar tıklayınca kapanıyor.
  - Güncellemeler ve Hesap her durumda görünüyor. Konsolda hata yok.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Settings.tsx
git commit -m "Tuck AI, voice and data settings under Advanced

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
