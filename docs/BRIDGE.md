# Sprigo ↔ Verba köprüsü

**Durum:** Plan · **Kapsam:** iki repo (`nuvocode/sprigo`, `nuvocode/verba`) · **Relay:** Sprigo projesi, "Köprü" fazları

## 0. Neden

- **Sprigo** yapıyı öğretir: CEFR müfredatı, dilbilgisi kalıpları, kelime, kısa alıştırmalar.
- **Verba** o yapıyı gerçek konuşmada kullandırır: koç, günlük plan, onarım ve akıcılık.

Bugün iki uygulama birbirinden habersiz. Öğrenci Sprigo'da "third conditional"ı bitirir, Verba ise o gün ilgi alanlarından rastgele bir konu açar. Köprünün tek işi şu cümleyi mümkün kılmaktır:

> "Bu hafta Sprigo'da *Regrets & Hypotheticals* ünitesini bitirdin. Bugünkü konuşmamız bir pişmanlık hikâyesi; third conditional kullanmanı bekleyeceğim."

Ters yönde de Verba'nın gördüğü zayıflık Sprigo'da tekrar dersine dönüşür.

## 1. İlkeler

1. **Yerel ve sunucusuz.** İki uygulama da local-first. Köprü de bir dosyadır; ağ yoktur, hesap yoktur.
2. **Opt-in.** İki tarafta da varsayılan kapalıdır. Açılınca ne paylaşıldığı ayarlarda tek satırla görünür.
3. **Kanıt Verba'nındır.** Sprigo verisi Verba'nın `signals` tablosuna yazılmaz. Verba'nın zayıflık kanıtı yalnızca kendi gözlemidir (`useDay.ts:312`). Sprigo verisi *öneri* düzeyindedir: tema, hedef ve aday kelime.
4. **Tek yönlü dosyalar.** Her uygulama yalnızca kendi dosyasını yazar ve karşı tarafınkini okur. Birleştirme ve çakışma çözümü yoktur.
5. **Sürümlü sözleşme.** `format` alanı. Okuyan taraf daha yeni bir `format`ı reddeder ve bilmediği alanları yok sayar.
6. **Bozulursa sessizce eskiye döner.** Dosya yoksa, bozuksa ya da dil uymuyorsa iki uygulama da köprü yokmuş gibi davranır. Ayarlarda nedeni yazılır.

## 2. Taşıma: paylaşılan klasör

```
<dataDir>/nuvocode/bridge/
  sprigo.json   ← Sprigo yazar, Verba okur
  verba.json      ← Verba yazar, Sprigo okur (Faz D)
```

`dataDir` şu yerlere karşılık gelir (Tauri `path::data_dir`):

| Platform | Klasör |
|---|---|
| macOS | `~/Library/Application Support` |
| Windows | `%APPDATA%` |
| Linux | `~/.local/share` |

- **Yazma:** `<dosya>.tmp`'ye yazılır, ardından `rename` edilir (atomik). Okuyan taraf yarım dosya görmez.
- **Okuma zamanı:** Verba gün planını kurarken okur (`useDay`: yeni gün ve konu değiştirme). Sprigo açılışta ve Pratik ekranı açılırken okur. Dosya izleyici yoktur. *ponytail:* gün planı günde bir kurulduğu için izlemeye gerek yok.
- **Neden bu yol:**
  - Verba'nın yedek ve sync klasörü tam durum anlık görüntüsüdür, yabancı bir dosya veri silebilir.
  - "Brought content" yapısız ve tek seferliktir.
  - Derin bağlantı için eklenti, capability ve handler gerekir, üstelik sürekli senkron sağlamaz.

## 3. Sözleşme

### 3.1 `sprigo.json` (format 1)

```jsonc
{
  "app": "sprigo", "format": 1, "appVersion": "0.2.0",
  "exportedAt": "2026-10-02T18:04:00Z",
  "learner": { "name": "Özer", "native": "tr", "target": "en", "level": "B2" },
  // Son 14 gün, en fazla 20 adım, en yeniden eskiye
  "recent": [{
    "at": "2026-10-02T17:55:00Z", "cefr": "B2",
    "unit": { "id": "regrets-and-hypotheticals", "title": "Regrets & Hypotheticals" },
    "step": { "id": "third-conditional", "title": "Third Conditional" },
    "grammar": ["If I had studied harder, I would have passed the exam."],
    "vocab": [{ "term": "regret", "translation": "pişmanlık" }]
  }],
  // mistakes tablosundan adıma göre toplanmış, son 30 gün, en fazla 10 kayıt
  "struggles": [{
    "step": { "id": "third-conditional", "title": "Third Conditional" },
    "grammar": ["If I had studied harder, I would have passed the exam."],
    "count": 4, "lastAt": "2026-10-02T17:50:00Z",
    "examples": [{ "given": "If I would have known…", "expected": "If I had known…" }]  // en fazla 2
  }],
  // words tablosundan zayıf kelimeler (strength ≤ 2), en fazla 30
  "weakWords": [{ "term": "unlikely", "translation": "olası olmayan" }]
}
```

Diller ISO 639-1 kodudur (`en`, `tr`). Verba tarafı `langName(code)` ile kendi adına çevirir ("English").

### 3.2 `verba.json` (format 1, Faz D)

```jsonc
{
  "app": "verba", "format": 1, "appVersion": "0.7.0", "exportedAt": "…",
  "learner": { "native": "tr", "target": "en", "level": "B1" },
  // weaknessesFrom(signals): kanıtı ≥ 3 olanlar
  "weaknesses": [{ "kind": "correction", "label": "past simple vs present perfect", "evidence": 5, "lastAt": "…" }],
  // avoidance sinyalleri, 3+ oturum
  "avoided": [{ "label": "third conditional", "sessions": 3 }],
  "keptWords": [{ "term": "reluctant", "translation": "isteksiz" }]
}
```

### 3.3 Sözleşmenin yeri

- `docs/BRIDGE.md` (bu dosya) iki repoda da birebir aynı durur.
- Örnek dosyalar (`docs/bridge/sprigo.example.json`, `verba.example.json`) iki tarafın testlerinde fixture olarak kullanılır. Böylece sözleşme değişirse iki tarafın testi de kırılır.

## 4. Fazlar

### Faz A — Sözleşme

| # | İş | Kabul |
|---|---|---|
| A1 | `docs/BRIDGE.md` ve örnek JSON'lar iki repoda | İki dosya birebir aynı |
| A2 | Paylaşılan klasör yolu ve atomik yazma kuralı yazılı | §2 |
| A3 | Dil kodu eşlemesi (`en` ↔ "English") iki tarafta test edilir | Verba `langName`/`langCode` ile gidiş-dönüş |

### Faz B — Sprigo dışa aktarır

| # | İş | Dosya | Kabul |
|---|---|---|---|
| B1 | Migrasyon: `step_progress.completed_at`, `mistakes.step_id` | `src/db.ts` | Eski kayıtlar `NULL` ile açılır, uygulama bozulmaz |
| B2 | `markDone` tarih yazar; `addMistake` o anki `step_id`'yi yazar | `src/db.ts`, `src/Lesson.tsx` | Pratik ve efsanevi dersler kendi adım kimliğini taşır |
| B3 | Saf `buildBridge(profile, enrollment, course, rows, now)` | `src/bridge.ts` | Sınırlar (14 gün / 20 adım / 10 zorluk / 30 kelime) uygulanır; boşsa boş diziler |
| B4 | `bridge.test.ts`: örnek JSON'u üretir | `src/bridge.test.ts` | `pnpm test` fixture ile birebir eşleşir |
| B5 | Rust komutu `bridge_write(json)` ve `bridge_read(name)`: `data_dir/nuvocode/bridge`, tmp + rename | `src-tauri/src/lib.rs` | Klasör yoksa oluşturulur; okumada dosya yoksa `None` |
| B6 | Tetikleyiciler: ders bitince, seviye bitince, açılışta (500 ms gecikmeli, tek sefer) | `src/store.tsx` | Kapalıyken hiç yazmaz |
| B7 | Ayarlar: "Verba ile paylaş" (cihaz başına tek profil) ve son yazılma zamanı | `src/screens/Settings.tsx`, locales | Başka profilde açılırsa önceki kapanır, uyarı çıkar |
| B8 | Kapatınca `sprigo.json` silinir | Rust `bridge_remove` | Verba bir sonraki gün köprüyü görmez |

### Faz C — Verba içe aktarır (Verba reposu)

| # | İş | Dosya | Kabul |
|---|---|---|---|
| C1 | Saf `parseSprigo(raw)` ve `studiedFocus(bridge, today)` | `src/lib/sprigo.ts` | `app`/`format` kontrolü, fazla alanlar yok sayılır, bozuk dosyada `null` |
| C2 | `sprigo.check.ts`: fixture, bozuk dosya, yeni format, yanlış dil | `src/lib/sprigo.check.ts` | `npm run check` |
| C3 | Okuma: `useDay` gün kurarken dosyayı okur (`file_read`, `dataDir` + yol) | `src/lib/useDay.ts:~151` | Dosya yoksa bugünkü davranış aynen sürer |
| C4 | `PlanContext.studied?: { theme, goals[], unitTitle }` | `src/lib/learn.ts:20` | Tip ve `buildDailyPlan` saf kalır |
| C5 | Öncelik: Verba zayıflığı > Sprigo zorluğu > Sprigo'da son bitirilen adımın kalıbı > ilgi alanı rotasyonu. Tema: `ctx.theme` > son ünite başlığı > rotasyon | `src/lib/learn.ts` | `learn.check.ts`: dört senaryo; 120 karakter hedef sınırı korunur |
| C6 | Kelimeler: `recent.vocab` ve `weakWords` → `addVocab(..., {capturedBy:"learner", surface:"Sprigo:<unit.title>"}, "candidate")` | `useDay.ts` | Destede "Sprigo'da tuttun" kaynağıyla aday olarak görünür; tekrar eklemez (UNIQUE) |
| C7 | Plan kartında kaynak satırı: "Sprigo'daki *Third Conditional* adımından" | `src/views/Today.tsx` | Köprü yoksa satır yok |
| C8 | Ayarlar: "Sprigo ilerlemesini kullan", durum (son dosya zamanı, profil, dil uyumu) | `src/views/settings/*` | Dil uymuyorsa "Sprigo English öğretiyor, sen Spanish çalışıyorsun" |
| C9 | Uçtan uca: Sprigo'da adım bitir → Verba'da ertesi gün planı | Elle | Tema, hedef ve aday kelimeler görünür |

**Ürün kararı (Faz C'den önce):** Sprigo zorlukları Verba'da hedef olarak kullanılsın mı, yoksa yalnızca tema mı? Öneri: hedef olsun, ama Verba'nın kendi zayıflığı her zaman önce gelsin (C5).

### Faz D — Verba'dan Sprigo'ya geri besleme

| # | İş | Repo | Kabul |
|---|---|---|---|
| D1 | Verba `verba.json` yazar: gün kapanışında ve recap sonrası | verba `useDay.ts` | §3.2; kapalıyken yazmaz |
| D2 | `verba.check.ts` / `bridge.test.ts`: iki taraf aynı fixture'ı okur | ikisi | Sözleşme testi |
| D3 | Sprigo `verba.json`'u okur, `label`'ı kurstaki adımlarla eşler: önce kalıp metni benzerliği, sonra AI ile tek seferlik eşleme ve önbellek | Sprigo `src/bridge.ts` | Eşleşmeyen etiket sessizce atlanır |
| D4 | Öğren ekranı: eşleşen bitmiş adımlarda "Verba'da zorlandın, tekrar et" rozeti | `src/screens/Learn.tsx` | Rozet tıklanınca adımın tekrar dersi açılır |
| D5 | Pratik: "Verba'dan gelenler" kişisel ders (mevcut hata kişiselleştirmesine `weaknesses` eklenir) | `src/lessons.ts` | Prompt'a en fazla 3 zayıflık |
| D6 | `avoided` kalıplar: ilgili adımın efsanevi dersi önerilir | `Learn.tsx` | — |

### Faz E — Rol dağılımı

| # | İş | Kabul |
|---|---|---|
| E1 | Sprigo Rol Yapma: serbest sohbet yerine ünite sonu 3–5 turluk, ünite kelimeleri ve kalıbıyla sınırlı konuşma | Ünite yolunda "Konuşma" düğümü |
| E2 | "Serbest konuşma için Verba" kartı: Verba kuruluysa açar, değilse indirme sayfası | Tespit: bilinen kurulum yolları; açma: opener |
| E3 | Hikâyeler: kısa, üniteye bağlı; uzun okuma Verba'da | — |
| E4 | README'lerde karşılıklı bölüm: "Birlikte nasıl çalışırlar" | İki repo |

## 5. Riskler

| Risk | Önlem |
|---|---|
| Birden fazla Sprigo profili | Cihaz başına tek paylaşılan profil (B7) |
| Dil uyumsuzluğu | Verba yalnızca `target` kendi hedef diliyle eşleşirse kullanır (C8) |
| Destenin Sprigo kelimeleriyle dolması | Aday statüsü, en fazla 30 zayıf kelime, `worthLearning` filtresi |
| Sözleşme kayması | Ortak fixture; iki testin de kırılması (A1, D2) |
| Verba'nın kanıt ilkesinin delinmesi | Sprigo verisi `signals`'a hiç yazılmaz (ilke 3) |
| Gizlilik | Dosya yerelde; ad dışında kişisel veri yok; kapatınca dosya silinir (B8) |
| Bozuk ya da yarım dosya | Atomik yazma, okumada doğrulama, hata durumunda köprüsüz davranış |

## 6. Kapsam dışı (şimdilik)

- Derin bağlantı (`verba://`): E2 için gerekmez.
- Gerçek zamanlı senkron ve dosya izleyici.
- Cihazlar arası köprü: Verba'nın sync klasörü ayrı bir konu.
- Ortak kod paketi (sağlayıcılar, whisper).
