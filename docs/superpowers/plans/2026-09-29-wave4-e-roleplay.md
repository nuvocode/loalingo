# Dalga 4 / E — Rol Yapma Implementation Plan

**Goal:** Rol Yapma bir kişi listesi olur: 6 karakter (3 kadın, 3 erkek), her birinin kişiliği ve 4–6 konusu var. Sohbet/Ara önce konu seçtirir (ya da serbest konu), karakter kendi cinsiyetine uygun sesle konuşur.

**Architecture:**
- `src/characters.ts` (yeni, saf, testli): `CHARACTERS` + `CharacterId` + `Topic` tipleri; `lessons.ts`'teki `CHARACTERS` buraya taşınır (`lessons.ts` yeniden dışa aktarmaz, import'lar güncellenir).
  ```ts
  export type Topic = { id: string; goal: string }; // başlık i18n: roleplay.topics.<charId>.<topicId>
  export type Character = { name: string; gender: "f" | "m"; color: string; kokoroVoice: string; persona: string; topics: Topic[] };
  export const CHARACTERS = { mia: {...}, kai: {...}, nora: {...}, tom: {...}, emma: {...}, leo: {...} } satisfies Record<string, Character>;
  export type CharacterId = keyof typeof CHARACTERS;
  /** `chat:<id>:<topicId>` ya da `chat:<id>:free:<metin>` (call: için aynı). */
  export function parseTalkId(id: string): { voice: boolean; who: CharacterId; topic: { id?: string; goal: string } } | null;
  export function talkId(voice: boolean, who: CharacterId, topic: string | { free: string }): string;
  ```
  - Karakterler (spec E): otel resepsiyonisti **Mia** (K), şef **Kai** (E), doktor **Nora** (K), ev sahibi **Tom** (E), iş görüşmecisi **Emma** (K), tur rehberi **Leo** (E).
  - Renkler palet değişkenleri, mor yok: Mia `var(--green)`, Kai `var(--blue)`, Nora `var(--orange)`, Tom `var(--gold-dark)`, Emma `var(--red)`, Leo `var(--green-dark)`.
  - `kokoroVoice`: kurulu `kokoro-js` ses listesinden (`af_*`/`bf_*` kadın, `am_*`/`bm_*` erkek), her karaktere farklı ses; en az birer İngiliz (`bf_`/`bm_`) ses.
  - `persona`: İngilizce 2–3 cümle (meslek, konuşma tarzı, huy); karakterler birbirinden belirgin farklı (ör. "sabırsız ama yardımsever", "esprili, uzun cümleler kurar").
  - `topics`: 4–6 konu; `goal` İngilizce, prompt'a girer (ör. `check in and ask for a room`). Eski `lily`/`kai` hedefleri Mia/Kai'nin ilk konusu olur.
- `src/lessons.ts`: `chatTurn(c, who, topic, history)` — sistem prompt'una `persona` ve hedef girer. Serbest konuda hedef `have a natural conversation about: <metin>`; serbest konuda `goal_reached` hiçbir zaman gerekli değil (prompt: "false unless the learner clearly wraps up").
- `src/screens/Screens.tsx` `Roleplay`: satır = avatar (renk + baş harf), isim, "Sohbet" ve "Ara". İsim altında rol yazmaz. Butonlar `TopicSheet`'i açar (`openSheet`): konu listesi (butonlar) + "Kendi konunu yaz" metin alanı + Başla. Seçim → `start(talkId(...))`. Ara'da `useSpeakBlock` kontrolü sheet açılmadan önce kalır.
- `src/App.tsx`: `/^(chat|call):/` dalı `parseTalkId` kullanır; geçersiz kimlik → `endLesson()`.
- `src/Talk.tsx` `Chat`: `topic` prop'u; başlıkta isim + seçilen konunun başlığı (serbestse metnin kendisi). Tüm `speak(...)` çağrıları `{ gender: ch.gender, kokoro: ch.kokoroVoice }` ile.
- Metinler `en.json` + `tr.json`: `roleplay.lilyRole/lilyGoal/kaiRole/kaiGoal` silinir; `roleplay.topics.<char>.<topic>` başlıkları, `roleplay.pickTopic`, `roleplay.ownTopic`, `roleplay.ownTopicPlaceholder`, `roleplay.start`. `locales.test.ts`'e `Lily` yasaklı kelime olarak eklenir.

## Global Constraints

- İsim kuralı: kısa, Türkçe konuşan biri için de kolay okunur; Duolingo karakter adlarıyla (Bea, Eddy, Falstaff, Junior, Lily, Lin, Lucy, Oscar, Vikram, Zari) çakışmaz.
- `lily` kimliği `mia` olur. Kayıtlı veride karakter kimliği yok (`lessonId` yalnız bellekte) — migration gerekmez; yine de `grep -rn lily src` boş kalmalı.
- `node --test` type-stripping kuralları; `characters.ts` tarayıcı API'si import etmez.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Tasks

1. Plan (bu dosya) — commit.
2. `characters.ts` + `characters.test.ts`: 6 karakter, 3 K / 3 E; `kokoroVoice` öneki cinsiyetle uyumlu ve benzersiz; her karakterde 4–6 konu, benzersiz konu kimlikleri; her konu başlığının `en.json` ve `tr.json`'da anahtarı var; `parseTalkId(talkId(...))` gidiş-dönüş (serbest metinde `:` ve Türkçe karakterler dahil); bozuk kimlik → `null`. `lessons.ts` taşıma + `chatTurn` imzası — commit.
3. Liste ekranı + `TopicSheet` + `App.tsx` + `Talk.tsx` + metinler — commit.

Her görevden sonra: `pnpm test`, `pnpm -s tsc --noEmit -p .`.

## Doğrulama

- Tarayıcı önizlemesi: Rol Yapma listesinde 6 kişi, rol yazısı yok; Sohbet → konu sheet'i → bir konu → karakter açılış cümlesi konuya uygun (gerçek AI: Ollama). Serbest konu ile de bir tur.
- Ses: erkek karakterde sistem sesi erkek/alçak, Kokoro seçiliyken karakterin Kokoro sesi.
