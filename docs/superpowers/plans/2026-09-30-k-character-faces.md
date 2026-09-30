# K — Katmanlı çizgi karakter yüzleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rol Yapma karakterleri, SVG parçalardan birleşen, göz kırpan / düşünen / sesle ağız oynatan omuz üstü çizgi yüzlerle görünür.

**Architecture:** Parçalar `src/face/parts.tsx`'te React/SVG olarak, yüz tanımları saf veri olarak `src/characters.ts`'te. `src/face/Face.tsx` parçaları üst üste koyar ve animasyonu CSS değişkenleriyle sürer (`--blink`, `--mouth`, `--look-x/y`, `--brow`); React her karede render etmez. Ağız açıklığı `src/tts.ts`'teki `onMouth` aboneliğinden gelir (Kokoro: `AnalyserNode` RMS; sistem sesi: 3 Hz ritim), yumuşatma `src/audio.ts`'teki saf `mouthLevel`'da.

**Tech Stack:** React 19 + TS, SVG, CSS custom properties, Web Audio `AnalyserNode`, `node --test`.

**Spec:** [2026-09-30-k-character-faces-design.md](../specs/2026-09-30-k-character-faces-design.md)

## Global Constraints

- `node --test` type-stripping: parametre property yok, göreli importlarda `.ts` uzantısı (test dosyalarında), `window`'a dokunan modüllerden testlerde yalnız `import type`. `characters.ts` ve `audio.ts` saf kalır (DOM/React yok).
- Tuval `viewBox="0 0 200 200"`. Paletler: `SKIN` 5 ton (indeks 0–4), `HAIR` 6 renk (0 siyah, 1 koyu kahve, 2 kahve, 3 sarı, 4 kızıl, 5 gri). Kaş ve sakal saç rengini kullanır. Kıyafet rengi karakterin `color`'ı (`--c`).
- Boyutlar: liste 56, Sohbet 96, Ara 220 (px).
- Durumlar: `idle` (2–6 sn rastgele kırpma, 120 ms), `thinking` (`--look-x: 4px; --look-y: -3px; --brow: -3px`, 200 ms geçiş), `talking` (`--mouth` sesten).
- `prefers-reduced-motion: reduce`: kırpma ve göz/kaş kayması yok; ağız 0 ya da 0.5.
- Lig, arkadaşlar, profil avatarları değişmez. Yeni kullanıcı metni yok (i18n değişmez).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Her görevden sonra: `pnpm test` ve `pnpm -s tsc --noEmit -p .` temiz.

**Spec'ten bilinçli sapma:** Katman sırasında boyun kıyafetten önce çizilir (spec: kıyafet → boyun). Kıyafetin yaka kenarı boynun alt ucunu örtmeli; ters sırada boyun yakanın üstüne biner.

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `src/audio.ts` (değişir) | `mouthLevel` — RMS → 0–1 ağız açıklığı, yumuşatmalı |
| `src/audio.test.ts` (değişir) | `mouthLevel` testleri |
| `src/characters.ts` (değişir) | `FaceSpec` tipi, her karaktere `face` |
| `src/characters.test.ts` (değişir) | yüz tanımı geçerlilik + farklılık testi |
| `src/tts.ts` (değişir) | `AnalyserNode`, `onMouth` |
| `src/face/parts.tsx` (yeni) | paletler, parça varyantları, `FaceArt` (katman sırası) |
| `src/face/Face.tsx` (yeni) | `<Face>`: kap, kırpma zamanlayıcısı, `onMouth` aboneliği |
| `src/styles.css` (değişir) | `.face` kuralları |
| `src/screens/Screens.tsx` (değişir) | Rol Yapma listesi 56 px yüz |
| `src/Talk.tsx` (değişir) | Sohbet 96 px, Ara 220 px yüz + durum |

---

### Task 1: `mouthLevel` (saf yumuşatma)

**Files:**
- Modify: `src/audio.ts` (sona ekle)
- Test: `src/audio.test.ts`

**Interfaces:**
- Produces: `export function mouthLevel(prev: number, rms: number, dt: number): number` — `dt` saniye; dönüş 0–1.

- [ ] **Step 1: Failing test** — `src/audio.test.ts` import satırını `import { mouthLevel, remember, resample } from "./audio.ts";` yap, sona ekle:

```ts
test("mouthLevel opens on loud speech, closes in silence, opens faster than it closes", () => {
  let v = 0;
  for (let i = 0; i < 12; i++) v = mouthLevel(v, 0.3, 1 / 60); // 0.2 s loud
  assert.ok(v > 0.95, `open ${v}`);
  for (let i = 0; i < 60; i++) v = mouthLevel(v, 0, 1 / 60); // 1 s silence
  assert.ok(v < 0.01, `closed ${v}`);
  assert.equal(mouthLevel(0.4, 0.01, 0), 0.4); // no time, no change
  const opened = mouthLevel(0, 1, 0.05), closed = 1 - mouthLevel(1, 0, 0.05);
  assert.ok(opened > closed, `${opened} vs ${closed}`);
});
```

- [ ] **Step 2: Run** `node --test src/audio.test.ts` → FAIL (`mouthLevel` is not exported).

- [ ] **Step 3: Implement** — `src/audio.ts` sonuna:

```ts

/** Speech loudness (RMS of the last audio frame) → mouth openness 0..1. Opens fast, closes slower so it doesn't flicker. */
export function mouthLevel(prev: number, rms: number, dt: number): number {
  const target = Math.min(1, Math.max(0, (rms - 0.02) / 0.18)); // ~0.02 is silence, ~0.2 a loud syllable
  const tau = target > prev ? 0.04 : 0.12; // seconds
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}
```

- [ ] **Step 4: Run** `pnpm test` → PASS; `pnpm -s tsc --noEmit -p .` → temiz.

- [ ] **Step 5: Commit**

```bash
git add src/audio.ts src/audio.test.ts
git commit -m "Add mouthLevel: speech loudness to mouth openness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `FaceSpec` ve karakter yüzleri

**Files:**
- Modify: `src/characters.ts:1-3` (tip), her karakter nesnesi (`face` alanı)
- Test: `src/characters.test.ts`

**Interfaces:**
- Produces: `export type FaceSpec` (aşağıdaki gibi); `Character.face: FaceSpec`; `CHARACTERS[k].face`.

- [ ] **Step 1: Failing test** — `src/characters.test.ts` sonuna:

```ts
test("every character has a valid, distinct face", () => {
  const faces = ids.map((k) => CHARACTERS[k].face);
  for (const [i, f] of faces.entries()) {
    assert.ok(Number.isInteger(f.skin) && f.skin >= 0 && f.skin <= 4, ids[i]);
    assert.ok(Number.isInteger(f.hairColor) && f.hairColor >= 0 && f.hairColor <= 5, ids[i]);
  }
  assert.equal(new Set(faces.map((f) => JSON.stringify(f))).size, faces.length);
});
```

- [ ] **Step 2: Run** `node --test src/characters.test.ts` → FAIL (`Cannot read properties of undefined (reading 'skin')`).

- [ ] **Step 3: Implement** — `src/characters.ts` ilk üç satırı şununla değiştir:

```ts
// Roleplay cast (spec E). Pure data, no browser APIs: goals and personas are English prompt text, topic titles live in i18n as roleplay.topics.<char>.<topic>.
export type Topic = { id: string; goal: string };
/** Which parts and colors make up a character's cartoon bust (spec K). Parts are drawn in src/face/parts.tsx. */
export type FaceSpec = {
  head: "round" | "oval" | "square"; ears: "small" | "big"; eyes: "round" | "almond" | "sleepy";
  brows: "flat" | "arched" | "thick"; nose: "button" | "long" | "wide"; mouth: "small" | "wide" | "smile";
  hair: "short" | "bun" | "long" | "curly" | "ponytail" | "bald"; facialHair: "none" | "beard" | "mustache";
  outfit: "shirt" | "chef" | "coat" | "blazer" | "tshirt"; accessory: "none" | "glasses" | "chefHat" | "cap" | "earrings";
  skin: number; hairColor: number; // SKIN 0–4, HAIR 0–5; brows and facial hair use the hair color
};
export type Character = { name: string; gender: "f" | "m"; color: string; kokoroVoice: string; persona: string; face: FaceSpec; topics: Topic[] };
```

Her karakterde `kokoroVoice` satırının hemen altına `face` ekle:

```ts
    // mia
    face: { head: "oval", ears: "small", eyes: "almond", brows: "arched", nose: "button", mouth: "smile", hair: "bun", facialHair: "none", outfit: "shirt", accessory: "earrings", skin: 1, hairColor: 2 },
    // kai
    face: { head: "round", ears: "big", eyes: "round", brows: "thick", nose: "wide", mouth: "wide", hair: "short", facialHair: "mustache", outfit: "chef", accessory: "chefHat", skin: 3, hairColor: 0 },
    // nora
    face: { head: "oval", ears: "small", eyes: "round", brows: "flat", nose: "long", mouth: "small", hair: "ponytail", facialHair: "none", outfit: "coat", accessory: "none", skin: 0, hairColor: 4 },
    // tom
    face: { head: "square", ears: "big", eyes: "sleepy", brows: "thick", nose: "wide", mouth: "small", hair: "bald", facialHair: "beard", outfit: "tshirt", accessory: "none", skin: 2, hairColor: 5 },
    // emma
    face: { head: "square", ears: "small", eyes: "almond", brows: "flat", nose: "long", mouth: "small", hair: "long", facialHair: "none", outfit: "blazer", accessory: "glasses", skin: 4, hairColor: 0 },
    // leo
    face: { head: "round", ears: "small", eyes: "round", brows: "arched", nose: "button", mouth: "smile", hair: "curly", facialHair: "none", outfit: "tshirt", accessory: "cap", skin: 2, hairColor: 3 },
```

(`// mia` gibi yorumlar yalnız bu planda yer gösterir; koda yazılmaz.)

- [ ] **Step 4: Run** `pnpm test` → PASS; `pnpm -s tsc --noEmit -p .` → temiz (`satisfies Record<string, Character>` eksik `face`'i yakalar).

- [ ] **Step 5: Commit**

```bash
git add src/characters.ts src/characters.test.ts
git commit -m "Give each roleplay character a face spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `onMouth` — sesten ağız açıklığı

**Files:**
- Modify: `src/tts.ts`

**Interfaces:**
- Consumes: `mouthLevel(prev, rms, dt)` (Task 1).
- Produces: `export function onMouth(cb: (open: number) => void): () => void` — dönen fonksiyon aboneliği bitirir. Abone varken her animasyon karesinde çağrılır.

- [ ] **Step 1: Import** — `src/tts.ts`'teki `import { remember } from "./audio";` satırını değiştir:

```ts
import { mouthLevel, remember } from "./audio";
```

- [ ] **Step 2: Analizör** — `let next = 0;` satırının üstüne ekle:

```ts
let analyser: AnalyserNode | undefined; // Kokoro audio passes through it so faces can read the loudness
const out = (ctx: AudioContext) => {
  if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.connect(ctx.destination); }
  return analyser;
};
```

`viaKokoro` içindeki `play` fonksiyonunda `src.connect(ctx.destination);` satırını değiştir:

```ts
    src.connect(out(ctx));
```

- [ ] **Step 3: `onMouth`** — dosyanın sonuna ekle:

```ts

// ---- Mouth: how open a talking face's mouth is, 0..1, every animation frame ----
const mouthSubs = new Set<(open: number) => void>();
const frame = new Float32Array(1024);
let raf = 0, lastT = 0, level = 0;

function tick(t: number) {
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
  lastT = t;
  let rms = 0;
  // The system voice gives no audio to measure: a steady ~3 syllables per second while it speaks.
  if (speechSynthesis.speaking) rms = 0.02 + 0.18 * (0.5 + 0.5 * Math.sin((2 * Math.PI * 3 * t) / 1000));
  else if (analyser) {
    analyser.getFloatTimeDomainData(frame);
    rms = Math.sqrt(frame.reduce((n, x) => n + x * x, 0) / frame.length);
  }
  level = mouthLevel(level, rms, dt);
  mouthSubs.forEach((f) => f(level));
  raf = requestAnimationFrame(tick);
}

/** Calls `cb` with the mouth openness every frame until the returned function is called. */
export function onMouth(cb: (open: number) => void) {
  mouthSubs.add(cb);
  if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
  return () => {
    mouthSubs.delete(cb);
    if (!mouthSubs.size) { cancelAnimationFrame(raf); raf = 0; level = 0; }
  };
}
```

- [ ] **Step 4: Run** `pnpm -s tsc --noEmit -p .` → temiz; `pnpm test` → PASS.

- [ ] **Step 5: Tarayıcı kontrolü** — `preview_start` `web` (localhost:1420). Konsolda (tts ayarı `kokoro` iken; önizleme DB'sinde `(await import("/src/db.ts")).setSetting("tts","kokoro")`):

```js
const T = await import("/src/tts.ts"); const seen = [];
const off = T.onMouth((v) => seen.push(v));
await T.speak("Hello there. Rent is due on Friday.", "en-US", { gender: "m", kokoro: "bm_george" });
off(); ({ max: Math.max(...seen), minAfterFirstOpen: Math.min(...seen.slice(seen.findIndex((v) => v > 0.5))) })
```

Beklenen: `max > 0.8`, `minAfterFirstOpen < 0.05` (cümle arası sessizlikte kapanıyor). Bittiğinde ayarı `null`'a geri al.

- [ ] **Step 6: Commit**

```bash
git add src/tts.ts
git commit -m "Expose mouth openness from speech with onMouth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Parçalar, `<Face>` ve Rol Yapma listesi

**Files:**
- Create: `src/face/parts.tsx`, `src/face/Face.tsx`
- Modify: `src/styles.css` (sona ekle), `src/screens/Screens.tsx:297-301`

**Interfaces:**
- Consumes: `FaceSpec`, `CHARACTERS[k].face` (Task 2); `onMouth` (Task 3).
- Produces:
  - `parts.tsx`: `export const SKIN: string[]`, `export const HAIR: string[]`, `export function FaceArt({ spec }: { spec: FaceSpec })`.
  - `Face.tsx`: `export type FaceState = "idle" | "thinking" | "talking"`, `export function Face(props: { spec: FaceSpec; color: string; size: number; label: string; state?: FaceState })`.

- [ ] **Step 1: `src/face/parts.tsx`**

```tsx
// Cartoon bust parts (spec K) on a 200×200 canvas, stacked back to front by FaceArt.
// Animated layers read CSS variables set by Face.tsx: .lid (--blink), .pupil (--look-x/y), .brows (--brow), .mouth-open (--mouth).
import type { FaceSpec } from "../characters";

export const SKIN = ["#f8d5c2", "#eab896", "#c98e68", "#9a6443", "#6b4230"];
export const HAIR = ["#1f1a17", "#4a2e1f", "#7a4a2a", "#e3b75a", "#b5452a", "#b8b8b8"];
const LINE = "#2b2320", MOUTH = "#6b2430", WHITE = "#f7f4ef", SHADE = "rgba(0,0,0,.14)";
const C = { fill: "var(--c)" }; // the character's color (clothes)
const EYE_Y = 88, EYES_X = [84, 116];

/** `w` = half the head width at the ears. */
const HEADS: Record<FaceSpec["head"], { w: number; el: React.ReactNode }> = {
  round: { w: 40, el: <ellipse cx={100} cy={88} rx={40} ry={42} /> },
  oval: { w: 36, el: <ellipse cx={100} cy={88} rx={36} ry={46} /> },
  square: { w: 38, el: <rect x={62} y={44} width={76} height={88} rx={24} /> },
};

const EARS: Record<FaceSpec["ears"], (w: number) => React.ReactNode> = {
  small: (w) => <><ellipse cx={100 - w + 1} cy={92} rx={6} ry={9} /><ellipse cx={100 + w - 1} cy={92} rx={6} ry={9} /></>,
  big: (w) => <><ellipse cx={100 - w} cy={92} rx={9} ry={12} /><ellipse cx={100 + w} cy={92} rx={9} ry={12} /></>,
};

function Eye({ cx, kind, skin }: { cx: number; kind: FaceSpec["eyes"]; skin: string }) {
  return (
    <g className={`eye ${kind}`}>
      {kind === "almond"
        ? <ellipse cx={cx} cy={EYE_Y} rx={8} ry={5} fill={WHITE} stroke={LINE} strokeWidth={1.5} />
        : <circle cx={cx} cy={EYE_Y} r={kind === "round" ? 7 : 6.5} fill={WHITE} stroke={LINE} strokeWidth={1.5} />}
      <circle className="pupil" cx={cx} cy={EYE_Y} r={kind === "round" ? 3.5 : 3} fill={LINE} />
      {/* The lid scales down from its top; its line sits mid-eye when closed and is flat (invisible) when open. */}
      <g className="lid">
        <rect x={cx - 10} y={EYE_Y - 9} width={20} height={18} fill={skin} />
        <line x1={cx - 8} y1={EYE_Y} x2={cx + 8} y2={EYE_Y} stroke={LINE} strokeWidth={2} strokeLinecap="round" />
      </g>
    </g>
  );
}

const BROWS: Record<FaceSpec["brows"], (cx: number, hair: string) => React.ReactNode> = {
  flat: (cx, hair) => <rect x={cx - 9} y={72} width={18} height={3.5} rx={1.75} fill={hair} />,
  arched: (cx, hair) => <path d={`M${cx - 9} 76 Q${cx} 68 ${cx + 9} 76`} fill="none" stroke={hair} strokeWidth={3.5} strokeLinecap="round" />,
  thick: (cx, hair) => <rect x={cx - 10} y={70} width={20} height={6} rx={3} fill={hair} />,
};

const NOSES: Record<FaceSpec["nose"], React.ReactNode> = {
  button: <ellipse cx={100} cy={102} rx={5} ry={4} fill={SHADE} />,
  long: <path d="M100 90 L96 104 Q100 107 104 104" fill="none" stroke={SHADE} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />,
  wide: <ellipse cx={100} cy={103} rx={8} ry={5} fill={SHADE} />,
};

/** Closed line + an open shape that grows down from its top with --mouth (0 = shut). */
const MOUTHS: Record<FaceSpec["mouth"], { closed: string; open: React.ReactNode }> = {
  small: { closed: "M93 118 Q100 121 107 118", open: <ellipse cx={100} cy={124} rx={6} ry={7} /> },
  wide: { closed: "M88 118 Q100 122 112 118", open: <ellipse cx={100} cy={125} rx={10} ry={8} /> },
  smile: { closed: "M88 116 Q100 128 112 116", open: <path d="M88 116 Q100 134 112 116 Z" /> },
};

/** Hair behind the head (long hair, ponytail) and in front of it (fringe, curls). */
const HAIRS: Record<FaceSpec["hair"], { back?: React.ReactNode; front?: React.ReactNode }> = {
  short: { front: <path d="M60 84 Q58 40 100 38 Q142 40 140 84 Q134 60 100 58 Q66 60 60 84 Z" /> },
  bun: { front: <><circle cx={100} cy={34} r={14} /><path d="M62 80 Q60 42 100 40 Q140 42 138 80 Q130 60 100 58 Q70 60 62 80 Z" /></> },
  long: {
    back: <path d="M56 80 Q56 36 100 36 Q144 36 144 80 L148 150 Q100 160 52 150 Z" />,
    front: <path d="M60 80 Q60 42 100 40 Q140 42 140 80 Q128 56 100 56 Q72 56 60 80 Z" />,
  },
  curly: { front: <>{[[66, 62, 12], [74, 48, 14], [90, 40, 14], [110, 40, 14], [126, 48, 14], [134, 62, 12]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}</> },
  ponytail: {
    back: <path d="M128 50 Q162 58 152 112 Q142 92 124 70 Z" />,
    front: <path d="M62 80 Q60 42 100 40 Q140 42 138 80 Q130 60 100 58 Q70 60 62 80 Z" />,
  },
  bald: {},
};

const FACIAL: Record<FaceSpec["facialHair"], React.ReactNode> = {
  none: null,
  beard: <path d="M62 92 Q62 142 100 148 Q138 142 138 92 Q136 130 114 134 Q100 132 86 134 Q64 130 62 92 Z" />,
  mustache: <path d="M86 113 Q93 108 100 112 Q107 108 114 113 Q107 116 100 114 Q93 116 86 113 Z" />,
};

const SHOULDERS = "M30 200 Q32 160 70 152 L130 152 Q168 160 170 200 Z";
const OUTFITS: Record<FaceSpec["outfit"], React.ReactNode> = {
  shirt: <><path d={SHOULDERS} style={C} /><path d="M86 150 L100 166 L92 150 Z M114 150 L100 166 L108 150 Z" fill={WHITE} /></>,
  chef: <><path d={SHOULDERS} fill={WHITE} />{[170, 184].map((y) => <g key={y} style={C}><circle cx={92} cy={y} r={3} /><circle cx={108} cy={y} r={3} /></g>)}</>,
  coat: <><path d={SHOULDERS} fill={WHITE} /><path d="M88 152 L100 180 L112 152 Z" style={C} /><path d="M88 152 L96 200 M112 152 L104 200" stroke={SHADE} strokeWidth={2} /></>,
  blazer: <><path d={SHOULDERS} style={C} /><path d="M90 152 L100 176 L110 152 Z" fill={WHITE} /><path d="M86 152 L100 190 M114 152 L100 190" stroke={SHADE} strokeWidth={3} /></>,
  tshirt: <><path d={SHOULDERS} style={C} /><path d="M86 152 Q100 164 114 152" fill="none" stroke={SHADE} strokeWidth={3} /></>,
};

const ACCESSORIES: Record<FaceSpec["accessory"], (w: number) => React.ReactNode> = {
  none: () => null,
  glasses: () => (
    <g fill="none" stroke={LINE} strokeWidth={2.5}>
      {EYES_X.map((x) => <circle key={x} cx={x} cy={EYE_Y} r={11} />)}
      <path d="M95 88 Q100 85 105 88" />
    </g>
  ),
  chefHat: () => (
    <g fill={WHITE} stroke="rgba(0,0,0,.1)" strokeWidth={1}>
      <circle cx={80} cy={34} r={14} /><circle cx={120} cy={34} r={14} /><circle cx={100} cy={26} r={16} />
      <rect x={72} y={36} width={56} height={16} rx={3} />
    </g>
  ),
  cap: () => <g style={C}><path d="M60 62 Q60 28 100 28 Q140 28 140 62 Z" /><ellipse cx={116} cy={62} rx={34} ry={6} /></g>,
  earrings: (w) => <g fill="#f5c542">{[100 - w, 100 + w].map((x) => <circle key={x} cx={x} cy={104} r={3} />)}</g>,
};

/** The whole bust, back to front. */
export function FaceArt({ spec }: { spec: FaceSpec }) {
  const skin = SKIN[spec.skin], hair = HAIR[spec.hairColor], head = HEADS[spec.head], hairdo = HAIRS[spec.hair], mouth = MOUTHS[spec.mouth];
  return (
    <>
      <g fill={hair}>{hairdo.back}</g>
      <rect x={88} y={116} width={24} height={44} fill={skin} />
      {OUTFITS[spec.outfit]}
      <g fill={skin}>{EARS[spec.ears](head.w)}{head.el}</g>
      {EYES_X.map((x) => <Eye key={x} cx={x} kind={spec.eyes} skin={skin} />)}
      <g className="brows">{EYES_X.map((x) => <g key={x}>{BROWS[spec.brows](x, hair)}</g>)}</g>
      {NOSES[spec.nose]}
      <path d={mouth.closed} fill="none" stroke={LINE} strokeWidth={2.5} strokeLinecap="round" />
      <g className="mouth-open" fill={MOUTH}>{mouth.open}</g>
      <g fill={hair}>{FACIAL[spec.facialHair]}</g>
      <g fill={hair}>{hairdo.front}</g>
      {ACCESSORIES[spec.accessory](head.w)}
    </>
  );
}
```

- [ ] **Step 2: `src/face/Face.tsx`**

```tsx
// A character's animated bust (spec K): blinks while idle, glances up while thinking, moves its mouth with the voice.
// Animation writes CSS variables on the root element, so React never re-renders per frame.
import { useEffect, useRef } from "react";
import type { FaceSpec } from "../characters";
import { onMouth } from "../tts";
import { FaceArt } from "./parts";

export type FaceState = "idle" | "thinking" | "talking";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Face({ spec, color, size, label, state = "idle" }: { spec: FaceSpec; color: string; size: number; label: string; state?: FaceState }) {
  const ref = useRef<HTMLSpanElement>(null);
  const set = (k: string, v: string) => ref.current?.style.setProperty(k, v);

  useEffect(() => { // own random timer, so faces in a list don't blink together
    if (reduced()) return;
    let t = 0;
    const next = () => {
      t = window.setTimeout(() => {
        set("--blink", "1");
        t = window.setTimeout(() => { set("--blink", "0"); next(); }, 120);
      }, 2000 + Math.random() * 4000);
    };
    next();
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state !== "talking") return;
    const r = reduced();
    const off = onMouth((v) => set("--mouth", String(r ? (v > 0.25 ? 0.5 : 0) : v)));
    return () => { off(); set("--mouth", "0"); };
  }, [state]);

  return (
    <span ref={ref} className={`face ${state}`} role="img" aria-label={label} style={{ width: size, height: size, "--c": color } as React.CSSProperties}>
      <svg viewBox="0 0 200 200" aria-hidden="true"><FaceArt spec={spec} /></svg>
    </span>
  );
}
```

- [ ] **Step 3: CSS** — `src/styles.css` sonuna:

```css
/* Character faces (spec K): parts in src/face/parts.tsx, variables set by src/face/Face.tsx */
.face{--blink:0;--mouth:0;--look-x:0px;--look-y:0px;--brow:0px;display:block;flex:none;border-radius:50%;overflow:hidden;background:color-mix(in srgb,var(--c) 30%,var(--surface))}
.face svg{display:block;width:100%;height:100%}
.face .lid,.face .mouth-open{transform-box:fill-box;transform-origin:50% 0}
.face .lid{transform:scaleY(var(--blink));transition:transform 60ms}
.face .eye.sleepy .lid{transform:scaleY(max(var(--blink),.35))}
.face .mouth-open{transform:scaleY(var(--mouth))}
.face .pupil{transform:translate(var(--look-x),var(--look-y));transition:transform .2s}
.face .brows{transform:translateY(var(--brow));transition:transform .2s}
.face.thinking{--look-x:4px;--look-y:-3px;--brow:-3px}
@media (prefers-reduced-motion:reduce){.face .pupil,.face .brows{transform:none}}
```

- [ ] **Step 4: Rol Yapma listesi** — `src/screens/Screens.tsx` başına import ekle (diğer göreli importların yanına):

```tsx
import { Face } from "../face/Face";
```

297–301. satırlarda:

```tsx
          const { name, color } = CHARACTERS[k];
```
→
```tsx
          const { name, color, face } = CHARACTERS[k];
```
ve
```tsx
              <span className="avatar" style={{ width: 56, height: 56, fontSize: 22, background: color }}>{name[0]}</span>
```
→
```tsx
              <Face spec={face} color={color} size={56} label={name} />
```

- [ ] **Step 5: Run** `pnpm -s tsc --noEmit -p .` → temiz; `pnpm test` → PASS.

- [ ] **Step 6: Görsel kontrol** — `preview_start` `web`, `#roleplay`'e git, ekran görüntüsü al. Kontrol listesi:
  - 6 yüz görünüyor, birbirinden ayırt ediliyor, meslekler okunuyor (şapka, önlük, gözlük…).
  - Hiçbir parça dairenin dışına taşıp kesilmiş görünmüyor (aşçı şapkası dahil); kulaklar saçın/kafanın doğru arkasında.
  - Göz kapakları açıkken görünmüyor; Tom'un (`sleepy`) gözü yarı kapalı.
  - Kırpma: konsolda `document.querySelectorAll(".face")` üzerinde 8 sn boyunca `getComputedStyle(el).getPropertyValue("--blink")` 50 ms'de bir örneklenir; her yüz en az bir kez `1` olur ve en az iki yüzün `1` olduğu anlar farklıdır.
  - Açık ve koyu temada fon rengi okunaklı (`resize_window` `colorScheme`).
  - Bir parça çirkin/yanlış duruyorsa yalnız o parçanın koordinatları düzeltilir (spec: atamalar ve çizim görsel kontrolle ayarlanabilir).

- [ ] **Step 7: Commit**

```bash
git add src/face src/styles.css src/screens/Screens.tsx
git commit -m "Draw roleplay characters as layered cartoon faces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sohbet ve Ara modunda yüz + durum

**Files:**
- Modify: `src/Talk.tsx` (import; `Chat` içindeki başlık satırı ~258–261)

**Interfaces:**
- Consumes: `Face`, `FaceState` (Task 4); `Chat`'teki mevcut `busy`, `voicing`, `voice`, `ch`, `topic`, `who`.

- [ ] **Step 1: Import** — `src/Talk.tsx` importlarına:

```tsx
import { Face, type FaceState } from "./face/Face";
```

- [ ] **Step 2: Başlık** — `Chat` içinde `let body: React.ReactNode, footer: React.ReactNode;` satırının üstüne:

```tsx
  const faceState: FaceState = busy ? "thinking" : voicing !== null ? "talking" : "idle";
  const topicLabel = topic.id ? t(`roleplay.topics.${who}.${topic.id}`) : topic.goal.slice(FREE_GOAL.length);
```

Başlık bloğunu:

```tsx
      <div className="od-row" style={{ ...gap("12px"), marginBottom: 16 }}>
        <span className="avatar" style={{ width: 48, height: 48, fontSize: 20, background: ch.color }}>{ch.name[0]}</span>
        <span className="od-field od-fill"><b>{ch.name}</b><span className="muted small">{topic.id ? t(`roleplay.topics.${who}.${topic.id}`) : topic.goal.slice(FREE_GOAL.length)}</span></span>
      </div>
```

şununla değiştir (Ara: ortada büyük yüz; Sohbet: başlıkta orta yüz):

```tsx
      {voice ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 16, textAlign: "center" }}>
          <Face spec={ch.face} color={ch.color} size={220} label={ch.name} state={faceState} />
          <b>{ch.name}</b><span className="muted small">{topicLabel}</span>
        </div>
      ) : (
        <div className="od-row" style={{ ...gap("12px"), marginBottom: 16 }}>
          <Face spec={ch.face} color={ch.color} size={96} label={ch.name} state={faceState} />
          <span className="od-field od-fill"><b>{ch.name}</b><span className="muted small">{topicLabel}</span></span>
        </div>
      )}
```

- [ ] **Step 3: Run** `pnpm -s tsc --noEmit -p .` → temiz; `pnpm test` → PASS.

- [ ] **Step 4: Tarayıcı kontrolü** (`web` önizlemesi, tts `kokoro`; bitince `null`'a geri al):
  - Sohbet (Mia, check-in): açılışta yüz `thinking` sınıfında (`document.querySelector(".lesson-overlay .face").className`), cevap gelince `talking`, ses bitince `idle`. Her geçişte ekran görüntüsü.
  - Konuşurken `--mouth` 50 ms'de bir örneklenir: en az bir değer > 0.5 ve cümle arasında < 0.05.
  - Ara modu (`ARA` butonu; mikrofon izni sorulursa önizlemede yüz ve yerleşim yine görünür): 220 px yüz ortada, balonlar altında, mikrofon butonu yerinde. Ekran görüntüsü.
  - Mobil genişlikte (`resize_window` `mobile`) Ara yüzü taşmıyor, yatay kaydırma yok; sonra `desktop`'a dön.

- [ ] **Step 5: Commit**

```bash
git add src/Talk.tsx
git commit -m "Show the animated face in chats and calls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec kapsamı

| Spec maddesi | Görev |
|---|---|
| Parça yuvaları, varyantlar, katman sırası, animasyon katmanları | 4 |
| Paletler, kaş/sakal saç rengi | 4 |
| `FaceSpec` + 6 atama | 2 |
| `<Face>` durumlar, kırpma, hareket azaltma | 4 |
| `mouthLevel` | 1 |
| `AnalyserNode`, `onMouth`, sistem sesi ritmi | 3 |
| Liste 56 / Sohbet 96 / Ara 220, durumu belirleme | 4, 5 |
| Testler | 1, 2 (+ görsel 3–5) |
